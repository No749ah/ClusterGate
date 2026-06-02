import { Prisma, Route, RouteStatus } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { AppError } from '../lib/errors'
import { activeRoutesTotal } from '../lib/metrics'
import { validateTargetUrl, isSafeRegex } from '../lib/security'
import { encryptSecret } from '../lib/crypto'
import { slugify, looksLikeCuid } from '../lib/slug'

/**
 * Pick a slug that doesn't collide with any existing Route. Adds -2, -3, … if
 * needed. `excludeId` lets a Route's own row be ignored when updating.
 */
async function pickRouteSlug(name: string, excludeId?: string): Promise<string | null> {
  const base = slugify(name)
  if (!base) return null
  let candidate = base
  for (let i = 1; i < 100; i++) {
    const clash = await prisma.route.findFirst({
      where: { slug: candidate, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
      select: { id: true },
    })
    if (!clash) return candidate
    i++
    candidate = `${base}-${i}`
  }
  return null
}

/** Resolve a Route by either its cuid id or its slug. */
export async function findRouteByIdOrSlug(idOrSlug: string) {
  if (looksLikeCuid(idOrSlug)) {
    const byId = await prisma.route.findUnique({ where: { id: idOrSlug } })
    if (byId) return byId
  }
  return prisma.route.findUnique({ where: { slug: idOrSlug } })
}

export interface RouteFilters {
  search?: string
  status?: RouteStatus
  isActive?: boolean
  tags?: string[]
  environment?: 'NONE' | 'PRODUCTION' | 'STAGING' | 'DEVELOPMENT'
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
    ...(filters.environment && { environment: filters.environment as any }),
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

export async function getRouteById(idOrSlug: string) {
  const where = looksLikeCuid(idOrSlug)
    ? { id: idOrSlug, deletedAt: null }
    : { slug: idOrSlug, deletedAt: null }
  const route = await prisma.route.findFirst({
    where,
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

/**
 * Convert a URL parameter (either a cuid id or a slug) into the route's real
 * cuid id. Returns null when nothing matches. Use this at the top of router
 * handlers that interact with Prisma directly (rather than via getRouteById).
 */
export async function resolveRouteId(idOrSlug: string): Promise<string | null> {
  if (looksLikeCuid(idOrSlug)) {
    const exists = await prisma.route.findUnique({ where: { id: idOrSlug }, select: { id: true } })
    if (exists) return exists.id
  }
  const bySlug = await prisma.route.findUnique({ where: { slug: idOrSlug }, select: { id: true } })
  return bySlug?.id ?? null
}

// A soft-deleted route still occupies its publicPath in the unique index.
// Mangle that deleted record's path so a new route can reuse it. Handles routes
// deleted before path-freeing was added on delete.
async function freeSoftDeletedPublicPath(publicPath: string) {
  const stale = await prisma.route.findFirst({
    where: { publicPath, deletedAt: { not: null } },
    select: { id: true, publicPath: true },
  })
  if (stale) {
    await prisma.route.update({
      where: { id: stale.id },
      data: { publicPath: `${stale.publicPath}__deleted_${stale.id}` },
    })
  }
}

export async function createRoute(data: Prisma.RouteUncheckedCreateInput, userId: string) {
  // Normalise the target URL: trim a trailing "/*" or "/" so the proxy's
  // suffix-append logic produces a clean URL when the public path is a
  // wildcard. Without this, e.g. target "https://x/abc/*" produces "/abc/*/def".
  if (typeof data.targetUrl === 'string') {
    data.targetUrl = data.targetUrl.replace(/\/\*$/, '').replace(/\/$/, '')
  }

  // Validate target URL (format + SSRF protection)
  try {
    await validateTargetUrl(data.targetUrl as string)
  } catch (err) {
    throw AppError.badRequest((err as Error).message)
  }

  await freeSoftDeletedPublicPath(data.publicPath as string)

  // Encrypt secrets at rest
  for (const f of ['authValue', 'upstreamAuthValue', 'webhookSecret'] as const) {
    if ((data as any)[f]) (data as any)[f] = encryptSecret((data as any)[f])
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

  // Auto-derive a URL-safe slug from the name so detail pages can use it
  // instead of the cuid id. Falls back to id-only URLs if the name has no
  // slug-friendly characters.
  if (typeof data.name === 'string' && !('slug' in data && data.slug)) {
    (data as any).slug = await pickRouteSlug(data.name)
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

  // Refresh the URL slug when the name changes so /routes/<slug> stays
  // meaningful. Skips re-derivation if the slug was set explicitly.
  if (typeof data.name === 'string' && data.name !== existing.name && !('slug' in data && data.slug)) {
    (data as any).slug = await pickRouteSlug(data.name, id)
  }

  // Validate target URL if changed (SSRF protection)
  if (data.targetUrl) {
    if (typeof data.targetUrl === 'string') {
      data.targetUrl = data.targetUrl.replace(/\/\*$/, '').replace(/\/$/, '')
    }
    try {
      await validateTargetUrl(data.targetUrl as string)
    } catch (err) {
      throw AppError.badRequest((err as Error).message)
    }
  }

  // Don't overwrite secrets with the masked placeholder returned by GET;
  // encrypt any real new secret values at rest.
  for (const field of ['authValue', 'webhookSecret', 'upstreamAuthValue'] as const) {
    if ((data as any)[field] === '••••••••') delete (data as any)[field]
    else if ((data as any)[field]) (data as any)[field] = encryptSecret((data as any)[field])
  }

  // If the publicPath is changing to one held by a soft-deleted route, free it
  if (typeof data.publicPath === 'string' && data.publicPath !== existing.publicPath) {
    await freeSoftDeletedPublicPath(data.publicPath)
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

  // Create a new version whenever any configuration field actually changes.
  // We diff every field in the update payload except volatile/runtime ones, so
  // new config fields are versioned automatically without maintaining a list.
  const NON_VERSIONED = new Set([
    'id', 'createdAt', 'updatedAt', 'version', 'deletedAt', 'createdById', 'updatedById',
    'cbState', 'cbFailureCount', 'cbLastFailureAt', 'lbRrIndex',
  ])
  const hasChanges = Object.keys(data).some((field) => {
    if (NON_VERSIONED.has(field)) return false
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

export async function deleteRoute(id: string, confirmName?: string) {
  const route = await prisma.route.findUnique({ where: { id, deletedAt: null } })
  if (!route) throw AppError.notFound('Route')

  // A live route can't be deleted — deactivate it first to avoid taking down
  // production traffic by accident. (Deactivated/published-but-inactive is fine.)
  if (route.isActive) {
    throw AppError.badRequest('Deactivate this route before deleting it')
  }
  // Protected (production) routes require typing the exact name to confirm.
  if ((route as any).protected && confirmName !== route.name) {
    throw AppError.badRequest('This route is protected — confirm the exact route name to delete it')
  }

  // Free the publicPath so it can be reused — the DB unique constraint covers
  // soft-deleted rows too, so we mangle the path on the deleted record.
  await prisma.route.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false, publicPath: `${route.publicPath}__deleted_${id}` },
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
  // Mirror every saveable, non-secret config field so an exported route can be
  // re-imported and behave identically. Secret values (authValue,
  // upstreamAuthValue, webhookSecret) are deliberately omitted.
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
      environment: true,
      timeout: true,
      retryCount: true,
      retryDelay: true,
      stripPrefix: true,
      sslVerify: true,
      streamResponse: true,
      rewriteRedirects: true,
      requestBodyLimit: true,
      addHeaders: true,
      removeHeaders: true,
      rewriteRules: true,
      corsEnabled: true,
      corsOrigins: true,
      ipAllowlist: true,
      requireAuth: true,
      authType: true,
      upstreamAuthType: true,
      upstreamAuthHeader: true,
      targetType: true,
      healthCheckMethod: true,
      healthCheckPath: true,
      healthCheckBody: true,
      healthCheckInterval: true,
      maintenanceMode: true,
      maintenanceMessage: true,
      // Traffic shaping & reliability
      rateLimitEnabled: true,
      rateLimitMax: true,
      rateLimitWindow: true,
      wsEnabled: true,
      circuitBreakerEnabled: true,
      cbFailureThreshold: true,
      cbRecoveryTimeout: true,
      lbStrategy: true,
      protected: true,
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

/**
 * Bulk-apply metadata changes to many routes at once: set environment, move to
 * a group/clear it, and/or append tags (deduplicated). Tag appends need a
 * per-row merge, so those run in a transaction; the rest is a single updateMany.
 */
export async function bulkUpdate(
  ids: string[],
  patch: { environment?: 'NONE' | 'PRODUCTION' | 'STAGING' | 'DEVELOPMENT'; routeGroupId?: string | null; addTags?: string[] },
  userId: string
): Promise<number> {
  const base: Record<string, unknown> = { updatedById: userId }
  if (patch.environment) base.environment = patch.environment
  if (patch.routeGroupId !== undefined) base.routeGroupId = patch.routeGroupId

  const cleanTags = (patch.addTags ?? []).map((t) => t.trim()).filter(Boolean)

  if (cleanTags.length === 0) {
    const result = await prisma.route.updateMany({
      where: { id: { in: ids }, deletedAt: null },
      data: base,
    })
    return result.count
  }

  // Append tags per-row so we can deduplicate against each route's existing tags
  const routes = await prisma.route.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: { id: true, tags: true },
  })
  await prisma.$transaction(
    routes.map((r) =>
      prisma.route.update({
        where: { id: r.id },
        data: { ...base, tags: Array.from(new Set([...r.tags, ...cleanTags])) },
      })
    )
  )
  return routes.length
}

export async function bulkDelete(ids: string[]) {
  const routes = await prisma.route.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: { id: true, publicPath: true },
  })
  const now = new Date()
  // Mangle each publicPath individually so the freed paths can be reused.
  await prisma.$transaction(
    routes.map((r) =>
      prisma.route.update({
        where: { id: r.id },
        data: { deletedAt: now, isActive: false, publicPath: `${r.publicPath}__deleted_${r.id}` },
      })
    )
  )
  return routes.length
}

async function updateActiveRoutesMetric() {
  const count = await prisma.route.count({
    where: { isActive: true, status: RouteStatus.PUBLISHED, deletedAt: null },
  })
  activeRoutesTotal.set(count)
}
