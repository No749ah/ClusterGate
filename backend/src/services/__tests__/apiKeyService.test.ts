import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/prisma', () => ({
  prisma: {
    apiKey: {
      findFirst: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
  },
}))

import { prisma } from '../../lib/prisma'
import { verifyApiKey } from '../apiKeyService'

const findFirst = prisma.apiKey.findFirst as unknown as ReturnType<typeof vi.fn>

describe('verifyApiKey', () => {
  beforeEach(() => {
    findFirst.mockReset()
  })

  it('returns id + scope for a valid key', async () => {
    findFirst.mockResolvedValue({ id: 'k1', scope: 'FULL', expiresAt: null })
    const res = await verifyApiKey('cgk_valid_a', 'route-a')
    expect(res).toEqual({ id: 'k1', scope: 'FULL' })
  })

  it('returns null for an unknown/expired/inactive key', async () => {
    findFirst.mockResolvedValue(null)
    expect(await verifyApiKey('cgk_bad', 'route-b')).toBeNull()
  })

  it('matches keys owned by OR shared with the route', async () => {
    findFirst.mockResolvedValue({ id: 'k9', scope: 'FULL', expiresAt: null })
    await verifyApiKey('cgk_shared_key', 'route-shared')
    const where = findFirst.mock.calls[0][0].where
    // Route match must be an OR of ownership and the shared-routes join
    expect(where.AND).toEqual(
      expect.arrayContaining([
        { OR: [{ routeId: 'route-shared' }, { sharedRoutes: { some: { routeId: 'route-shared' } } }] },
      ])
    )
  })

  it('caches positive lookups to avoid a DB read every request', async () => {
    findFirst.mockResolvedValue({ id: 'k2', scope: 'READ', expiresAt: null })
    await verifyApiKey('cgk_cache_c', 'route-c')
    await verifyApiKey('cgk_cache_c', 'route-c')
    expect(findFirst).toHaveBeenCalledTimes(1)
  })

  it('carries the key scope through', async () => {
    findFirst.mockResolvedValue({ id: 'k3', scope: 'READ', expiresAt: null })
    const res = await verifyApiKey('cgk_scope_d', 'route-d')
    expect(res?.scope).toBe('READ')
  })
})
