import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response, NextFunction } from 'express'

// Mock the config module before importing the middleware
vi.mock('../../config', () => ({
  config: {
    isProd: false,
    JWT_SECRET: 'test-jwt-secret-that-is-at-least-32-chars-long!!',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    NODE_ENV: 'test',
  },
}))

import { csrfProtection } from '../csrf'

// Helpers to create mock Express objects
function createMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    method: 'GET',
    path: '/api/routes',
    cookies: {},
    headers: {},
    ...overrides,
  } as unknown as Request
}

function createMockResponse(): Response & { _status: number; _json: any; _cookies: Record<string, any> } {
  const res: any = {
    _status: 0,
    _json: null,
    _cookies: {},
    status(code: number) {
      res._status = code
      return res
    },
    json(data: any) {
      res._json = data
      return res
    },
    cookie(name: string, value: any, options: any) {
      res._cookies[name] = { value, options }
      return res
    },
  }
  return res
}

describe('csrfProtection middleware', () => {
  let next: NextFunction

  beforeEach(() => {
    next = vi.fn()
  })

  describe('GET requests', () => {
    it('allows GET requests without any CSRF token', () => {
      const req = createMockRequest({ method: 'GET' })
      const res = createMockResponse()

      csrfProtection(req, res, next)

      expect(next).toHaveBeenCalledOnce()
      expect(res._status).toBe(0) // not set, meaning no error response
    })

    it('allows HEAD requests without any CSRF token', () => {
      const req = createMockRequest({ method: 'HEAD' })
      const res = createMockResponse()

      csrfProtection(req, res, next)

      expect(next).toHaveBeenCalledOnce()
    })

    it('allows OPTIONS requests without any CSRF token', () => {
      const req = createMockRequest({ method: 'OPTIONS' })
      const res = createMockResponse()

      csrfProtection(req, res, next)

      expect(next).toHaveBeenCalledOnce()
    })
  })

  describe('CSRF cookie setting', () => {
    it('sets a CSRF cookie if none is present', () => {
      const req = createMockRequest({ method: 'GET', cookies: {} })
      const res = createMockResponse()

      csrfProtection(req, res, next)

      expect(res._cookies['cg_csrf']).toBeDefined()
      expect(res._cookies['cg_csrf'].value).toBeTruthy()
      expect(typeof res._cookies['cg_csrf'].value).toBe('string')
      // 32 bytes hex = 64 chars
      expect(res._cookies['cg_csrf'].value).toHaveLength(64)
    })

    it('sets the cookie as non-httpOnly so JS can read it', () => {
      const req = createMockRequest({ method: 'GET', cookies: {} })
      const res = createMockResponse()

      csrfProtection(req, res, next)

      expect(res._cookies['cg_csrf'].options.httpOnly).toBe(false)
    })

    it('does not set a new cookie if one already exists', () => {
      const req = createMockRequest({
        method: 'GET',
        cookies: { cg_csrf: 'existing-token-value' },
      })
      const res = createMockResponse()

      csrfProtection(req, res, next)

      expect(res._cookies['cg_csrf']).toBeUndefined()
    })
  })

  describe('POST with session cookie (CSRF enforced)', () => {
    it('blocks POST when session cookie exists but no CSRF token', () => {
      const req = createMockRequest({
        method: 'POST',
        path: '/api/routes',
        cookies: { cg_session: 'session-token', cg_csrf: 'csrf-token-123' },
        headers: {},
      })
      const res = createMockResponse()

      csrfProtection(req, res, next)

      expect(next).not.toHaveBeenCalled()
      expect(res._status).toBe(403)
      expect(res._json.error.code).toBe('CSRF_VALIDATION_FAILED')
    })

    it('blocks POST when CSRF header does not match cookie', () => {
      const req = createMockRequest({
        method: 'POST',
        path: '/api/routes',
        cookies: { cg_session: 'session-token', cg_csrf: 'csrf-token-123' },
        headers: { 'x-csrf-token': 'wrong-token-456' },
      })
      const res = createMockResponse()

      csrfProtection(req, res, next)

      expect(next).not.toHaveBeenCalled()
      expect(res._status).toBe(403)
      expect(res._json.success).toBe(false)
    })

    it('allows POST when CSRF header matches cookie', () => {
      const csrfToken = 'valid-csrf-token-abc123'
      const req = createMockRequest({
        method: 'POST',
        path: '/api/routes',
        cookies: { cg_session: 'session-token', cg_csrf: csrfToken },
        headers: { 'x-csrf-token': csrfToken },
      })
      const res = createMockResponse()

      csrfProtection(req, res, next)

      expect(next).toHaveBeenCalledOnce()
    })

    it('blocks PUT without matching CSRF token', () => {
      const req = createMockRequest({
        method: 'PUT',
        path: '/api/routes/1',
        cookies: { cg_session: 'session-token', cg_csrf: 'csrf-abc' },
        headers: {},
      })
      const res = createMockResponse()

      csrfProtection(req, res, next)

      expect(next).not.toHaveBeenCalled()
      expect(res._status).toBe(403)
    })

    it('blocks PATCH without matching CSRF token', () => {
      const req = createMockRequest({
        method: 'PATCH',
        path: '/api/routes/1',
        cookies: { cg_session: 'session-token', cg_csrf: 'csrf-abc' },
        headers: {},
      })
      const res = createMockResponse()

      csrfProtection(req, res, next)

      expect(next).not.toHaveBeenCalled()
      expect(res._status).toBe(403)
    })

    it('blocks DELETE without matching CSRF token', () => {
      const req = createMockRequest({
        method: 'DELETE',
        path: '/api/routes/1',
        cookies: { cg_session: 'session-token', cg_csrf: 'csrf-abc' },
        headers: {},
      })
      const res = createMockResponse()

      csrfProtection(req, res, next)

      expect(next).not.toHaveBeenCalled()
      expect(res._status).toBe(403)
    })
  })

  describe('CSRF bypass — Bearer auth', () => {
    it('allows POST with Bearer auth even without CSRF token', () => {
      const req = createMockRequest({
        method: 'POST',
        path: '/api/routes',
        cookies: { cg_session: 'session-token', cg_csrf: 'csrf-abc' },
        headers: { authorization: 'Bearer some-api-key-token' },
      })
      const res = createMockResponse()

      csrfProtection(req, res, next)

      expect(next).toHaveBeenCalledOnce()
    })
  })

  describe('CSRF bypass — no session cookie', () => {
    it('allows POST without session cookie even without CSRF token', () => {
      const req = createMockRequest({
        method: 'POST',
        path: '/api/routes',
        cookies: {},
        headers: {},
      })
      const res = createMockResponse()

      csrfProtection(req, res, next)

      expect(next).toHaveBeenCalledOnce()
    })
  })

  describe('CSRF bypass — exempt paths', () => {
    it('allows POST to /api/health without CSRF', () => {
      const req = createMockRequest({
        method: 'POST',
        path: '/api/health',
        cookies: { cg_session: 'session-token' },
        headers: {},
      })
      const res = createMockResponse()

      csrfProtection(req, res, next)

      expect(next).toHaveBeenCalledOnce()
    })

    it('allows POST to /api/traffic/live without CSRF', () => {
      const req = createMockRequest({
        method: 'POST',
        path: '/api/traffic/live',
        cookies: { cg_session: 'session-token' },
        headers: {},
      })
      const res = createMockResponse()

      csrfProtection(req, res, next)

      expect(next).toHaveBeenCalledOnce()
    })

    it('allows POST to /metrics without CSRF', () => {
      const req = createMockRequest({
        method: 'POST',
        path: '/metrics',
        cookies: { cg_session: 'session-token' },
        headers: {},
      })
      const res = createMockResponse()

      csrfProtection(req, res, next)

      expect(next).toHaveBeenCalledOnce()
    })
  })
})
