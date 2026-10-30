import { describe, it, expect, vi, beforeEach } from 'vitest'

// Capture the outgoing upstream request instead of performing it.
const axiosMock = vi.hoisted(() => vi.fn())
vi.mock('axios', () => ({ default: axiosMock }))
vi.mock('../../lib/prisma', () => ({ prisma: {} }))

import { proxyRequest } from '../proxyService'

function makeReq(path: string) {
  return {
    method: 'GET',
    path,
    headers: {},
    query: {},
    ip: '203.0.113.5',
    protocol: 'https',
    hostname: 'gate.example.com',
    socket: { remoteAddress: '203.0.113.5' },
    get: () => undefined,
  } as any
}

function makeRoute(pathAllowlist: string[]) {
  return {
    id: 'route-1',
    publicPath: '/r/foo/*',
    targetUrl: 'http://test.default.svc:8080/test',
    ipAllowlist: [],
    pathAllowlist,
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
}

async function run(route: any, path: string) {
  return proxyRequest(route, makeReq(path), {} as any).then(() => null, (err) => err)
}

describe('proxyRequest — path allowlist', () => {
  beforeEach(() => {
    axiosMock.mockReset()
    axiosMock.mockRejectedValue(new Error('upstream not reachable in test'))
  })

  it('forwards listed sub-paths to the matching target path', async () => {
    const route = makeRoute(['/foo1', '/foo2'])
    await run(route, '/r/foo/foo1')
    await run(route, '/r/foo/foo2')
    expect(axiosMock).toHaveBeenCalledTimes(2)
    expect(axiosMock.mock.calls[0][0].url).toBe('http://test.default.svc:8080/test/foo1')
    expect(axiosMock.mock.calls[1][0].url).toBe('http://test.default.svc:8080/test/foo2')
  })

  it('rejects unlisted sub-paths with 404 without contacting the upstream', async () => {
    const err = await run(makeRoute(['/foo1', '/foo2']), '/r/foo/foo3')
    expect(err).toMatchObject({ statusCode: 404, code: 'PATH_NOT_ALLOWED' })
    expect(axiosMock).not.toHaveBeenCalled()
  })

  it('rejects traversal out of an allowed path', async () => {
    const err = await run(makeRoute(['/foo1/*']), '/r/foo/foo1/../foo3')
    expect(err).toMatchObject({ statusCode: 404 })
    expect(axiosMock).not.toHaveBeenCalled()
  })

  it('forwards everything when no allowlist is set', async () => {
    await run(makeRoute([]), '/r/foo/foo3')
    expect(axiosMock).toHaveBeenCalledTimes(1)
  })
})
