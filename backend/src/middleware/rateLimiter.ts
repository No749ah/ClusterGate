import { Request, Response, NextFunction } from 'express'
import rateLimit from 'express-rate-limit'
import { config } from '../config'
import { checkRateLimit } from '../lib/rateLimitStore'

interface SharedLimiterOptions {
  /** Counter namespace — keys are stored as `${scope}:${clientIp}` */
  scope: string
  max: number
  windowMs: number
  message: string
  /** Throttle instead of allowing traffic when the counter store errors */
  failClosed?: boolean
  skip?: (req: Request) => boolean
}

/**
 * Fixed-window limiter backed by the shared Postgres counter, so limits hold
 * across replicas. express-rate-limit's in-memory store is per pod — with N
 * replicas the effective limit silently becomes N×max, which is useless as
 * brute-force protection in HA setups.
 */
function sharedRateLimiter(opts: SharedLimiterOptions) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (opts.skip?.(req)) return next()
      const result = await checkRateLimit(opts.scope, req.ip || 'unknown', opts.max, opts.windowMs, {
        failClosed: opts.failClosed,
      })
      // draft-6 standard rate-limit headers (same as standardHeaders: true)
      res.setHeader('RateLimit-Limit', String(opts.max))
      res.setHeader('RateLimit-Remaining', String(result.remaining))
      res.setHeader('RateLimit-Reset', String(Math.max(0, Math.ceil((result.resetAt - Date.now()) / 1000))))
      if (!result.allowed) {
        return res.status(429).json({
          success: false,
          error: { code: 'TOO_MANY_REQUESTS', message: opts.message },
        })
      }
      next()
    } catch (err) {
      next(err)
    }
  }
}

// Each limiter is a two-stage chain: an in-memory express-rate-limit
// instance in front of the shared Postgres counter. The in-memory stage is a
// per-pod backstop — with the same max it never fires before the shared
// counter does (which counts across all replicas), but it keeps a hard cap
// in place when the counter store is unavailable (the shared global limiter
// is fail-open by design so the API never hard-fails on a DB outage). The
// shared stage overwrites the RateLimit-* headers with the accurate
// cross-replica values.

const globalMemoryLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'TOO_MANY_REQUESTS', message: 'Too many requests, please try again later' },
  },
  skip: (req) => req.path === '/api/health/live' || req.path === '/api/health/ready',
})

export const globalLimiter = [
  globalMemoryLimiter,
  sharedRateLimiter({
    scope: 'global',
    max: config.RATE_LIMIT_MAX,
    windowMs: config.RATE_LIMIT_WINDOW_MS,
    message: 'Too many requests, please try again later',
    skip: (req) => req.path === '/api/health/live' || req.path === '/api/health/ready',
  }),
]

// Brute-force protection on login/2FA/setup/invite. The shared stage is
// fail-closed: when the counter store is unavailable we throttle rather than
// allow unlimited credential guessing.
const authMemoryLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'TOO_MANY_REQUESTS', message: 'Too many authentication attempts' },
  },
})

export const authLimiter = [
  authMemoryLimiter,
  sharedRateLimiter({
    scope: 'auth',
    max: config.AUTH_RATE_LIMIT_MAX,
    windowMs: config.RATE_LIMIT_WINDOW_MS,
    message: 'Too many authentication attempts',
    failClosed: true,
  }),
]

// Proxy traffic keeps the lightweight in-memory limiter as a coarse per-pod
// safety valve (no DB roundtrip per proxied request). Accurate shared
// per-route limits are enforced inside the proxy via checkRateLimit when a
// route enables rate limiting.
export const proxyLimiter = rateLimit({
  windowMs: 60000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'TOO_MANY_REQUESTS', message: 'Too many proxy requests' },
  },
})
