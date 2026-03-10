import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { logger } from '../lib/logger'

export interface LogFilters {
  routeId?: string
  method?: string
  statusType?: 'success' | 'error'
  dateFrom?: Date
  dateTo?: Date
  search?: string
}

export async function getRouteLogs(filters: LogFilters, pagination = { page: 1, pageSize: 50 }) {
  const { page, pageSize } = pagination
  const skip = (page - 1) * pageSize

  const where: Prisma.RequestLogWhereInput = {
    ...(filters.routeId && { routeId: filters.routeId }),
    ...(filters.method && { method: filters.method.toUpperCase() }),
    ...(filters.statusType === 'success' && {
      responseStatus: { gte: 200, lt: 400 },
    }),
    ...(filters.statusType === 'error' && {
      OR: [
        { responseStatus: { gte: 400 } },
        { error: { not: null } },
      ],
    }),
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
      where: { routeId, OR: [{ responseStatus: { gte: 400 } }, { error: { not: null } }] },
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
      ...(routeId && { routeId }),
      OR: [{ responseStatus: { gte: 400 } }, { error: { not: null } }],
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
    select: { createdAt: true, responseStatus: true },
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
      if (log.responseStatus && log.responseStatus >= 400) {
        grouped[key].errors++
      }
    }
  }

  return Object.entries(grouped).map(([date, counts]) => ({ date, ...counts }))
}
