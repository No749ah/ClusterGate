import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/prisma', () => ({
  prisma: {
    route: { findUnique: vi.fn(), update: vi.fn() },
  },
}))

vi.mock('../incidentService', () => ({
  incidentService: {
    autoResolveIfHealthy: vi.fn().mockResolvedValue(undefined),
    checkAndCreateFromCBOpen: vi.fn().mockResolvedValue(undefined),
  },
}))

import { checkCircuitBreaker, recordFailure, recordSuccess } from '../circuitBreakerService'
import { prisma } from '../../lib/prisma'

const update = prisma.route.update as unknown as ReturnType<typeof vi.fn>
const findUnique = prisma.route.findUnique as unknown as ReturnType<typeof vi.fn>

const route = (over: Record<string, unknown>) => ({
  id: 'r1',
  circuitBreakerEnabled: true,
  cbState: 'CLOSED',
  cbFailureCount: 0,
  cbFailureThreshold: 3,
  cbRecoveryTimeout: 30000,
  cbOpenedAt: null,
  ...over,
}) as any

describe('checkCircuitBreaker', () => {
  beforeEach(() => vi.clearAllMocks())

  it('allows requests when the breaker is disabled', async () => {
    const r = await checkCircuitBreaker(route({ circuitBreakerEnabled: false }))
    expect(r).toEqual({ allowed: true, state: 'CLOSED' })
  })

  it('allows requests while CLOSED', async () => {
    const r = await checkCircuitBreaker(route({ cbState: 'CLOSED' }))
    expect(r.allowed).toBe(true)
    expect(r.state).toBe('CLOSED')
  })

  it('blocks requests while OPEN within the recovery window', async () => {
    const r = await checkCircuitBreaker(route({ cbState: 'OPEN', cbOpenedAt: new Date() }))
    expect(r).toEqual({ allowed: false, state: 'OPEN' })
    expect(update).not.toHaveBeenCalled()
  })

  it('transitions OPEN → HALF_OPEN once the recovery timeout elapses', async () => {
    update.mockResolvedValue({})
    const openedAt = new Date(Date.now() - 60000) // 60s ago, timeout is 30s
    const r = await checkCircuitBreaker(route({ cbState: 'OPEN', cbOpenedAt: openedAt }))
    expect(r.allowed).toBe(true)
    expect(r.state).toBe('HALF_OPEN')
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { cbState: 'HALF_OPEN' } }))
  })
})

describe('recordFailure', () => {
  beforeEach(() => vi.clearAllMocks())

  it('trips the breaker to OPEN once the failure threshold is reached', async () => {
    findUnique.mockResolvedValueOnce({ circuitBreakerEnabled: true, cbState: 'CLOSED', cbFailureCount: 2, cbFailureThreshold: 3 })
      .mockResolvedValueOnce({ name: 'My Route' }) // incident lookup
    update.mockResolvedValue({})
    await recordFailure('r1')
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ cbState: 'OPEN' }) }))
  })

  it('only increments the counter below the threshold', async () => {
    findUnique.mockResolvedValue({ circuitBreakerEnabled: true, cbState: 'CLOSED', cbFailureCount: 0, cbFailureThreshold: 3 })
    update.mockResolvedValue({})
    await recordFailure('r1')
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ cbFailureCount: 1 }) }))
    const arg = update.mock.calls[0][0]
    expect(arg.data.cbState).toBeUndefined()
  })

  it('returns OPEN immediately when a HALF_OPEN probe fails', async () => {
    findUnique.mockResolvedValue({ circuitBreakerEnabled: true, cbState: 'HALF_OPEN', cbFailureCount: 0, cbFailureThreshold: 3 })
    update.mockResolvedValue({})
    await recordFailure('r1')
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ cbState: 'OPEN' }) }))
  })
})

describe('recordSuccess', () => {
  beforeEach(() => vi.clearAllMocks())

  it('closes the breaker after a successful HALF_OPEN probe', async () => {
    findUnique.mockResolvedValue({ circuitBreakerEnabled: true, cbState: 'HALF_OPEN' })
    update.mockResolvedValue({})
    await recordSuccess('r1')
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ cbState: 'CLOSED' }) }))
  })

  it('resets the failure counter on success while CLOSED', async () => {
    findUnique.mockResolvedValue({ circuitBreakerEnabled: true, cbState: 'CLOSED' })
    update.mockResolvedValue({})
    await recordSuccess('r1')
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { cbFailureCount: 0 } }))
  })

  it('does nothing when the breaker is disabled', async () => {
    findUnique.mockResolvedValue({ circuitBreakerEnabled: false, cbState: 'CLOSED' })
    await recordSuccess('r1')
    expect(update).not.toHaveBeenCalled()
  })
})
