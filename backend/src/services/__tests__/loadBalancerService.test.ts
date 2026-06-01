import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma before importing the service
vi.mock('../../lib/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn(),
    routeTarget: { update: vi.fn() },
  },
}))

vi.mock('@prisma/client', () => ({
  LBStrategy: { ROUND_ROBIN: 'ROUND_ROBIN', WEIGHTED: 'WEIGHTED', FAILOVER: 'FAILOVER' },
}))

import { selectTarget } from '../loadBalancerService'
import { prisma } from '../../lib/prisma'

// Minimal RouteTarget factory — only the fields the LB logic reads
const target = (over: Partial<{ id: string; url: string; isHealthy: boolean; weight: number; priority: number }>) => ({
  id: over.id ?? 't1',
  url: over.url ?? 'http://a',
  isHealthy: over.isHealthy ?? true,
  weight: over.weight ?? 100,
  priority: over.priority ?? 0,
}) as any

describe('selectTarget', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null when no targets are healthy', async () => {
    const result = await selectTarget('r1', 'FAILOVER' as any, [
      target({ id: 'a', isHealthy: false }),
      target({ id: 'b', isHealthy: false }),
    ])
    expect(result).toBeNull()
  })

  it('only considers healthy targets', async () => {
    const result = await selectTarget('r1', 'FAILOVER' as any, [
      target({ id: 'down', isHealthy: false, priority: 0 }),
      target({ id: 'up', isHealthy: true, priority: 5 }),
    ])
    expect(result?.targetId).toBe('up')
  })

  it('FAILOVER picks the lowest-priority (highest precedence) healthy target', async () => {
    const result = await selectTarget('r1', 'FAILOVER' as any, [
      target({ id: 'c', priority: 10 }),
      target({ id: 'a', priority: 1 }),
      target({ id: 'b', priority: 5 }),
    ])
    expect(result?.targetId).toBe('a')
  })

  it('WEIGHTED honours target weights via the random draw', async () => {
    const targets = [target({ id: 'a', weight: 10 }), target({ id: 'b', weight: 90 })]
    // total weight = 100. random = 0.5 * 100 = 50 → subtract 10 (a) → 40 left → subtract 90 (b) → b
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const result = await selectTarget('r1', 'WEIGHTED' as any, targets)
    expect(result?.targetId).toBe('b')
    spy.mockRestore()
  })

  it('WEIGHTED selects the first target when the draw lands in its band', async () => {
    const targets = [target({ id: 'a', weight: 10 }), target({ id: 'b', weight: 90 })]
    // random = 0.05 * 100 = 5 → subtract 10 (a) → <= 0 → a
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.05)
    const result = await selectTarget('r1', 'WEIGHTED' as any, targets)
    expect(result?.targetId).toBe('a')
    spy.mockRestore()
  })

  it('ROUND_ROBIN distributes across targets using the persisted index', async () => {
    const targets = [target({ id: 'a' }), target({ id: 'b' }), target({ id: 'c' })]
    const q = prisma.$queryRaw as unknown as ReturnType<typeof vi.fn>
    q.mockResolvedValueOnce([{ lbRrIndex: 1 }])
      .mockResolvedValueOnce([{ lbRrIndex: 2 }])
      .mockResolvedValueOnce([{ lbRrIndex: 3 }])
    const a = await selectTarget('r1', 'ROUND_ROBIN' as any, targets)
    const b = await selectTarget('r1', 'ROUND_ROBIN' as any, targets)
    const c = await selectTarget('r1', 'ROUND_ROBIN' as any, targets)
    expect([a?.targetId, b?.targetId, c?.targetId]).toEqual(['b', 'c', 'a'])
  })

  it('ROUND_ROBIN falls back to in-memory counting when the DB update fails', async () => {
    const targets = [target({ id: 'a' }), target({ id: 'b' })]
    const q = prisma.$queryRaw as unknown as ReturnType<typeof vi.fn>
    q.mockRejectedValue(new Error('db down'))
    // Should still return a healthy target without throwing
    const result = await selectTarget('rr-fallback', 'ROUND_ROBIN' as any, targets)
    expect(['a', 'b']).toContain(result?.targetId)
  })
})
