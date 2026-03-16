import { Request, Response, NextFunction } from 'express'
import { verifyToken, JWTPayload } from '../lib/jwt'
import { prisma } from '../lib/prisma'
import { AppError } from '../lib/errors'
import { Role } from '@prisma/client'

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string
        email: string
        role: Role
      }
    }
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    // Try cookie first, then Authorization header
    const token =
      req.cookies?.cg_session ||
      (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice(7)
        : null)

    if (!token) {
      throw AppError.unauthorized()
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

    req.user = {
      userId: user.id,
      email: user.email,
      role: user.role,
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
