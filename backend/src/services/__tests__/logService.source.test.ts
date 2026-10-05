import { describe, it, expect, vi, beforeEach } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  requestLog: { findMany: vi.fn(), count: vi.fn() },
  $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
}))
vi.mock('../../lib/prisma', () => ({ prisma: prismaMock }))

import { getRouteLogs, parseSourceFilter } from '../logService'

function lastWhere() {
  return prismaMock.requestLog.findMany.mock.calls.at(-1)![0].where
}

describe('request log source filter', () => {
  beforeEach(() => {
    prismaMock.requestLog.findMany.mockReset().mockResolvedValue([])
    prismaMock.requestLog.count.mockReset().mockResolvedValue(0)
  })

  it('hides test runs and health checks by default', async () => {
    await getRouteLogs({})
    expect(lastWhere().AND).toEqual([{ source: { in: ['TRAFFIC'] } }])
  })

  it('includes everything with source=all', async () => {
    await getRouteLogs({ source: 'all' })
    expect(lastWhere().AND).toEqual([{}])
  })

  it('can show only test runs or only health checks', async () => {
    await getRouteLogs({ source: 'test' })
    expect(lastWhere().AND).toEqual([{ source: { in: ['TEST'] } }])
    await getRouteLogs({ source: 'health' })
    expect(lastWhere().AND).toEqual([{ source: { in: ['HEALTH_CHECK'] } }])
  })

  it('keeps the AND clause of the client status filter', async () => {
    await getRouteLogs({ statusType: 'client' })
    const and = lastWhere().AND
    expect(and).toHaveLength(4)
    expect(and.at(-1)).toEqual({ source: { in: ['TRAFFIC'] } })
  })

  it('parses the query parameter, falling back to traffic', () => {
    expect(parseSourceFilter('all')).toBe('all')
    expect(parseSourceFilter('HEALTH')).toBe('health')
    expect(parseSourceFilter('bogus')).toBe('traffic')
    expect(parseSourceFilter(undefined)).toBe('traffic')
    expect(parseSourceFilter(['all'])).toBe('traffic')
  })
})
