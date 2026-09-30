import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import http from 'http'
import type { AddressInfo } from 'net'

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

import express from 'express'
import cookieParser from 'cookie-parser'
import { prisma } from '../../lib/prisma'
import { signToken } from '../../lib/jwt'
import { deriveClientToken } from '../../lib/clientToken'
import { config } from '../../config'
import { authenticate, createAuthenticate } from '../authenticate'
import { errorHandler } from '../errorHandler'
import authRouter from '../../routes/auth.router'

const findUser = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>

const app = express()
app.use(cookieParser())
app.get('/api/thing', authenticate, (req, res) => res.json({ ok: true, user: req.user!.userId }))
app.get('/api/open-spec', createAuthenticate({ skipClientToken: true }), (_req, res) => res.json({ ok: true }))
app.post('/api/thing', authenticate, (_req, res) => res.json({ ok: true }))
app.use('/api/auth', authRouter)
app.use(errorHandler)

let server: http.Server
let port: number

beforeAll(async () => {
  server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  port = (server.address() as AddressInfo).port
})
afterAll(() => server.close())

const jwt = signToken({ userId: 'u1', email: 'a@b.c', role: 'ADMIN' as any, tokenVersion: 0 })
const clientToken = deriveClientToken(jwt)
const NAV = { 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document', 'Sec-Fetch-Site': 'same-origin' }
const FETCH = { 'Sec-Fetch-Mode': 'cors', 'Sec-Fetch-Dest': 'empty', 'Sec-Fetch-Site': 'same-origin' }

function call(method: string, path: string, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: any }>((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method, path, headers }, (res) => {
      let data = ''
      res.on('data', (c) => (data += c))
      res.on('end', () => {
        let body: any = data
        try { body = JSON.parse(data) } catch { /* not json */ }
        resolve({ status: res.statusCode!, headers: res.headers, body })
      })
    })
    r.on('error', reject)
    r.end()
  })
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
    expect(res.body.error.code).toBe('CLIENT_TOKEN_REQUIRED')
    // The session itself is fine, so the cookie must not be cleared.
    expect(res.headers['set-cookie']).toBeUndefined()
  })

  it('accepts the cookie together with the matching client token', async () => {
    const res = await call('GET', '/api/thing', { Cookie: `cg_session=${jwt}`, 'X-CG-Client-Token': clientToken, ...FETCH })
    expect(res.status).toBe(200)
    expect(res.body.user).toBe('u1')
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
    expect(res.body.error.code).toBe('UNAUTHORIZED')
  })

  it('reports an invalid cookie as UNAUTHORIZED, not as a missing client token', async () => {
    const res = await call('GET', '/api/thing', { Cookie: 'cg_session=garbage' })
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHORIZED')
  })

  it('can be skipped per endpoint and switched off globally', async () => {
    expect((await call('GET', '/api/open-spec', { Cookie: `cg_session=${jwt}` })).status).toBe(200)
    ;(config as any).API_CLIENT_TOKEN_REQUIRED = 'false'
    expect((await call('GET', '/api/thing', { Cookie: `cg_session=${jwt}` })).status).toBe(200)
  })
})

describe('GET /api/auth/resume', () => {
  it('redirects a top-level navigation back into the UI with the token in the fragment', async () => {
    const res = await call('GET', '/api/auth/resume?to=%2Froutes%2Fabc%3Ftab%3Dlogs', { Cookie: `cg_session=${jwt}`, ...NAV })
    expect(res.status).toBe(303)
    expect(res.headers.location).toBe(`/routes/abc?tab=logs#cg_ct=${encodeURIComponent(clientToken)}`)
    expect(res.headers['cache-control']).toBe('no-store')
  })

  it('refuses fetch() callers, so scripts cannot read the token', async () => {
    const res = await call('GET', '/api/auth/resume?to=%2Fdashboard', { Cookie: `cg_session=${jwt}`, ...FETCH })
    expect(res.status).toBe(400)
    expect(res.headers.location).toBeUndefined()
    const bare = await call('GET', '/api/auth/resume?to=%2Fdashboard', { Cookie: `cg_session=${jwt}` })
    expect(bare.status).toBe(400)
  })

  it('never lands the token on a proxied or API path', async () => {
    for (const to of ['/r/evil/', '/R/evil', '/api/routes', '//evil.example/', 'https://evil.example/']) {
      const res = await call('GET', `/api/auth/resume?to=${encodeURIComponent(to)}`, { Cookie: `cg_session=${jwt}`, ...NAV })
      expect(res.status, to).toBe(303)
      expect(res.headers.location, to).toMatch(/^\/dashboard#cg_ct=/)
    }
  })

  it('sends a missing or dead session to the login page and clears the cookie', async () => {
    const none = await call('GET', '/api/auth/resume?to=%2Froutes', NAV)
    expect(none.headers.location).toBe('/login?redirect=%2Froutes')

    findUser.mockResolvedValue(null)
    const dead = await call('GET', '/api/auth/resume?to=%2Froutes', { Cookie: `cg_session=${jwt}`, ...NAV })
    expect(dead.status).toBe(303)
    expect(dead.headers.location).toBe('/login?redirect=%2Froutes')
    expect(String(dead.headers['set-cookie'])).toMatch(/cg_session=;/)
  })
})
