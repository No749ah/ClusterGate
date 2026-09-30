import { describe, it, expect, vi, beforeEach } from 'vitest'

// Capture the outgoing upstream request instead of performing it.
const axiosMock = vi.hoisted(() => vi.fn())
vi.mock('axios', () => ({ default: axiosMock }))
vi.mock('../../lib/prisma', () => ({ prisma: {} }))

import { proxyRequest } from '../proxyService'

function makeReq(headers: Record<string, string>) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]))
  return {
    method: 'GET',
    path: '/r/app/page',
    headers: lower,
    query: {},
    ip: '203.0.113.5',
    protocol: 'https',
    hostname: 'gate.example.com',
    socket: { remoteAddress: '203.0.113.5' },
    get: (key: string) => lower[key.toLowerCase()],
  } as any
}

const route = {
  id: 'route-1',
  publicPath: '/r/app/*',
  targetUrl: 'http://app.default.svc:8080',
  ipAllowlist: [],
  removeHeaders: [],
  addHeaders: {},
  rewriteRules: [],
  stripPrefix: false,
  timeout: 1000,
  retryCount: 0,
  circuitBreakerEnabled: false,
  requireAuth: false,
  authType: 'NONE',
} as any

async function forwardedHeaders(headers: Record<string, string>): Promise<Record<string, string>> {
  await proxyRequest(route, makeReq(headers), {} as any).catch(() => {})
  expect(axiosMock).toHaveBeenCalled()
  return axiosMock.mock.calls[0][0].headers
}

describe('proxyRequest — ClusterGate cookies', () => {
  beforeEach(() => {
    axiosMock.mockReset()
    axiosMock.mockRejectedValue(new Error('upstream not reachable in test'))
  })

  it('does not forward the cg_session / cg_csrf cookies upstream', async () => {
    const fwd = await forwardedHeaders({ Cookie: 'app=1; cg_session=secret.jwt; cg_csrf=tok; theme=dark' })
    expect(fwd['cookie']).toBe('app=1; theme=dark')
    expect(JSON.stringify(fwd)).not.toContain('secret.jwt')
  })

  it('drops the Cookie header entirely when only ClusterGate cookies were sent', async () => {
    const fwd = await forwardedHeaders({ Cookie: 'cg_session=secret.jwt; cg_csrf=tok' })
    expect(fwd).not.toHaveProperty('cookie')
    expect(JSON.stringify(fwd)).not.toContain('secret.jwt')
  })

  it('forwards application cookies untouched', async () => {
    const fwd = await forwardedHeaders({ Cookie: 'n8n-auth=xyz' })
    expect(fwd['cookie']).toBe('n8n-auth=xyz')
  })
})
