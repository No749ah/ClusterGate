import { Route } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { logger } from '../lib/logger'
import { incidentService } from './incidentService'

/**
 * Circuit Breaker Service
 *
 * States: CLOSED → OPEN → HALF_OPEN → CLOSED
 * - CLOSED: Requests flow normally. Failures increment counter.
 * - OPEN: Requests are rejected immediately. After recovery timeout, move to HALF_OPEN.
 * - HALF_OPEN: Allow one request through. On success → CLOSED, on failure → OPEN.
 */

export type CBState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'

export interface CircuitBreakerResult {
  allowed: boolean
  state: CBState
}

/**
 * Check if a request should be allowed through the circuit breaker.
 */
export async function checkCircuitBreaker(route: Route): Promise<CircuitBreakerResult> {
  if (!route.circuitBreakerEnabled) {
    return { allowed: true, state: 'CLOSED' }
  }

  const state = route.cbState as CBState

  if (state === 'CLOSED') {
    return { allowed: true, state: 'CLOSED' }
  }

  if (state === 'OPEN') {
    const openedAt = route.cbOpenedAt
    if (!openedAt) {
      // Shouldn't happen, but recover gracefully
      await resetCircuitBreaker(route.id)
      return { allowed: true, state: 'CLOSED' }
    }

    const elapsed = Date.now() - openedAt.getTime()
    if (elapsed >= route.cbRecoveryTimeout) {
      // Transition to HALF_OPEN
      await prisma.route.update({
        where: { id: route.id },
        data: { cbState: 'HALF_OPEN' },
      })
      logger.info('Circuit breaker → HALF_OPEN', { routeId: route.id })
      return { allowed: true, state: 'HALF_OPEN' }
    }

    return { allowed: false, state: 'OPEN' }
  }

  // HALF_OPEN: allow one request through
  return { allowed: true, state: 'HALF_OPEN' }
}

/**
 * Record a successful request — resets the circuit breaker if needed.
 */
export async function recordSuccess(routeId: string): Promise<void> {
  const route = await prisma.route.findUnique({
    where: { id: routeId },
    select: { circuitBreakerEnabled: true, cbState: true },
  })
  if (!route?.circuitBreakerEnabled) return

  if (route.cbState === 'HALF_OPEN') {
    await resetCircuitBreaker(routeId)
    logger.info('Circuit breaker → CLOSED (success in HALF_OPEN)', { routeId })
    // Auto-resolve any active incidents for this route
    incidentService.autoResolveIfHealthy(routeId).catch(() => {})
  } else if (route.cbState === 'CLOSED') {
    // Reset failure count on success
    await prisma.route.update({
      where: { id: routeId },
      data: { cbFailureCount: 0 },
    })
  }
}

/**
 * Record a failed request — may trip the circuit breaker.
 */
export async function recordFailure(routeId: string): Promise<void> {
  const route = await prisma.route.findUnique({
    where: { id: routeId },
    select: {
      circuitBreakerEnabled: true,
      cbState: true,
      cbFailureCount: true,
      cbFailureThreshold: true,
    },
  })
  if (!route?.circuitBreakerEnabled) return

  const now = new Date()

  if (route.cbState === 'HALF_OPEN') {
    // Failed during HALF_OPEN → back to OPEN
    await prisma.route.update({
      where: { id: routeId },
      data: {
        cbState: 'OPEN',
        cbOpenedAt: now,
        cbLastFailureAt: now,
      },
    })
    logger.warn('Circuit breaker → OPEN (failure in HALF_OPEN)', { routeId })
    return
  }

  // CLOSED state: increment failure count
  const newCount = route.cbFailureCount + 1
  if (newCount >= route.cbFailureThreshold) {
    await prisma.route.update({
      where: { id: routeId },
      data: {
        cbState: 'OPEN',
        cbFailureCount: newCount,
        cbLastFailureAt: now,
        cbOpenedAt: now,
      },
    })
    logger.warn('Circuit breaker → OPEN (threshold reached)', {
      routeId,
      failures: newCount,
      threshold: route.cbFailureThreshold,
    })
    // Auto-create incident when circuit breaker opens
    const fullRoute = await prisma.route.findUnique({ where: { id: routeId }, select: { name: true } })
    if (fullRoute) {
      incidentService.checkAndCreateFromCBOpen(routeId, fullRoute.name).catch(() => {})
    }
  } else {
    await prisma.route.update({
      where: { id: routeId },
      data: {
        cbFailureCount: newCount,
        cbLastFailureAt: now,
      },
    })
  }
}

/**
 * Reset circuit breaker to CLOSED state.
 */
export async function resetCircuitBreaker(routeId: string): Promise<void> {
  await prisma.route.update({
    where: { id: routeId },
    data: {
      cbState: 'CLOSED',
      cbFailureCount: 0,
      cbOpenedAt: null,
      cbLastFailureAt: null,
    },
  })
}

/**
 * Get circuit breaker status for a route.
 */
export async function getCircuitBreakerStatus(routeId: string) {
  const route = await prisma.route.findUnique({
    where: { id: routeId },
    select: {
      circuitBreakerEnabled: true,
      cbFailureThreshold: true,
      cbRecoveryTimeout: true,
      cbState: true,
      cbFailureCount: true,
      cbLastFailureAt: true,
      cbOpenedAt: true,
    },
  })
  return route
}
