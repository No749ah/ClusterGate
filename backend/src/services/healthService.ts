import axios from 'axios'
import https from 'https'
import { Route, HealthStatus } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { logger } from '../lib/logger'
import { healthCheckStatus } from '../lib/metrics'
import { notifyHealthDown } from './notificationService'
import { incidentService } from './incidentService'
import { validateTargetUrlSync, isTlsProtocolMismatch } from '../lib/security'

export async function checkRouteHealth(route: Route): Promise<{
  status: HealthStatus
  responseTime?: number
  error?: string
}> {
  const start = Date.now()

  // SSRF protection — skip health check for private/blocked URLs
  try {
    validateTargetUrlSync(route.targetUrl)
  } catch (err) {
    const error = `SSRF blocked: ${(err as Error).message}`
    await prisma.healthCheck.create({
      data: { routeId: route.id, status: HealthStatus.UNHEALTHY, responseTime: 0, error, lastCheckedAt: new Date() },
    })
    healthCheckStatus.set({ route_id: route.id, route_name: route.name }, 0)
    return { status: HealthStatus.UNHEALTHY, responseTime: 0, error }
  }

  try {
    // Respect the route's SSL verify setting
    const httpsAgent = new https.Agent({
      rejectUnauthorized: (route as any).sslVerify !== false,
    })

    // Per-route health check config (method/path/body); defaults to HEAD on the
    // target root. A configured body sends application/json (handy for n8n).
    const method = ((route as any).healthCheckMethod || 'HEAD').toUpperCase()
    const hcPath = (route as any).healthCheckPath || ''
    const hcBody = (route as any).healthCheckBody || undefined
    const headers = hcBody ? { 'content-type': 'application/json' } : undefined

    const probe = async (base: string) => {
      const url = `${base.replace(/\/$/, '')}${hcPath}`
      let res = await axios({ method, url, data: hcBody, headers, timeout: 10000, maxRedirects: 3, validateStatus: () => true, httpsAgent })
      // Fall back to GET only when HEAD isn't supported
      if (method === 'HEAD' && (res.status === 405 || res.status === 501)) {
        res = await axios({ method: 'GET', url, timeout: 10000, maxRedirects: 3, validateStatus: () => true, httpsAgent })
      }
      return res
    }

    let response
    try {
      response = await probe(route.targetUrl)
    } catch (err) {
      // Target spoke plain HTTP on an https:// URL (e.g. n8n on :5678) — the
      // proxy falls back to http://, so the health check must too, otherwise it
      // reports the route unhealthy on every scheduled run.
      if (isTlsProtocolMismatch(err) && route.targetUrl.startsWith('https://')) {
        response = await probe('http://' + route.targetUrl.slice('https://'.length))
      } else {
        throw err
      }
    }

    const responseTime = Date.now() - start
    // Consider 2xx, 3xx, 4xx as healthy (target is reachable), 5xx as unhealthy
    const status = response.status < 500 ? HealthStatus.HEALTHY : HealthStatus.UNHEALTHY
    const error = status === HealthStatus.UNHEALTHY ? `HTTP ${response.status} ${response.statusText || 'Server Error'}` : undefined

    await prisma.healthCheck.create({
      data: {
        routeId: route.id,
        status,
        responseTime,
        error,
        lastCheckedAt: new Date(),
      },
    })

    healthCheckStatus.set(
      { route_id: route.id, route_name: route.name },
      status === HealthStatus.HEALTHY ? 1 : 0
    )

    return { status, responseTime, error }
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

    // Auto-detect incident from health failure
    incidentService.checkAndCreateFromHealthFailure(route.id, route.name, error).catch(() => {})

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

  // Auto-resolve incidents for routes that are now healthy
  for (let i = 0; i < routes.length; i++) {
    const result = results[i]
    if (result.status === 'fulfilled' && result.value.status === HealthStatus.HEALTHY) {
      incidentService.autoResolveIfHealthy(routes[i].id).catch(() => {})
    }
  }

  logger.info(`Health checks complete: ${healthy} healthy, ${unhealthy} unhealthy`)
}

export async function getLatestHealthCheck(routeId: string) {
  return prisma.healthCheck.findFirst({
    where: { routeId },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getRouteUptime(routeId: string, days: number = 7) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const checks = await prisma.healthCheck.findMany({
    where: { routeId, createdAt: { gte: since } },
    select: { status: true },
  })
  if (checks.length === 0) return null
  const healthy = checks.filter(c => c.status === 'HEALTHY').length
  return { uptimePercent: Math.round((healthy / checks.length) * 10000) / 100, totalChecks: checks.length, healthyChecks: healthy }
}
