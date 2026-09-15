import { randomBytes, createHash } from 'crypto'
import { prisma } from '../lib/prisma'
import { AppError } from '../lib/errors'

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

// ---- Validation cache + batched usage tracking -----------------------------
// Auth runs on every proxied request, so we cache positive lookups briefly and
// flush usage counters in the background to avoid a DB read+write per request.
const POSITIVE_TTL_MS = 30_000
const validCache = new Map<string, { id: string; scope: string; cacheUntil: number }>()
const pendingUsage = new Map<string, { count: number; ip?: string }>()

function recordUsage(id: string, ip?: string) {
  const cur = pendingUsage.get(id) || { count: 0 }
  cur.count += 1
  if (ip) cur.ip = ip
  pendingUsage.set(id, cur)
}

async function flushUsage() {
  if (pendingUsage.size === 0) return
  const entries = [...pendingUsage.entries()]
  pendingUsage.clear()
  const now = new Date()
  await Promise.all(entries.map(([id, u]) =>
    prisma.apiKey.update({
      where: { id },
      data: { lastUsedAt: now, usageCount: { increment: u.count }, ...(u.ip ? { lastUsedIp: u.ip } : {}) },
    }).catch(() => {})
  ))
}

const flushTimer = setInterval(() => { flushUsage().catch(() => {}) }, 15_000)
// Don't keep the process alive just for the flush timer (e.g. in tests)
if (typeof flushTimer.unref === 'function') flushTimer.unref()

function invalidateCache() {
  validCache.clear()
}

/**
 * Drop cached key validations on every replica. Called when the set of routes
 * a key covers changes indirectly — e.g. a route moves between folders that
 * keys are bound to — so access is withdrawn promptly, not after the TTL.
 */
export function invalidateApiKeyCaches() {
  invalidateCache()
  bumpRevokeEpoch().catch(() => {})
}

// Cross-replica invalidation: revokes bump a DB epoch; every pod polls it and
// clears its local cache when it changes, so a revoked key stops working on all
// pods within the poll interval (rather than only after the per-entry TTL).
let lastSeenEpoch = ''
async function bumpRevokeEpoch() {
  try {
    await prisma.systemSetting.upsert({
      where: { key: 'apiKeyRevokeEpoch' },
      create: { key: 'apiKeyRevokeEpoch', value: { v: Date.now() } },
      update: { value: { v: Date.now() } },
    })
  } catch { /* best effort */ }
}
async function pollRevokeEpoch() {
  try {
    const row = await prisma.systemSetting.findUnique({ where: { key: 'apiKeyRevokeEpoch' } })
    const v = row?.value ? String((row.value as any).v) : ''
    if (lastSeenEpoch && v !== lastSeenEpoch) invalidateCache()
    lastSeenEpoch = v
  } catch { /* ignore */ }
}
const epochTimer = setInterval(() => { pollRevokeEpoch().catch(() => {}) }, 10_000)
if (typeof epochTimer.unref === 'function') epochTimer.unref()

const routeRef = { select: { id: true, name: true, publicPath: true } } as const
const folderRef = { select: { id: true, name: true } } as const

// A key covers a route when it owns it, was shared with it, or is bound to
// the folder the route currently sits in.
function keyCoversRoute(routeId: string) {
  return {
    OR: [
      { routeId },
      { sharedRoutes: { some: { routeId } } },
      { sharedFolders: { some: { folder: { routes: { some: { id: routeId } } } } } },
    ],
  }
}

const apiKeyListSelect = {
  id: true,
  routeId: true,
  name: true,
  keyHint: true,
  isActive: true,
  scope: true,
  lastUsedAt: true,
  lastUsedIp: true,
  usageCount: true,
  expiresAt: true,
  createdAt: true,
  route: routeRef,
  sharedRoutes: { select: { route: routeRef } },
  sharedFolders: { select: { folder: folderRef } },
} as const

/**
 * Keys relevant to a route: the ones it owns plus the ones other routes
 * shared with it (directly or via a folder). `isShared` marks the latter —
 * they are managed (revoked, deleted, re-shared) on their owner route and can
 * only be detached here.
 */
