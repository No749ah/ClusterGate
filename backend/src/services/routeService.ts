import { Prisma, Route, RouteStatus } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { AppError } from '../lib/errors'
import { activeRoutesTotal } from '../lib/metrics'

export interface RouteFilters {
  search?: string
  domain?: string
  status?: RouteStatus
  isActive?: boolean
  tags?: string[]
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
        { domain: { contains: filters.search, mode: 'insensitive' } },
        { publicPath: { contains: filters.search, mode: 'insensitive' } },
        { targetUrl: { contains: filters.search, mode: 'insensitive' } },
      ],
    }),
    ...(filters.domain && { domain: filters.domain }),
    ...(filters.status !== undefined && { status: filters.status }),
    ...(filters.isActive !== undefined && { isActive: filters.isActive }),
    ...(filters.tags && filters.tags.length > 0 && {
      tags: { hasSome: filters.tags },
    }),
  }

  const validSortFields = ['name', 'domain', 'createdAt', 'updatedAt', 'status']
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
      healthChecks: { orderBy: { createdAt: 'desc' }, take: 1 },
      apiKeys: { where: { isActive: true }, select: { id: true, name: true, lastUsedAt: true, expiresAt: true } },
      _count: { select: { requestLogs: true, versions: true } },
    },
  })

  if (!route) throw AppError.notFound('Route')
  return route
}

export async function createRoute(data: Prisma.RouteCreateInput, userId: string) {
  // Validate domain format
  const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-_.]*\.[a-zA-Z]{2,}$/
  if (!domainRegex.test(data.domain as string)) {
    throw AppError.badRequest('Invalid domain format')
  }

  // Validate target URL
  try {
    new URL(data.targetUrl as string)
  } catch {
    throw AppError.badRequest('Invalid target URL format')
  }

  // Validate path starts with /
  const publicPath = data.publicPath as string
  if (!publicPath.startsWith('/')) {
    throw AppError.badRequest('Public path must start with /')
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

export async function updateRoute(id: string, data: Partial<Prisma.RouteUpdateInput>, userId: string) {
  const existing = await prisma.route.findUnique({ where: { id, deletedAt: null } })
  if (!existing) throw AppError.notFound('Route')

  const route = await prisma.route.update({
    where: { id },
    data: {
      ...data,
      version: { increment: 1 },
      updatedById: userId,
    },
  })

  // Save version snapshot
  await prisma.routeVersion.create({
    data: {
      routeId: route.id,
      version: route.version,
      snapshot: route as unknown as Prisma.InputJsonValue,
      createdById: userId,
    },
  })

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
      where: { domain: routeData.domain, publicPath, deletedAt: null },
    })
    if (!exists) break
    attempts++
    publicPath = `${routeData.publicPath}-copy-${attempts}`
  }

  return prisma.route.create({
    data: {
      ...routeData,
      name: `${routeData.name} (Copy)`,
      publicPath,
      status: RouteStatus.DRAFT,
      isActive: false,
      version: 1,
      createdById: userId,
      updatedById: userId,
    },
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

  return updateRoute(routeId, restoreData as Prisma.RouteUpdateInput, userId)
}

export async function exportRoutes() {
  const routes = await prisma.route.findMany({
    where: { deletedAt: null },
    select: {
      name: true,
      description: true,
      domain: true,
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
      await createRoute(routeData as Prisma.RouteCreateInput, userId)
      created++
    } catch (err) {
      errors.push((err as Error).message)
    }
  }

  return { created, errors }
}

async function updateActiveRoutesMetric() {
  const count = await prisma.route.count({
    where: { isActive: true, status: RouteStatus.PUBLISHED, deletedAt: null },
  })
  activeRoutesTotal.set(count)
}
