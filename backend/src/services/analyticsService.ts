import { prisma } from '../lib/prisma'
import { Prisma } from '@prisma/client'

// ============================================================================
// Types
// ============================================================================

interface OverviewResult {
  totalRequests: number
  avgResponseTime: number
  errorRate: number
  p50: number
  p95: number
  p99: number
}

interface LatencyTrendPoint {
  timestamp: string
  p50: number
  p95: number
  p99: number
  count: number
}

interface ErrorTrendPoint {
  timestamp: string
  total: number
  errors: number
  errorRate: number
}

interface HeatmapCell {
  dayOfWeek: number
  hour: number
  count: number
}

interface SlowestRoute {
  routeId: string
  routeName: string
  publicPath: string
  avgDuration: number
  p95Duration: number
  requestCount: number
}

interface StatusBucket {
  bucket: string
  count: number
}

// ============================================================================
// Helpers
// ============================================================================

function buildDateFilter(days: number): Date {
  const since = new Date()
  since.setDate(since.getDate() - days)
  return since
}

// ============================================================================
// Service Functions
// ============================================================================

export async function getOverview(routeId?: string, days = 7): Promise<OverviewResult> {
  const since = buildDateFilter(days)

  const routeFilter = routeId
    ? Prisma.sql`AND "routeId" = ${routeId}`
    : Prisma.empty

  const result = await prisma.$queryRaw<
    {
      total_requests: bigint
      avg_duration: number | null
      error_count: bigint
      p50: number | null
      p95: number | null
      p99: number | null
    }[]
  >`
    SELECT
      COUNT(*)::bigint AS total_requests,
      AVG(duration)::float AS avg_duration,
      COUNT(*) FILTER (WHERE "responseStatus" >= 400 OR error IS NOT NULL)::bigint AS error_count,
      PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY duration) AS p50,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration) AS p95,
      PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY duration) AS p99
    FROM "RequestLog"
    WHERE "createdAt" >= ${since}
      ${routeFilter}
      AND duration IS NOT NULL
  `

  const row = result[0]
  const totalRequests = Number(row?.total_requests ?? 0)
  const errorCount = Number(row?.error_count ?? 0)

  return {
    totalRequests,
    avgResponseTime: Math.round(row?.avg_duration ?? 0),
    errorRate: totalRequests > 0 ? Math.round((errorCount / totalRequests) * 10000) / 100 : 0,
    p50: Math.round(row?.p50 ?? 0),
    p95: Math.round(row?.p95 ?? 0),
    p99: Math.round(row?.p99 ?? 0),
  }
}

export async function getLatencyTrend(
  routeId?: string,
  days = 7,
  granularity: 'hour' | 'day' = 'hour'
): Promise<LatencyTrendPoint[]> {
  const since = buildDateFilter(days)

  const routeFilter = routeId
    ? Prisma.sql`AND "routeId" = ${routeId}`
    : Prisma.empty

  const truncExpr =
    granularity === 'day'
      ? Prisma.sql`date_trunc('day', "createdAt")`
      : Prisma.sql`date_trunc('hour', "createdAt")`

  const rows = await prisma.$queryRaw<
    {
      bucket: Date
      p50: number | null
      p95: number | null
      p99: number | null
      count: bigint
    }[]
  >`
    SELECT
      ${truncExpr} AS bucket,
      PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY duration) AS p50,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration) AS p95,
      PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY duration) AS p99,
      COUNT(*)::bigint AS count
    FROM "RequestLog"
    WHERE "createdAt" >= ${since}
      ${routeFilter}
      AND duration IS NOT NULL
    GROUP BY bucket
    ORDER BY bucket ASC
  `

  return rows.map((r) => ({
    timestamp: r.bucket.toISOString(),
    p50: Math.round(r.p50 ?? 0),
    p95: Math.round(r.p95 ?? 0),
    p99: Math.round(r.p99 ?? 0),
    count: Number(r.count),
  }))
}

