import { describe, it, expect, vi, beforeEach } from 'vitest'

const axiosMock = vi.hoisted(() => vi.fn())
const prismaMock = vi.hoisted(() => ({
  requestLog: { create: vi.fn() },
  healthCheck: { create: vi.fn() },
}))
vi.mock('axios', () => ({ default: axiosMock }))
vi.mock('../../lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('../notificationService', () => ({ notifyHealthDown: vi.fn() }))
vi.mock('../incidentService', () => ({ incidentService: { checkAndCreateFromHealthFailure: vi.fn(() => Promise.resolve()) } }))
vi.mock('../../lib/security', () => ({ validateTargetUrlSync: vi.fn(), isTlsProtocolMismatch: () => false }))

import { checkRouteHealth } from '../healthService'
import { classifyRequestSource } from '../../lib/requestSource'

const route = {
  id: 'route-1',
  name: 'api',
  targetUrl: 'http://api.default.svc:8080',
  healthCheckPath: '/healthz',
} as any

describe('checkRouteHealth request log', () => {
  beforeEach(() => {
    axiosMock.mockReset()
    prismaMock.requestLog.create.mockReset().mockResolvedValue({ id: 'log-1' })
    prismaMock.healthCheck.create.mockReset().mockResolvedValue({})
  })

  it('logs a successful probe as HEALTH_CHECK', async () => {
    axiosMock.mockResolvedValue({ status: 200, statusText: 'OK' })

    await checkRouteHealth(route)

    expect(prismaMock.requestLog.create).toHaveBeenCalledTimes(1)
    const data = prismaMock.requestLog.create.mock.calls[0][0].data
    expect(data).toMatchObject({
      routeId: 'route-1',
      method: 'HEAD',
      path: '/healthz',
      targetUrl: 'http://api.default.svc:8080/healthz',
      responseStatus: 200,
      source: 'HEALTH_CHECK',
    })
    // The probe identifies itself, so the UA classifier agrees with the tag
    expect(classifyRequestSource(data.userAgent)).toBe('HEALTH_CHECK')
    expect(axiosMock.mock.calls[0][0].headers['user-agent']).toBe(data.userAgent)
  })

  it('logs the GET fallback when HEAD is not allowed', async () => {
    axiosMock.mockResolvedValueOnce({ status: 405 }).mockResolvedValueOnce({ status: 200 })

    await checkRouteHealth(route)

    expect(prismaMock.requestLog.create.mock.calls[0][0].data).toMatchObject({ method: 'GET', responseStatus: 200 })
  })

  it('logs a failed probe with its error', async () => {
    axiosMock.mockRejectedValue(new Error('connect ECONNREFUSED'))

    const result = await checkRouteHealth(route)

    expect(result.status).toBe('UNHEALTHY')
    expect(prismaMock.requestLog.create.mock.calls[0][0].data).toMatchObject({
      source: 'HEALTH_CHECK',
      error: 'connect ECONNREFUSED',
      responseStatus: undefined,
    })
  })

  it('keeps the health result when the log write fails', async () => {
    axiosMock.mockResolvedValue({ status: 200 })
    prismaMock.requestLog.create.mockRejectedValue(new Error('db down'))

    const result = await checkRouteHealth(route)

    expect(result.status).toBe('HEALTHY')
    expect(prismaMock.healthCheck.create).toHaveBeenCalled()
  })
})
