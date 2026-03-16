import { Request, Response, NextFunction } from 'express'
import crypto from 'crypto'
import { config } from '../config'

/**
 * CSRF protection using the double-submit cookie pattern.
 *
 * - On every response, sets a `cg_csrf` cookie (non-httpOnly so JS can read it).
 * - For state-changing requests (POST/PUT/PATCH/DELETE), validates that the
 *   `X-CSRF-Token` header matches the `cg_csrf` cookie.
 * - Skips validation for:
 *   - Bearer token auth (API keys aren't vulnerable to CSRF)
 *   - Requests without a session cookie (not authenticated via cookies)
 *   - SSE streams and health endpoints
 */

const CSRF_COOKIE = 'cg_csrf'
const CSRF_HEADER = 'x-csrf-token'
const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

const EXEMPT_PATHS = [
  '/api/health',
  '/api/traffic/live',
  '/metrics',
]

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  // Always set/refresh the CSRF token cookie
  if (!req.cookies?.[CSRF_COOKIE]) {
    const token = generateToken()
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false, // JS must be able to read this
      secure: config.isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days, matches session cookie
    })
  }

  // Only validate state-changing methods
  if (!STATE_CHANGING_METHODS.has(req.method)) {
    return next()
  }

  // Skip CSRF for exempt paths
  if (EXEMPT_PATHS.some(p => req.path.startsWith(p))) {
    return next()
  }

  // Skip CSRF for Bearer token auth (not vulnerable to CSRF)
  if (req.headers.authorization?.startsWith('Bearer ')) {
    return next()
  }

  // Skip CSRF if no session cookie (not authenticated via cookies)
  if (!req.cookies?.cg_session) {
    return next()
  }

  // Validate: header token must match cookie token
  const cookieToken = req.cookies[CSRF_COOKIE]
  const headerToken = req.headers[CSRF_HEADER]

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'CSRF_VALIDATION_FAILED',
        message: 'CSRF token validation failed',
      },
    })
  }

  next()
}
