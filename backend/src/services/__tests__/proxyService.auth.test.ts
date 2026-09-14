import { describe, it, expect, vi, beforeEach } from 'vitest'

// proxyService transitively imports prisma + several services; mock the DB
// layer and the key verifier so validateRouteAuth can be tested in isolation.
vi.mock('../../lib/prisma', () => ({ prisma: {} }))
vi.mock('../apiKeyService', () => ({ verifyApiKey: vi.fn() }))
vi.mock('../../lib/crypto', () => ({ decryptSecret: (v: unknown) => (typeof v === 'string' ? v : null) }))

import { validateRouteAuth } from '../proxyService'
import { verifyApiKey } from '../apiKeyService'

const mockedVerify = vi.mocked(verifyApiKey)

function makeReq(headers: Record<string, string>, method = 'POST') {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]))
  return {
    method,
    ip: '203.0.113.5',
    socket: { remoteAddress: '203.0.113.5' },
    get: (key: string) => lower[key.toLowerCase()],
  } as any
}

const apiKeyRoute = { id: 'route-1', authType: 'API_KEY', authValue: null } as any

describe('validateRouteAuth — API_KEY', () => {
  beforeEach(() => {
    mockedVerify.mockReset()
    mockedVerify.mockResolvedValue({ id: 'key-1', scope: 'FULL' } as any)
  })

  it('accepts the key via X-API-Key and reports that header as consumed', async () => {
    const consumed = await validateRouteAuth(apiKeyRoute, makeReq({ 'X-API-Key': 'cg_abc' }))
    expect(consumed).toBe('x-api-key')
    expect(mockedVerify).toHaveBeenCalledWith('cg_abc', 'route-1', '203.0.113.5')
  })

  it('accepts the key via Authorization: Bearer (OpenAI-SDK style)', async () => {
    const consumed = await validateRouteAuth(apiKeyRoute, makeReq({ Authorization: 'Bearer cg_abc' }))
    expect(consumed).toBe('authorization')
    expect(mockedVerify).toHaveBeenCalledWith('cg_abc', 'route-1', '203.0.113.5')
  })

  it('prefers X-API-Key when both headers are present', async () => {
    const consumed = await validateRouteAuth(
      apiKeyRoute,
      makeReq({ 'X-API-Key': 'cg_primary', Authorization: 'Bearer cg_other' })
    )
    expect(consumed).toBe('x-api-key')
    expect(mockedVerify).toHaveBeenCalledWith('cg_primary', 'route-1', '203.0.113.5')
  })

  it('rejects when no key is provided at all', async () => {
    await expect(validateRouteAuth(apiKeyRoute, makeReq({}))).rejects.toThrow(/API key required/)
    expect(mockedVerify).not.toHaveBeenCalled()
  })

  it('does not treat a Basic Authorization header as an API key', async () => {
    await expect(validateRouteAuth(apiKeyRoute, makeReq({ Authorization: 'Basic dXNlcjpwdw==' }))).rejects.toThrow(
      /API key required/
    )
    expect(mockedVerify).not.toHaveBeenCalled()
  })

  it('rejects an invalid key from either header', async () => {
    mockedVerify.mockResolvedValue(null as any)
    await expect(validateRouteAuth(apiKeyRoute, makeReq({ Authorization: 'Bearer cg_bad' }))).rejects.toThrow(
      /Invalid API key/
    )
  })

  it('enforces read-only scope for bearer-supplied keys too', async () => {
    mockedVerify.mockResolvedValue({ id: 'key-1', scope: 'READ' } as any)
    await expect(
      validateRouteAuth(apiKeyRoute, makeReq({ Authorization: 'Bearer cg_ro' }, 'POST'))
    ).rejects.toThrow(/read-only/)
    await expect(
      validateRouteAuth(apiKeyRoute, makeReq({ Authorization: 'Bearer cg_ro' }, 'GET'))
    ).resolves.toBe('authorization')
  })
})

describe('validateRouteAuth — static schemes stay unchanged', () => {
  it('BEARER validates the static token and consumes no header', async () => {
    const route = { id: 'route-2', authType: 'BEARER', authValue: 'secret-token' } as any
    await expect(validateRouteAuth(route, makeReq({ Authorization: 'Bearer secret-token' }))).resolves.toBeNull()
    await expect(validateRouteAuth(route, makeReq({ Authorization: 'Bearer wrong' }))).rejects.toThrow(
      /Invalid bearer token/
    )
  })

  it('BASIC validates the static credentials and consumes no header', async () => {
    const route = { id: 'route-3', authType: 'BASIC', authValue: 'dXNlcjpwdw==' } as any
    await expect(validateRouteAuth(route, makeReq({ Authorization: 'Basic dXNlcjpwdw==' }))).resolves.toBeNull()
    await expect(validateRouteAuth(route, makeReq({ Authorization: 'Bearer dXNlcjpwdw==' }))).rejects.toThrow(
      /Basic authentication required/
    )
  })
})