export async function getErrorRateTrend(routeId?: string, days = 7): Promise<ErrorTrendPoint[]> {
  const since = buildDateFilter(days)

  const routeFilter = routeId
    ? Prisma.sql`AND "routeId" = ${routeId}`
    : Prisma.empty

  const rows = await prisma.$queryRaw<
    {
      bucket: Date
      total: bigint
      errors: bigint
    }[]
  >`
    SELECT
      date_trunc('hour', "createdAt") AS bucket,
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE "responseStatus" >= 400 OR error IS NOT NULL)::bigint AS errors
    FROM "RequestLog"
    WHERE "createdAt" >= ${since}
      ${routeFilter}
    GROUP BY bucket
    ORDER BY bucket ASC
  `

  return rows.map((r) => {
    const total = Number(r.total)
    const errors = Number(r.errors)
    return {
      timestamp: r.bucket.toISOString(),
      total,
      errors,
      errorRate: total > 0 ? Math.round((errors / total) * 10000) / 100 : 0,
    }
  })
}

export async function getTrafficHeatmap(routeId?: string, days = 28): Promise<HeatmapCell[]> {
  const since = buildDateFilter(days)

  const routeFilter = routeId
    ? Prisma.sql`AND "routeId" = ${routeId}`
    : Prisma.empty

  const rows = await prisma.$queryRaw<
    {
      dow: number
      hour: number
      count: bigint
    }[]
  >`
    SELECT
      EXTRACT(DOW FROM "createdAt")::int AS dow,
      EXTRACT(HOUR FROM "createdAt")::int AS hour,
      COUNT(*)::bigint AS count
    FROM "RequestLog"
    WHERE "createdAt" >= ${since}
      ${routeFilter}
    GROUP BY dow, hour
    ORDER BY dow, hour
  `

  // Build full 7x24 matrix, filling in zeros
  const map = new Map<string, number>()
  for (const row of rows) {
    map.set(`${row.dow}-${row.hour}`, Number(row.count))
  }

  const result: HeatmapCell[] = []
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      result.push({
        dayOfWeek: day,
        hour,
        count: map.get(`${day}-${hour}`) ?? 0,
      })
    }
  }

  return result
}

export async function getSlowestRoutes(limit = 10): Promise<SlowestRoute[]> {
  const since = buildDateFilter(7)

  const rows = await prisma.$queryRaw<
    {
      routeId: string
      routeName: string
      publicPath: string
      avg_duration: number
      p95_duration: number | null
      request_count: bigint
    }[]
  >`
    SELECT
      r.id AS "routeId",
      r.name AS "routeName",
      r."publicPath" AS "publicPath",
      AVG(l.duration)::float AS avg_duration,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY l.duration) AS p95_duration,
      COUNT(l.id)::bigint AS request_count
    FROM "RequestLog" l
    JOIN "Route" r ON r.id = l."routeId"
    WHERE l."createdAt" >= ${since}
      AND l.duration IS NOT NULL
      AND r."deletedAt" IS NULL
    GROUP BY r.id, r.name, r."publicPath"
    ORDER BY avg_duration DESC
    LIMIT ${limit}
  `

  return rows.map((r) => ({
    routeId: r.routeId,
    routeName: r.routeName,
    publicPath: r.publicPath,
    avgDuration: Math.round(r.avg_duration),
    p95Duration: Math.round(r.p95_duration ?? 0),
    requestCount: Number(r.request_count),
  }))
}

export async function getStatusDistribution(routeId?: string, days = 7): Promise<StatusBucket[]> {
  const since = buildDateFilter(days)

  const routeFilter = routeId
    ? Prisma.sql`AND "routeId" = ${routeId}`
    : Prisma.empty

  const rows = await prisma.$queryRaw<
    {
      bucket: string
      count: bigint
    }[]
  >`
    SELECT
      CASE
        WHEN "responseStatus" >= 200 AND "responseStatus" < 300 THEN '2xx'
        WHEN "responseStatus" >= 300 AND "responseStatus" < 400 THEN '3xx'
        WHEN "responseStatus" >= 400 AND "responseStatus" < 500 THEN '4xx'
        WHEN "responseStatus" >= 500 THEN '5xx'
        ELSE 'unknown'
      END AS bucket,
      COUNT(*)::bigint AS count
    FROM "RequestLog"
    WHERE "createdAt" >= ${since}
      ${routeFilter}
      AND "responseStatus" IS NOT NULL
    GROUP BY bucket
    ORDER BY bucket ASC
  `

  return rows.map((r) => ({
    bucket: r.bucket,
    count: Number(r.count),
  }))
}
