import { LBStrategy, RouteTarget } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { logger } from '../lib/logger'

// In-memory round-robin index per route
const rrIndexMap = new Map<string, number>()

/**
 * Select a target URL based on the route's load balancing strategy.
 * Returns the selected target URL, or null if no healthy targets are available.
 */
export async function selectTarget(
  routeId: string,
  strategy: LBStrategy,
  targets: RouteTarget[]
): Promise<{ url: string; targetId: string } | null> {
  const healthy = targets.filter((t) => t.isHealthy)
  if (healthy.length === 0) return null

  switch (strategy) {
    case 'ROUND_ROBIN':
      return roundRobin(routeId, healthy)
    case 'WEIGHTED':
      return weighted(healthy)
    case 'FAILOVER':
      return failover(healthy)
    default:
      return { url: healthy[0].url, targetId: healthy[0].id }
  }
}

function roundRobin(routeId: string, targets: RouteTarget[]): { url: string; targetId: string } {
  const idx = rrIndexMap.get(routeId) || 0
  const target = targets[idx % targets.length]
  rrIndexMap.set(routeId, (idx + 1) % targets.length)
  return { url: target.url, targetId: target.id }
}

function weighted(targets: RouteTarget[]): { url: string; targetId: string } {
  const totalWeight = targets.reduce((sum, t) => sum + t.weight, 0)
  let random = Math.random() * totalWeight
  for (const target of targets) {
    random -= target.weight
    if (random <= 0) {
      return { url: target.url, targetId: target.id }
    }
  }
  // Fallback
  const last = targets[targets.length - 1]
  return { url: last.url, targetId: last.id }
}

function failover(targets: RouteTarget[]): { url: string; targetId: string } {
  // Sort by priority (lower = higher priority)
  const sorted = [...targets].sort((a, b) => a.priority - b.priority)
  return { url: sorted[0].url, targetId: sorted[0].id }
}

/**
 * Mark a target as unhealthy after a proxy error.
 */
export async function markTargetUnhealthy(targetId: string, error: string): Promise<void> {
  try {
    await prisma.routeTarget.update({
      where: { id: targetId },
      data: { isHealthy: false, lastError: error },
    })
  } catch (err) {
    logger.warn('Failed to mark target unhealthy', { targetId, error: (err as Error).message })
  }
}

/**
 * Mark a target as healthy.
 */
export async function markTargetHealthy(targetId: string): Promise<void> {
  try {
    await prisma.routeTarget.update({
      where: { id: targetId },
      data: { isHealthy: true, lastError: null },
    })
  } catch (err) {
    logger.warn('Failed to mark target healthy', { targetId, error: (err as Error).message })
  }
}

// ============================================================================
// CRUD for route targets
// ============================================================================

export async function getTargets(routeId: string) {
  return prisma.routeTarget.findMany({
    where: { routeId },
    orderBy: { priority: 'asc' },
  })
}

export async function addTarget(routeId: string, data: { url: string; weight?: number; priority?: number }) {
  return prisma.routeTarget.create({
    data: {
      routeId,
      url: data.url,
      weight: data.weight ?? 100,
      priority: data.priority ?? 0,
    },
  })
}

export async function updateTarget(targetId: string, data: { url?: string; weight?: number; priority?: number; isHealthy?: boolean }) {
  return prisma.routeTarget.update({
    where: { id: targetId },
    data,
  })
}

export async function deleteTarget(targetId: string) {
  return prisma.routeTarget.delete({
    where: { id: targetId },
  })
}
