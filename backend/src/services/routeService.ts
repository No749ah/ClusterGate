import { Prisma, Route, RouteStatus } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { AppError } from '../lib/errors'
import { activeRoutesTotal } from '../lib/metrics'
import { validateTargetUrl, isSafeRegex } from '../lib/security'

export interface RouteFilters {
  search?: string
  status?: RouteStatus
  isActive?: boolean
  tags?: string[]
  organizationIds?: string[] // scope to user's orgs
  organizationId?: string    // filter by single org
}

export interface Pagination {
  page: number
  pageSize: number
  sortBy?: string
  sortDir?: 'asc' | 'desc'
}

export interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export async function getRoutes(
  filters: RouteFilters = {},
  pagination: Pagination = { page: 1, pageSize: 20 }
): Promise<PaginatedResult<Route>> {
  const { page, pageSize, sortBy = 'createdAt', sortDir = 'desc' } = pagination
  const skip = (page - 1) * pageSize

  const where: Prisma.RouteWhereInput = {
    deletedAt: null,
    ...(filters.search && {
      OR: [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
        { publicPath: { contains: filters.search, mode: 'insensitive' } },
        { targetUrl: { contains: filters.search, mode: 'insensitive' } },
      ],
    }),
    ...(filters.status !== undefined && { status: filters.status }),
    ...(filters.isActive !== undefined && { isActive: filters.isActive }),
    ...(filters.tags && filters.tags.length > 0 && {
      tags: { hasSome: filters.tags },
    }),
    // Org scoping: non-admins see only their org's routes
    ...(filters.organizationIds && {
      organizationId: { in: filters.organizationIds },
    }),
    // Single org filter
    ...(filters.organizationId && {
      organizationId: filters.organizationId,
    }),
  }

  const validSortFields = ['name', 'createdAt', 'updatedAt', 'status']
  const orderByField = validSortFields.includes(sortBy) ? sortBy : 'createdAt'

  const [data, total] = await prisma.$transaction([
    prisma.route.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { [orderByField]: sortDir },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        updatedBy: { select: { id: true, name: true, email: true } },
        organization: { select: { id: true, name: true, slug: true } },
        healthChecks: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        _count: { select: { requestLogs: true } },
      },
    }),
    prisma.route.count({ where }),
  ])

  return {
    data,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
}

export async function getRouteById(id: string) {
  const route = await prisma.route.findUnique({
    where: { id, deletedAt: null },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      updatedBy: { select: { id: true, name: true, email: true } },
      organization: { select: { id: true, name: true, slug: true } },
      healthChecks: { orderBy: { createdAt: 'desc' }, take: 1 },
      apiKeys: { where: { isActive: true }, select: { id: true, name: true, lastUsedAt: true, expiresAt: true } },
      _count: { select: { requestLogs: true, versions: true } },
    },
  })

  if (!route) throw AppError.notFound('Route')
  return route
}

export async function createRoute(data: Prisma.RouteUncheckedCreateInput, userId: string) {
  // Validate target URL (format + SSRF protection)
  try {
    await validateTargetUrl(data.targetUrl as string)
  } catch (err) {
    throw AppError.badRequest((err as Error).message)
  }

  // Validate path starts with /
  const publicPath = data.publicPath as string
  if (!publicPath.startsWith('/')) {
    throw AppError.badRequest('Public path must start with /')
  }

  // Validate rewrite rules are safe regex patterns
  const rewriteRules = data.rewriteRules as unknown as Array<{ from: string; to: string }> | undefined
  if (rewriteRules) {
    for (const rule of rewriteRules) {
      if (!isSafeRegex(rule.from)) {
        throw AppError.badRequest(`Unsafe regex pattern in rewrite rule: ${rule.from}`)
      }
    }
  }

  const route = await prisma.route.create({
    data: {
      ...data,
      createdById: userId,
      updatedById: userId,
    },
  })

  // Save initial version
  await prisma.routeVersion.create({
    data: {
      routeId: route.id,
      version: 1,
      snapshot: route as unknown as Prisma.InputJsonValue,
      createdById: userId,
    },
  })

  return route
}

export async function updateRoute(id: string, data: Partial<Prisma.RouteUncheckedUpdateInput>, userId: string) {
  const existing = await prisma.route.findUnique({ where: { id, deletedAt: null } })
  if (!existing) throw AppError.notFound('Route')

  // Validate target URL if changed (SSRF protection)
  if (data.targetUrl) {
    try {
      await validateTargetUrl(data.targetUrl as string)
    } catch (err) {
      throw AppError.badRequest((err as Error).message)
    }
  }

  // Validate rewrite rules if changed
  const rewriteRules = data.rewriteRules as unknown as Array<{ from: string; to: string }> | undefined
  if (rewriteRules) {
    for (const rule of rewriteRules) {
      if (!isSafeRegex(rule.from)) {
        throw AppError.badRequest(`Unsafe regex pattern in rewrite rule: ${rule.from}`)
      }
    }
  }

  // Check if any fields actually changed before creating a new version
  const versionableFields = ['name', 'path', 'targetUrl', 'methods', 'isActive', 'stripPrefix',
    'customHeaders', 'rewriteRules', 'timeout', 'maxRetries', 'retryDelay',
    'maintenanceMode', 'maintenanceMessage', 'webhookUrl', 'webhookSecret', 'webhookEvents',
    'wsEnabled', 'cbEnabled', 'cbThreshold', 'cbTimeout', 'cbHalfOpenMax',
    'organizationId', 'routeGroupId'] as const
  const hasChanges = versionableFields.some((field) => {
    if (!(field in data)) return false
    const oldVal = JSON.stringify((existing as any)[field])
    const newVal = JSON.stringify((data as any)[field])
    return oldVal !== newVal
  })

  const route = await prisma.route.update({
    where: { id },
    data: {
      ...data,
      ...(hasChanges ? { version: { increment: 1 } } : {}),
      updatedById: userId,
    },
  })

  // Save version snapshot only if something changed
  if (hasChanges) {
    await prisma.routeVersion.create({
      data: {
        routeId: route.id,
        version: route.version,
        snapshot: route as unknown as Prisma.InputJsonValue,
        createdById: userId,
      },
    })
  }

  return route
}

