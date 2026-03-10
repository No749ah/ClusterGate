import axios from 'axios'
import { Route, HealthStatus } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { logger } from '../lib/logger'
import { healthCheckStatus } from '../lib/metrics'
import { notifyHealthDown } from './notificationService'

export async function checkRouteHealth(route: Route): Promise<{
  status: HealthStatus
  responseTime?: number
  error?: string
}> {
  const start = Date.now()

  try {
    const response = await axios({
      method: 'HEAD',
      url: route.targetUrl,
      timeout: 10000,
      validateStatus: (status) => status < 500,
    })

    const responseTime = Date.now() - start
    const status = response.status < 500 ? HealthStatus.HEALTHY : HealthStatus.UNHEALTHY

    await prisma.healthCheck.create({
      data: {
        routeId: route.id,
        status,
        responseTime,
        lastCheckedAt: new Date(),
      },
    })

    healthCheckStatus.set(
      { route_id: route.id, route_name: route.name },
      status === HealthStatus.HEALTHY ? 1 : 0
    )

    return { status, responseTime }
  } catch (err) {
    const error = (err as Error).message
    const responseTime = Date.now() - start

    await prisma.healthCheck.create({
      data: {
        routeId: route.id,
        status: HealthStatus.UNHEALTHY,
        responseTime,
        error,
        lastCheckedAt: new Date(),
      },
    })

    healthCheckStatus.set({ route_id: route.id, route_name: route.name }, 0)

    // Notify admins about health failure
    notifyHealthDown(route.id, route.name, error)

    return { status: HealthStatus.UNHEALTHY, responseTime, error }
  }
}

export async function runAllHealthChecks(): Promise<void> {
  const routes = await prisma.route.findMany({
    where: { isActive: true, deletedAt: null },
  })

  logger.info(`Running health checks for ${routes.length} routes`)

  const results = await Promise.allSettled(
    routes.map((route) => checkRouteHealth(route))
  )

  const healthy = results.filter(
    (r) => r.status === 'fulfilled' && r.value.status === HealthStatus.HEALTHY
  ).length

  const unhealthy = results.filter(
    (r) => r.status === 'fulfilled' && r.value.status === HealthStatus.UNHEALTHY
  ).length

  logger.info(`Health checks complete: ${healthy} healthy, ${unhealthy} unhealthy`)
}

export async function getLatestHealthCheck(routeId: string) {
  return prisma.healthCheck.findFirst({
    where: { routeId },
    orderBy: { createdAt: 'desc' },
  })
}
