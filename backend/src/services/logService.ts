import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { logger } from '../lib/logger'

export interface LogFilters {
  /** Single route id or multiple ids ("id1,id2") to filter by. */
  routeId?: string
  /** Single method ("POST") or multiple ("POST,PUT") to filter by. */
  method?: string
  // Response category. "error" is strictly upstream/gateway failures that
  // the operator should look at — well-formed client responses and gateway
  // safety nets each get their own bucket.
  //   success     2xx/3xx
  //   client      4xx (excluding throttled 429)
  //   throttled   rate-limit gate fired (429 / error="Rate limit...")
  //   maintenance maintenance-mode 503 (operator-initiated)
  //   degraded    circuit-breaker rejected the request
  //   error       upstream 5xx (excluding the above) OR proxy/SSL/network
  //               failure (timeouts, TLS errors, unauthorised at gateway, …)
  statusType?: 'success' | 'error' | 'client' | 'throttled' | 'maintenance' | 'degraded'
  dateFrom?: Date
  dateTo?: Date
  search?: string
}

// Free-text markers stored in the RequestLog.error column. The Prisma `contains`
// filter keeps the classification consistent across queries.
const MARK_MAINT = 'MAINTENANCE_MODE'
const MARK_CB    = 'Circuit breaker'
const MARK_RATE  = 'Rate limit'

function statusTypeWhere(t: NonNullable<LogFilters['statusType']>): Prisma.RequestLogWhereInput {
  switch (t) {
    case 'success':
      return { responseStatus: { gte: 200, lt: 400 } }
    case 'client':
      // 4xx but NOT the throttled bucket (429 is its own category).
      return {
        AND: [
          { responseStatus: { gte: 400, lt: 500 } },
          { responseStatus: { not: 429 } },
          { OR: [{ error: null }, { AND: [{ error: { not: { contains: MARK_RATE } } }] }] },
        ],
      }
    case 'throttled':
      return { OR: [{ responseStatus: 429 }, { error: { contains: MARK_RATE } }] }
    case 'maintenance':
      return { error: MARK_MAINT }
    case 'degraded':
      return { error: { contains: MARK_CB } }
    case 'error':
      // Real errors: upstream 5xx (excluding the special 503 buckets) OR
      // any proxy-level failure that left an error string (timeouts, SSL,
      // gateway auth failures, IP allowlist denials, …). The special
      // buckets are filtered out by name so they don't double-count.
      return {
        OR: [
          {
            AND: [
              { responseStatus: { gte: 500 } },
              { OR: [{ error: null }, { AND: [{ error: { not: MARK_MAINT } }, { error: { not: { contains: MARK_CB } } }] }] },
            ],
          },
          {
            AND: [
              { error: { not: null } },
              { error: { not: MARK_MAINT } },
              { error: { not: { contains: MARK_CB } } },
              { error: { not: { contains: MARK_RATE } } },
            ],
          },
        ],
      }
  }
}

export async function getRouteLogs(filters: LogFilters, pagination = { page: 1, pageSize: 50 }) {
  const { page, pageSize } = pagination
  const skip = (page - 1) * pageSize

  const where: Prisma.RequestLogWhereInput = {
    ...(filters.routeId && (() => {
      const ids = filters.routeId.split(',').map((s) => s.trim()).filter(Boolean)
      return ids.length > 1 ? { routeId: { in: ids } } : { routeId: ids[0] }
    })()),
    ...(filters.method && (() => {
      const methods = filters.method.split(',').map((m) => m.trim().toUpperCase()).filter(Boolean)
      return methods.length > 1 ? { method: { in: methods } } : { method: methods[0] }
    })()),
    ...(filters.statusType ? statusTypeWhere(filters.statusType) : {}),
    ...(filters.dateFrom || filters.dateTo
      ? {
          createdAt: {
            ...(filters.dateFrom && { gte: filters.dateFrom }),
            ...(filters.dateTo && { lte: filters.dateTo }),
          },
        }
      : {}),
  }

  const [data, total] = await prisma.$transaction([
    prisma.requestLog.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        route: { select: { id: true, name: true } },
      },
    }),
    prisma.requestLog.count({ where }),
  ])

  return {
    data,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
}

export async function getRouteStats(routeId: string) {
  const [total, errors, avgDuration] = await prisma.$transaction([
    prisma.requestLog.count({ where: { routeId } }),
    prisma.requestLog.count({
      // Errors = strictly upstream 5xx + proxy/SSL/network failures.
      // Maintenance / circuit-breaker / rate-limit are intentional gates
      // and stay out of the route's error count.
      where: { AND: [{ routeId }, statusTypeWhere('error')] },
    }),
    prisma.requestLog.aggregate({
      where: { routeId },
      _avg: { duration: true },
    }),
  ])

  // P95 duration (approximate)
  const logs = await prisma.requestLog.findMany({
    where: { routeId, duration: { not: null } },
    select: { duration: true },
    orderBy: { duration: 'asc' },
    take: 1000,
  })

  const durations = logs.map((l) => l.duration!).sort((a, b) => a - b)
  const p95Index = Math.floor(durations.length * 0.95)
  const p95Duration = durations[p95Index] ?? null

  return {
    total,
    errors,
    successRate: total > 0 ? Math.round(((total - errors) / total) * 100) : 100,
    avgDuration: Math.round(avgDuration._avg.duration ?? 0),
    p95Duration,
  }
}

export async function getRecentErrors(routeId?: string, limit = 10) {
  return prisma.requestLog.findMany({
    where: {
      AND: [
        ...(routeId ? [{ routeId }] : []),
        statusTypeWhere('error'),
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      route: { select: { id: true, name: true } },
    },
  })
}

export async function cleanOldLogs(daysToKeep: number): Promise<number> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - daysToKeep)

  const result = await prisma.requestLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  })

  logger.info(`Log cleanup: deleted ${result.count} logs older than ${daysToKeep} days`)
  return result.count
}

export async function getDailyRequestCounts(routeId?: string, days = 7) {
  const since = new Date()
  since.setDate(since.getDate() - days)

  const logs = await prisma.requestLog.findMany({
    where: {
      ...(routeId && { routeId }),
      createdAt: { gte: since },
    },
    select: { createdAt: true, responseStatus: true, error: true },
    orderBy: { createdAt: 'asc' },
  })

  // Group by day
  const grouped: Record<string, { total: number; errors: number }> = {}

  for (let i = 0; i < days; i++) {
    const d = new Date()
    d.setDate(d.getDate() - (days - 1 - i))
    const key = d.toISOString().slice(0, 10)
    grouped[key] = { total: 0, errors: 0 }
  }

  for (const log of logs) {
    const key = log.createdAt.toISOString().slice(0, 10)
    if (grouped[key]) {
      grouped[key].total++
      // Intentional gates don't count as errors here either.
      const isGate = log.error === MARK_MAINT
        || (log.error?.includes(MARK_CB) ?? false)
        || (log.error?.includes(MARK_RATE) ?? false)
        || log.responseStatus === 429
      const isError = !isGate && (
        (log.responseStatus !== null && log.responseStatus !== undefined && log.responseStatus >= 500)
        || (log.error !== null && log.error !== undefined && log.error !== '')
      )
      if (isError) grouped[key].errors++
    }
  }

  return Object.entries(grouped).map(([date, counts]) => ({ date, ...counts }))
}
