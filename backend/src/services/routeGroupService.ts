import { prisma } from '../lib/prisma'
import { AppError } from '../lib/errors'

export async function getRouteGroups(filters?: { teamId?: string; search?: string }) {
  const where: any = {}
  if (filters?.teamId) where.teamId = filters.teamId
  if (filters?.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { pathPrefix: { contains: filters.search, mode: 'insensitive' } },
    ]
  }

  return prisma.routeGroup.findMany({
    where,
    include: {
      team: { select: { id: true, name: true } },
      _count: { select: { routes: true } },
    },
    orderBy: { name: 'asc' },
  })
}

export async function getRouteGroupById(id: string) {
  const group = await prisma.routeGroup.findUnique({
    where: { id },
    include: {
      team: { select: { id: true, name: true } },
      routes: {
        where: { deletedAt: null },
        select: { id: true, name: true, publicPath: true, status: true, isActive: true },
        orderBy: { name: 'asc' },
      },
    },
  })
  if (!group) throw AppError.notFound('Route group')
  return group
}

export async function createRouteGroup(data: {
  name: string
  description?: string
  pathPrefix: string
  teamId?: string
  defaultTimeout?: number
  defaultRetryCount?: number
  defaultRateLimitEnabled?: boolean
  defaultRateLimitMax?: number
  defaultRateLimitWindow?: number
  defaultAuthType?: string
  defaultAuthValue?: string
  defaultAddHeaders?: Record<string, string>
  defaultRemoveHeaders?: string[]
  defaultCorsEnabled?: boolean
  defaultCorsOrigins?: string[]
  defaultIpAllowlist?: string[]
}) {
  // Ensure pathPrefix starts with /r/
  if (!data.pathPrefix.startsWith('/r/')) {
    throw AppError.badRequest('Path prefix must start with /r/')
  }

  // Check uniqueness
  const existing = await prisma.routeGroup.findUnique({
    where: { pathPrefix: data.pathPrefix },
  })
  if (existing) {
    throw AppError.conflict(`Path prefix "${data.pathPrefix}" is already in use`)
  }

  return prisma.routeGroup.create({
    data: {
      name: data.name,
      description: data.description,
      pathPrefix: data.pathPrefix,
      teamId: data.teamId,
      defaultTimeout: data.defaultTimeout,
      defaultRetryCount: data.defaultRetryCount,
      defaultRateLimitEnabled: data.defaultRateLimitEnabled,
      defaultRateLimitMax: data.defaultRateLimitMax,
      defaultRateLimitWindow: data.defaultRateLimitWindow,
      defaultAuthType: data.defaultAuthType as any,
      defaultAuthValue: data.defaultAuthValue,
      defaultAddHeaders: data.defaultAddHeaders,
      defaultRemoveHeaders: data.defaultRemoveHeaders ?? [],
      defaultCorsEnabled: data.defaultCorsEnabled,
      defaultCorsOrigins: data.defaultCorsOrigins ?? [],
      defaultIpAllowlist: data.defaultIpAllowlist ?? [],
    },
    include: {
      team: { select: { id: true, name: true } },
      _count: { select: { routes: true } },
    },
  })
}

export async function updateRouteGroup(id: string, data: Partial<{
  name: string
  description: string | null
  pathPrefix: string
  teamId: string | null
  isActive: boolean
  defaultTimeout: number | null
  defaultRetryCount: number | null
  defaultRateLimitEnabled: boolean | null
  defaultRateLimitMax: number | null
  defaultRateLimitWindow: number | null
  defaultAuthType: string | null
  defaultAuthValue: string | null
  defaultAddHeaders: Record<string, string> | null
  defaultRemoveHeaders: string[]
  defaultCorsEnabled: boolean | null
  defaultCorsOrigins: string[]
  defaultIpAllowlist: string[]
}>) {
  const group = await prisma.routeGroup.findUnique({ where: { id } })
  if (!group) throw AppError.notFound('Route group')

  if (data.pathPrefix && data.pathPrefix !== group.pathPrefix) {
    if (!data.pathPrefix.startsWith('/r/')) {
      throw AppError.badRequest('Path prefix must start with /r/')
    }
    const existing = await prisma.routeGroup.findUnique({ where: { pathPrefix: data.pathPrefix } })
    if (existing) throw AppError.conflict(`Path prefix "${data.pathPrefix}" is already in use`)
  }

  return prisma.routeGroup.update({
    where: { id },
    data: data as any,
    include: {
      team: { select: { id: true, name: true } },
      _count: { select: { routes: true } },
    },
  })
}

export async function deleteRouteGroup(id: string) {
  const group = await prisma.routeGroup.findUnique({
    where: { id },
    include: { _count: { select: { routes: true } } },
  })
  if (!group) throw AppError.notFound('Route group')

  // Unlink routes before deleting
  await prisma.route.updateMany({
    where: { routeGroupId: id },
    data: { routeGroupId: null },
  })

  await prisma.routeGroup.delete({ where: { id } })
}

export async function assignRouteToGroup(routeId: string, routeGroupId: string | null) {
  return prisma.route.update({
    where: { id: routeId },
    data: { routeGroupId },
  })
}