export async function getApiKeys(routeId: string) {
  const route = await prisma.route.findUnique({ where: { id: routeId, deletedAt: null } })
  if (!route) throw AppError.notFound('Route')

  const keys = await prisma.apiKey.findMany({
    where: keyCoversRoute(routeId),
    orderBy: { createdAt: 'desc' },
    select: apiKeyListSelect,
  })
  return keys.map(({ route: ownerRoute, sharedRoutes, sharedFolders, routeId: ownerId, ...key }) => ({
    ...key,
    ownerRoute,
    isShared: ownerId !== routeId,
    sharedRoutes: sharedRoutes.map((s) => s.route),
    sharedFolders: sharedFolders.map((s) => s.folder),
  }))
}

// Folders a key may be bound to: must exist
async function resolveShareFolders(folderIds: string[]) {
  const ids = [...new Set(folderIds)]
  if (ids.length > 0) {
    const found = await prisma.routeFolder.count({ where: { id: { in: ids } } })
    if (found !== ids.length) throw AppError.badRequest('One or more folders do not exist')
  }
  return ids
}

// Routes a key may additionally be valid for: existing, not deleted, never the owner
async function resolveShareTargets(ownerRouteId: string, routeIds: string[]) {
  const targetIds = [...new Set(routeIds)].filter((id) => id !== ownerRouteId)
  if (targetIds.length > 0) {
    const found = await prisma.route.count({ where: { id: { in: targetIds }, deletedAt: null } })
    if (found !== targetIds.length) throw AppError.badRequest('One or more routes do not exist')
  }
  return targetIds
}

/**
 * Replace the set of additional routes a key is valid for. The key stays owned
 * by (and manageable from) its original route; routeIds must be existing,
 * non-deleted routes and never include the owning route itself.
 */
export async function setApiKeyRoutes(keyId: string, ownerRouteId: string, routeIds: string[], folderIds: string[] = []) {
  const apiKey = await prisma.apiKey.findUnique({ where: { id: keyId } })
  if (!apiKey || apiKey.routeId !== ownerRouteId) throw AppError.notFound('API Key')

  const targetIds = await resolveShareTargets(ownerRouteId, routeIds)
  const folderTargetIds = await resolveShareFolders(folderIds)

  await prisma.$transaction([
    prisma.apiKeyRoute.deleteMany({ where: { apiKeyId: keyId } }),
    prisma.apiKeyFolder.deleteMany({ where: { apiKeyId: keyId } }),
    ...(targetIds.length > 0
      ? [prisma.apiKeyRoute.createMany({ data: targetIds.map((routeId) => ({ apiKeyId: keyId, routeId })) })]
      : []),
    ...(folderTargetIds.length > 0
      ? [prisma.apiKeyFolder.createMany({ data: folderTargetIds.map((folderId) => ({ apiKeyId: keyId, folderId })) })]
      : []),
  ])

  // Detached routes/folders must stop accepting the key on every replica promptly
  invalidateCache()
  bumpRevokeEpoch().catch(() => {})

  const [shared, sharedFolders] = await Promise.all([
    prisma.apiKeyRoute.findMany({ where: { apiKeyId: keyId }, select: { route: routeRef } }),
    prisma.apiKeyFolder.findMany({ where: { apiKeyId: keyId }, select: { folder: folderRef } }),
  ])
  return { id: keyId, sharedRoutes: shared.map((s) => s.route), sharedFolders: sharedFolders.map((s) => s.folder) }
}

/**
 * Detach a shared key from one of its additional routes. Callable from that
 * route (not only the owner) so a route's operator can drop access they don't
 * want, without touching the key elsewhere.
 */
export async function detachApiKeyFromRoute(keyId: string, routeId: string) {
  const { count } = await prisma.apiKeyRoute.deleteMany({ where: { apiKeyId: keyId, routeId } })
  if (count === 0) throw AppError.notFound('Shared API Key')
  invalidateCache()
  bumpRevokeEpoch().catch(() => {})
}

