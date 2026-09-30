import { describe, it, expect, vi, beforeEach } from 'vitest'

// DB and session layers are mocked; JWTs are signed for real with the test secret.
vi.mock('../../lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
  },
}))
vi.mock('../../services/sessionService', () => ({
  validateSession: vi.fn(async () => true),
  issueSession: vi.fn(),
  listSessions: vi.fn(),
  revokeSession: vi.fn(),
  revokeOtherSessions: vi.fn(),
}))
vi.mock('../../services/auditService', () => ({ createAuditLog: vi.fn() }))
vi.mock('../../services/authService', () => ({}))
vi.mock('../../services/inviteService', () => ({}))
vi.mock('../../services/twoFactorService', () => ({}))
vi.mock('../../services/achievementService', () => ({ achievementService: {} }))

import { prisma } from '../../lib/prisma'
import { signToken } from '../../lib/jwt'
import { deriveClientToken } from '../../lib/clientToken'
import { config } from '../../config'
import { AppError } from '../../lib/errors'
import { authenticate, createAuthenticate } from '../authenticate'
import { resumeHandler } from '../../routes/auth.router'

const findUser = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>

const jwt = signToken({ userId: 'u1', email: 'a@b.c', role: 'ADMIN' as any, tokenVersion: 0 })
const clientToken = deriveClientToken(jwt)
const NAV = { 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document', 'Sec-Fetch-Site': 'same-origin' }
const FETCH = { 'Sec-Fetch-Mode': 'cors', 'Sec-Fetch-Dest': 'empty', 'Sec-Fetch-Site': 'same-origin' }

type Result = { status: number; code?: string; location?: string; headers: Record<string, string>; clearedSession: boolean }

// Minimal Express-like request/response doubles; cookies are parsed the way
// cookie-parser does (first value wins) while the raw header is kept.
function makeReq(method: string, path: string, headers: Record<string, string>) {
  const lower: Record<string, string> = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]))
  const [pathname, qs = ''] = path.split('?')
  const cookies: Record<string, string> = {}
  for (const part of (lower.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k && !(k in cookies)) cookies[k] = v.join('=')
  }
  return {
    method,
    path: pathname,
    headers: lower,
    cookies,
    query: Object.fromEntries(new URLSearchParams(qs)),
    ip: '127.0.0.1',
    get: (name: string) => lower[name.toLowerCase()],
  } as any
}

function makeRes(result: Result) {
  return {
    setHeader: (k: string, v: string) => { result.headers[k.toLowerCase()] = v },
    clearCookie: (name: string) => { if (name === 'cg_session') result.clearedSession = true },
    redirect: (status: number, url: string) => { result.status = status; result.location = url },
  } as any
}

async function runAuth(mw: any, method: string, path: string, headers: Record<string, string> = {}): Promise<Result> {
  const result: Result = { status: 0, headers: {}, clearedSession: false }
  const req = makeReq(method, path, headers)
  await new Promise<void>((resolve) => {
    mw(req, makeRes(result), (err?: unknown) => {
      if (err instanceof AppError) { result.status = err.statusCode; result.code = err.code }
      else if (err) { result.status = 500 }
      else { result.status = 200 }
      resolve()
    })
  })
  return result
}

const call = (method: string, path: string, headers: Record<string, string> = {}) => runAuth(authenticate, method, path, headers)

async function resume(path: string, headers: Record<string, string> = {}): Promise<Result> {
  const result: Result = { status: 0, headers: {}, clearedSession: false }
  const req = makeReq('GET', path, headers)
  await new Promise<void>((resolve) => {
    const res = makeRes(result)
    const redirect = res.redirect
    res.redirect = (status: number, url: string) => { redirect(status, url); resolve() }
    resumeHandler(req, res, (err?: unknown) => {
      if (err instanceof AppError) { result.status = err.statusCode; result.code = err.code }
      resolve()
    })
  })
  return result
}

beforeEach(() => {
  findUser.mockReset()
  findUser.mockResolvedValue({ id: 'u1', email: 'a@b.c', role: 'ADMIN', isActive: true, tokenVersion: 0 })
  ;(config as any).API_CLIENT_TOKEN_REQUIRED = undefined
})

