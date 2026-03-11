import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { logger } from '../lib/logger'

export async function createAuditLog(params: {
  userId?: string | null
  action: string
  resource: string
  resourceId?: string
  details?: Record<string, unknown>
  ip?: string
  userAgent?: string
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId ?? undefined,
        action: params.action,
        resource: params.resource,
        resourceId: params.resourceId,
        details: params.details ? JSON.parse(JSON.stringify(params.details)) : {},
        ip: params.ip,
        userAgent: params.userAgent,
      },
    })
  } catch (err) {
    logger.warn('Failed to write audit log', { error: (err as Error).message })
  }
}

export interface AuditLogFilters {
  userId?: string
  action?: string
  resource?: string
  resourceId?: string
  dateFrom?: Date
  dateTo?: Date
}

export async function getAuditLogs(
  filters: AuditLogFilters = {},
  pagination = { page: 1, pageSize: 50 }
) {
  const { page, pageSize } = pagination
  const skip = (page - 1) * pageSize

  const where: Prisma.AuditLogWhereInput = {
    ...(filters.userId && { userId: filters.userId }),
    ...(filters.action && { action: { contains: filters.action, mode: 'insensitive' } }),
    ...(filters.resource && { resource: filters.resource }),
    ...(filters.resourceId && { resourceId: filters.resourceId }),
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
    prisma.auditLog.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.auditLog.count({ where }),
  ])

  return {
    data,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
}
