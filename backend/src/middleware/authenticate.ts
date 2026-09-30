import { Request, Response, NextFunction } from 'express'
import { verifyToken, JWTPayload } from '../lib/jwt'
import { prisma } from '../lib/prisma'
import { AppError } from '../lib/errors'
import { validateSession } from '../services/sessionService'
import { Role } from '@prisma/client'
import {
  CLIENT_TOKEN_HEADER,
  CLIENT_TOKEN_QUERY,
  clientTokenRequired,
  countSessionCookies,
  isTopLevelNavigation,
  isValidClientToken,
} from '../lib/clientToken'

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string
        email: string
        role: Role
        sessionId?: string
      }
    }
  }
}

export interface AuthenticateOptions {
  /**
   * Skip the client-token check for cookie sessions. Only for endpoints whose
   * response is safe to hand to any same-origin script (the resume redirect
   * and the public OpenAPI spec).
   */
  skipClientToken?: boolean
}

/**
 * Cookie sessions must prove the call comes from the ClusterGate UI and not
 * from JavaScript of an app exposed under /r/ on the same origin.
 */
function hasClientProof(req: Request, sessionJwt: string): boolean {
  if (isValidClientToken(sessionJwt, req.get(CLIENT_TOKEN_HEADER))) return true
  if (isTopLevelNavigation(req)) return true
  // EventSource cannot set headers; accept the token in the query for SSE only.
  if (req.method === 'GET' && (req.get('accept') || '').includes('text/event-stream')) {
    return isValidClientToken(sessionJwt, req.query?.[CLIENT_TOKEN_QUERY])
  }
  return false
}

export function createAuthenticate(options: AuthenticateOptions = {}) {
  return (req: Request, res: Response, next: NextFunction) => authenticateRequest(req, res, next, options)
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  return authenticateRequest(req, res, next, {})
}

async function authenticateRequest(req: Request, res: Response, next: NextFunction, options: AuthenticateOptions) {
  try {
    // Try cookie first, then Authorization header
    const cookieToken: string | undefined = req.cookies?.cg_session
    const token =
      cookieToken ||
      (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice(7)
        : null)

    if (!token) {
      throw AppError.unauthorized()
    }

    if (cookieToken) {
      // A second cg_session (e.g. one planted with a narrower Path by a
      // same-origin page) would shadow the real one. Refuse the ambiguity.
      if (countSessionCookies(req.headers.cookie) > 1) {
        throw AppError.unauthorized('Ambiguous session cookie')
      }
    }

    let payload: JWTPayload
    try {
      payload = verifyToken(token)
    } catch {
      // Clear stale/invalid cookie to prevent redirect loops
      res.clearCookie('cg_session', { path: '/' })
      throw AppError.unauthorized('Invalid or expired token')
    }

    // Verify user still exists and is active
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, role: true, isActive: true, tokenVersion: true },
    })

    if (!user || !user.isActive) {
      res.clearCookie('cg_session', { path: '/' })
      throw AppError.unauthorized('Account not found or deactivated')
    }

    // Check token version for session revocation
    if (payload.tokenVersion !== undefined && payload.tokenVersion !== user.tokenVersion) {
      res.clearCookie('cg_session', { path: '/' })
      throw AppError.unauthorized('Session has been revoked')
    }

    // Per-session revocation: tokens minted with a session id must map to a
    // live session. Legacy tokens without a sid still work until they expire.
    if (payload.sid) {
      const ok = await validateSession(payload.sid, req.ip)
      if (!ok) {
        res.clearCookie('cg_session', { path: '/' })
        throw AppError.unauthorized('Session has been revoked')
      }
    }

    // Checked last so a stale or revoked cookie still gets UNAUTHORIZED (and
    // is cleared) instead of sending the UI into a resume round-trip.
    if (cookieToken && !options.skipClientToken && clientTokenRequired() && !hasClientProof(req, cookieToken)) {
      throw new AppError(401, 'CLIENT_TOKEN_REQUIRED', 'Missing or invalid client token')
    }

    req.user = {
      userId: user.id,
      email: user.email,
      role: user.role,
      sessionId: payload.sid,
    }

    next()
  } catch (err) {
    next(err)
  }
}

export function authorize(roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(AppError.unauthorized())
    }
    if (!roles.includes(req.user.role)) {
      return next(AppError.forbidden())
    }
    next()
  }
}