describe('authenticate — client token for cookie sessions', () => {
  it('rejects a cookie-only fetch (what an app under /r/ would send)', async () => {
    const res = await call('GET', '/api/thing', { Cookie: `cg_session=${jwt}`, ...FETCH })
    expect(res.status).toBe(401)
    expect(res.code).toBe('CLIENT_TOKEN_REQUIRED')
    // The session itself is fine, so the cookie must not be cleared.
    expect(res.clearedSession).toBe(false)
  })

  it('accepts the cookie together with the matching client token', async () => {
    const res = await call('GET', '/api/thing', { Cookie: `cg_session=${jwt}`, 'X-CG-Client-Token': clientToken, ...FETCH })
    expect(res.status).toBe(200)
  })

  it('rejects a client token that belongs to another session', async () => {
    const other = deriveClientToken(signToken({ userId: 'u2', email: 'x@y.z', role: 'VIEWER' as any, tokenVersion: 0 }))
    const res = await call('GET', '/api/thing', { Cookie: `cg_session=${jwt}`, 'X-CG-Client-Token': other })
    expect(res.status).toBe(401)
  })

  it('lets top-level GET navigations through (links, downloads)', async () => {
    const res = await call('GET', '/api/thing', { Cookie: `cg_session=${jwt}`, ...NAV })
    expect(res.status).toBe(200)
  })

  it('does not treat a navigating POST or an iframe as a navigation', async () => {
    expect((await call('POST', '/api/thing', { Cookie: `cg_session=${jwt}`, ...NAV })).status).toBe(401)
    expect((await call('GET', '/api/thing', { Cookie: `cg_session=${jwt}`, ...NAV, 'Sec-Fetch-Dest': 'iframe' })).status).toBe(401)
  })

  it('accepts the token as query parameter for SSE only', async () => {
    const q = `?cg_ct=${encodeURIComponent(clientToken)}`
    expect((await call('GET', `/api/thing${q}`, { Cookie: `cg_session=${jwt}`, Accept: 'text/event-stream' })).status).toBe(200)
    expect((await call('GET', `/api/thing${q}`, { Cookie: `cg_session=${jwt}`, Accept: 'application/json' })).status).toBe(401)
  })

  it('does not require the client token for bearer auth', async () => {
    const res = await call('GET', '/api/thing', { Authorization: `Bearer ${jwt}` })
    expect(res.status).toBe(200)
  })

  it('refuses two cg_session cookies (a planted one would shadow the real one)', async () => {
    const res = await call('GET', '/api/thing', {
      Cookie: `cg_session=${jwt}; cg_session=${jwt}`,
      'X-CG-Client-Token': clientToken,
    })
    expect(res.status).toBe(401)
    expect(res.code).toBe('UNAUTHORIZED')
  })

  it('reports an invalid cookie as UNAUTHORIZED, not as a missing client token', async () => {
    const res = await call('GET', '/api/thing', { Cookie: 'cg_session=garbage' })
    expect(res.status).toBe(401)
    expect(res.code).toBe('UNAUTHORIZED')
  })

  it('can be skipped per endpoint and switched off globally', async () => {
    expect((await runAuth(createAuthenticate({ skipClientToken: true }), 'GET', '/api/docs.json', { Cookie: `cg_session=${jwt}` })).status).toBe(200)
    ;(config as any).API_CLIENT_TOKEN_REQUIRED = 'false'
    expect((await call('GET', '/api/thing', { Cookie: `cg_session=${jwt}` })).status).toBe(200)
  })
})

describe('GET /api/auth/resume', () => {
  it('redirects a top-level navigation back into the UI with the token in the fragment', async () => {
    const res = await resume('/api/auth/resume?to=%2Froutes%2Fabc%3Ftab%3Dlogs', { Cookie: `cg_session=${jwt}`, ...NAV })
    expect(res.status).toBe(303)
    expect(res.location).toBe(`/routes/abc?tab=logs#cg_ct=${encodeURIComponent(clientToken)}`)
    expect(res.headers['cache-control']).toBe('no-store')
  })

  it('refuses fetch() callers, so scripts cannot read the token', async () => {
    const res = await resume('/api/auth/resume?to=%2Fdashboard', { Cookie: `cg_session=${jwt}`, ...FETCH })
    expect(res.status).toBe(400)
    expect(res.location).toBeUndefined()
    const bare = await resume('/api/auth/resume?to=%2Fdashboard', { Cookie: `cg_session=${jwt}` })
    expect(bare.status).toBe(400)
  })

  it('never lands the token on a proxied or API path', async () => {
    for (const to of ['/r/evil/', '/R/evil', '/api/routes', '//evil.example/', 'https://evil.example/']) {
      const res = await resume(`/api/auth/resume?to=${encodeURIComponent(to)}`, { Cookie: `cg_session=${jwt}`, ...NAV })
      expect(res.status, to).toBe(303)
      expect(res.location, to).toMatch(/^\/dashboard#cg_ct=/)
    }
  })

  it('sends a missing or dead session to the login page and clears the cookie', async () => {
    const none = await resume('/api/auth/resume?to=%2Froutes', NAV)
    expect(none.location).toBe('/login?redirect=%2Froutes')

    findUser.mockResolvedValue(null)
    const dead = await resume('/api/auth/resume?to=%2Froutes', { Cookie: `cg_session=${jwt}`, ...NAV })
    expect(dead.status).toBe(303)
    expect(dead.location).toBe('/login?redirect=%2Froutes')
    expect(dead.clearedSession).toBe(true)
  })
})