export async function createApiKey(
  routeId: string,
  name: string,
  expiresAt?: Date,
  scope: 'READ' | 'FULL' = 'FULL',
  routeIds: string[] = [],
  folderIds: string[] = []
) {
  const route = await prisma.route.findUnique({ where: { id: routeId, deletedAt: null } })
  if (!route) throw AppError.notFound('Route')
  const targetIds = await resolveShareTargets(routeId, routeIds)
  const folderTargetIds = await resolveShareFolders(folderIds)

  const rawKey = `cgk_${randomBytes(32).toString('hex')}`
  const keyHash = hashKey(rawKey)
  const keyHint = `${rawKey.slice(0, 3)}…${rawKey.slice(-2)}`

  const apiKey = await prisma.apiKey.create({
    data: {
      routeId, name, keyHash, keyHint, expiresAt, scope,
      sharedRoutes: { create: targetIds.map((id) => ({ routeId: id })) },
      sharedFolders: { create: folderTargetIds.map((id) => ({ folderId: id })) },
    },
    select: {
      id: true, name: true, isActive: true, scope: true, expiresAt: true, createdAt: true,
      sharedRoutes: { select: { route: routeRef } },
      sharedFolders: { select: { folder: folderRef } },
    },
  })

  return {
    ...apiKey,
    sharedRoutes: apiKey.sharedRoutes.map((s) => s.route),
    sharedFolders: apiKey.sharedFolders.map((s) => s.folder),
    key: rawKey,
  }
}

export async function revokeApiKey(keyId: string, routeId: string) {
  const apiKey = await prisma.apiKey.findUnique({ where: { id: keyId } })
  if (!apiKey || apiKey.routeId !== routeId) throw AppError.notFound('API Key')
  invalidateCache()
  bumpRevokeEpoch().catch(() => {})
  return prisma.apiKey.update({ where: { id: keyId }, data: { isActive: false } })
}

export async function deleteApiKey(keyId: string, routeId: string) {
  const apiKey = await prisma.apiKey.findUnique({ where: { id: keyId } })
  if (!apiKey || apiKey.routeId !== routeId) throw AppError.notFound('API Key')
  invalidateCache()
  bumpRevokeEpoch().catch(() => {})
  return prisma.apiKey.delete({ where: { id: keyId } })
}

/**
 * Verify a raw key for a route. Returns the matched key's id + scope, or null.
 * Tracks usage (batched) and caches positive results briefly.
 */
export async function verifyApiKey(
  key: string,
  routeId: string,
  ip?: string
): Promise<{ id: string; scope: string } | null> {
  const keyHash = hashKey(key)
  const cacheKey = `${routeId}:${keyHash}`
  const now = Date.now()

  const cached = validCache.get(cacheKey)
  if (cached && cached.cacheUntil > now) {
    recordUsage(cached.id, ip)
    return { id: cached.id, scope: cached.scope }
  }

  // A key is valid for its owning route, any route it was shared with, and
  // every route inside a folder it is bound to
  const apiKey = await prisma.apiKey.findFirst({
    where: {
      keyHash,
      isActive: true,
      AND: [
        { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        keyCoversRoute(routeId),
      ],
    },
    select: { id: true, scope: true, expiresAt: true },
  })
  if (!apiKey) return null

  const ttl = apiKey.expiresAt ? Math.min(POSITIVE_TTL_MS, apiKey.expiresAt.getTime() - now) : POSITIVE_TTL_MS
  if (ttl > 0) validCache.set(cacheKey, { id: apiKey.id, scope: apiKey.scope, cacheUntil: now + ttl })

  recordUsage(apiKey.id, ip)
  return { id: apiKey.id, scope: apiKey.scope }
}

// Find keys that will expire within the given number of days (for notifications)
export async function getKeysExpiringSoon(days: number) {
  const now = new Date()
  const until = new Date(now.getTime() + days * 86400000)
  return prisma.apiKey.findMany({
    where: { isActive: true, expiresAt: { gt: now, lte: until } },
    select: { id: true, name: true, expiresAt: true, route: { select: { id: true, name: true } } },
  })
}