export async function deleteRoute(id: string) {
  const route = await prisma.route.findUnique({ where: { id, deletedAt: null } })
  if (!route) throw AppError.notFound('Route')

  await prisma.route.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false },
  })

  await updateActiveRoutesMetric()
}

export async function publishRoute(id: string, userId: string) {
  const route = await prisma.route.findUnique({ where: { id, deletedAt: null } })
  if (!route) throw AppError.notFound('Route')

  const updated = await prisma.route.update({
    where: { id },
    data: { status: RouteStatus.PUBLISHED, isActive: true, updatedById: userId },
  })

  await updateActiveRoutesMetric()
  return updated
}

export async function deactivateRoute(id: string, userId: string) {
  const route = await prisma.route.findUnique({ where: { id, deletedAt: null } })
  if (!route) throw AppError.notFound('Route')

  const updated = await prisma.route.update({
    where: { id },
    data: { isActive: false, updatedById: userId },
  })

  await updateActiveRoutesMetric()
  return updated
}

export async function duplicateRoute(id: string, userId: string) {
  const route = await prisma.route.findUnique({ where: { id, deletedAt: null } })
  if (!route) throw AppError.notFound('Route')

  const {
    id: _id,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    deletedAt: _deletedAt,
    version: _version,
    createdById: _createdById,
    updatedById: _updatedById,
    ...routeData
  } = route

  // Find unique path
  let publicPath = `${routeData.publicPath}-copy`
  let attempts = 0
  while (attempts < 10) {
    const exists = await prisma.route.findFirst({
      where: { publicPath, deletedAt: null },
    })
    if (!exists) break
    attempts++
    publicPath = `${routeData.publicPath}-copy-${attempts}`
  }

  return prisma.route.create({
    data: {
      ...routeData,
      addHeaders: routeData.addHeaders ?? undefined,
      rewriteRules: routeData.rewriteRules ?? undefined,
      name: `${routeData.name} (Copy)`,
      publicPath,
      status: RouteStatus.DRAFT,
      isActive: false,
      version: 1,
      createdById: userId,
      updatedById: userId,
    } as Prisma.RouteUncheckedCreateInput,
  })
}

export async function getRouteVersions(routeId: string) {
  const route = await prisma.route.findUnique({ where: { id: routeId, deletedAt: null } })
  if (!route) throw AppError.notFound('Route')

  return prisma.routeVersion.findMany({
    where: { routeId },
    orderBy: { version: 'desc' },
    include: { createdBy: { select: { id: true, name: true, email: true } } },
  })
}

export async function restoreRouteVersion(routeId: string, versionId: string, userId: string) {
  const version = await prisma.routeVersion.findFirst({
    where: { id: versionId, routeId },
  })
  if (!version) throw AppError.notFound('Version')

  const snapshot = version.snapshot as unknown as Record<string, unknown>
  const {
    id: _id,
    version: _ver,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    createdById: _createdById,
    updatedById: _updatedById,
    ...restoreData
  } = snapshot

  return updateRoute(routeId, restoreData as Prisma.RouteUncheckedUpdateInput, userId)
}

export async function exportRoutes() {
  const routes = await prisma.route.findMany({
    where: { deletedAt: null },
    select: {
      name: true,
      description: true,
      publicPath: true,
      targetUrl: true,
      methods: true,
      status: true,
      tags: true,
      timeout: true,
      retryCount: true,
      retryDelay: true,
      stripPrefix: true,
      requestBodyLimit: true,
      addHeaders: true,
      removeHeaders: true,
      rewriteRules: true,
      corsEnabled: true,
      corsOrigins: true,
      ipAllowlist: true,
      requireAuth: true,
      authType: true,
      maintenanceMode: true,
      maintenanceMessage: true,
    },
  })
  return routes
}

export async function importRoutes(
  routesData: unknown[],
  userId: string
): Promise<{ created: number; errors: string[] }> {
  let created = 0
  const errors: string[] = []

  for (const routeData of routesData) {
    try {
      await createRoute(routeData as Prisma.RouteUncheckedCreateInput, userId)
      created++
    } catch (err) {
      errors.push((err as Error).message)
    }
  }

  return { created, errors }
}

export async function bulkPublish(ids: string[], userId: string) {
  const result = await prisma.route.updateMany({
    where: { id: { in: ids }, deletedAt: null },
    data: { status: 'PUBLISHED', isActive: true, updatedById: userId },
  })
  return result.count
}

export async function bulkDeactivate(ids: string[], userId: string) {
  const result = await prisma.route.updateMany({
    where: { id: { in: ids }, deletedAt: null },
    data: { isActive: false, updatedById: userId },
  })
  return result.count
}

export async function bulkDelete(ids: string[]) {
  const result = await prisma.route.updateMany({
    where: { id: { in: ids }, deletedAt: null },
    data: { deletedAt: new Date() },
  })
  return result.count
}

async function updateActiveRoutesMetric() {
  const count = await prisma.route.count({
    where: { isActive: true, status: RouteStatus.PUBLISHED, deletedAt: null },
  })
  activeRoutesTotal.set(count)
}
