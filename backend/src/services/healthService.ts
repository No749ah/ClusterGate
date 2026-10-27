import axios from 'axios'
import https from 'https'
import { Route, HealthStatus, RequestSource } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { logger } from '../lib/logger'
import { healthCheckStatus } from '../lib/metrics'
import { notifyHealthDown } from './notificationService'
import { incidentService } from './incidentService'
import { validateTargetUrlSync, isTlsProtocolMismatch } from '../lib/security'
import { isN8nTarget } from '../lib/targetDetect'
import { getVersion } from '../lib/version'

// Matches the ClusterGate entry in lib/requestSource, so a probe is recognised
// as a health check wherever it shows up.
const HEALTH_CHECK_USER_AGENT = `ClusterGate-HealthCheck/${getVersion()}`

/**
 * Write the probe to the request log as a HEALTH_CHECK entry. The log hides
 * these unless the health-check filter is on. Best effort: a failed write
 * never changes the health result.
 */
async function logHealthProbe(data: {
  route: Route
  method: string
  url: string
  responseStatus?: number
  duration: number
  error?: string
}): Promise<void> {
  try {
    const { pathname } = new URL(data.url)
    await prisma.requestLog.create({
      data: {
        routeId: data.route.id,
        method: data.method,
        path: pathname || '/',
        targetUrl: data.url,
        responseStatus: data.responseStatus,
        duration: data.duration,
        error: data.error,
        userAgent: HEALTH_CHECK_USER_AGENT,
        source: RequestSource.HEALTH_CHECK,
        requestHeaders: { 'user-agent': HEALTH_CHECK_USER_AGENT },
        responseHeaders: {},
      },
    })
  } catch (err) {
    logger.warn('Failed to log health check', { routeId: data.route.id, error: (err as Error).message })
  }
}

export async function checkRouteHealth(route: Route): Promise<{
  status: HealthStatus
  responseTime?: number
  error?: string
}> {
  const start = Date.now()
  // What was actually sent, for the request log entry
  let probeUrl = route.targetUrl
  let probeMethod = 'HEAD'

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
    // target root. n8n targets must receive chatInput + sessionId or they error,
    // so for n8n we default to a POST with that body when none is configured.
    const n8n = isN8nTarget((route as any).targetType, route.targetUrl)
    const hcPath = (route as any).healthCheckPath || ''
    let method = ((route as any).healthCheckMethod || 'HEAD').toUpperCase()
    let hcBody = (route as any).healthCheckBody || undefined
    if (n8n && !hcBody) {
      method = 'POST'
      hcBody = JSON.stringify({ chatInput: 'Hello World', sessionId: 'clustergate-healthcheck' })
    }
    const headers: Record<string, string> = { 'user-agent': HEALTH_CHECK_USER_AGENT }
    if (hcBody) headers['content-type'] = 'application/json'

    const probe = async (base: string) => {
      const url = `${base.replace(/\/$/, '')}${hcPath}`
      probeUrl = url
      probeMethod = method
      let res = await axios({ method, url, data: hcBody, headers, timeout: 10000, maxRedirects: 3, validateStatus: () => true, httpsAgent })
      // Fall back to GET only when HEAD isn't supported
      if (method === 'HEAD' && (res.status === 405 || res.status === 501)) {
        probeMethod = 'GET'
        res = await axios({ method: 'GET', url, headers: { 'user-agent': HEALTH_CHECK_USER_AGENT }, timeout: 10000, maxRedirects: 3, validateStatus: () => true, httpsAgent })
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

    await logHealthProbe({ route, method: probeMethod, url: probeUrl, responseStatus: response.status, duration: responseTime, error })

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

    await logHealthProbe({ route, method: probeMethod, url: probeUrl, duration: responseTime, error })

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
  const all = await prisma.route.findMany({
    where: { isActive: true, deletedAt: null },
    include: { healthChecks: { orderBy: { createdAt: 'desc' }, take: 1 } },
  })

  // Only check routes whose per-route interval has elapsed (cron runs every 5m,
  // which is the finest granularity). 30s slack avoids skipping due to jitter.
  const now = Date.now()
  const routes = all.filter((r) => {
    const intervalMs = ((r as any).healthCheckInterval || 5) * 60_000
    const last = r.healthChecks[0]?.createdAt ? new Date(r.healthChecks[0].createdAt).getTime() : 0
    return now - last >= intervalMs - 30_000
  })

  logger.info(`Running health checks for ${routes.length}/${all.length} due routes`)

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
