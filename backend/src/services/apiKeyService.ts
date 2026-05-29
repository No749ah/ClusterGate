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

export async function getApiKeys(routeId: string) {
  const route = await prisma.route.findUnique({ where: { id: routeId, deletedAt: null } })
  if (!route) throw AppError.notFound('Route')

  return prisma.apiKey.findMany({
    where: { routeId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      keyHint: true,
      isActive: true,
      scope: true,
      lastUsedAt: true,
      lastUsedIp: true,
      usageCount: true,
      expiresAt: true,
      createdAt: true,
    },
  })
}

export async function createApiKey(routeId: string, name: string, expiresAt?: Date, scope: 'READ' | 'FULL' = 'FULL') {
  const route = await prisma.route.findUnique({ where: { id: routeId, deletedAt: null } })
  if (!route) throw AppError.notFound('Route')

  const rawKey = `cgk_${randomBytes(32).toString('hex')}`
  const keyHash = hashKey(rawKey)
  const keyHint = `${rawKey.slice(0, 3)}…${rawKey.slice(-2)}`

  const apiKey = await prisma.apiKey.create({
    data: { routeId, name, keyHash, keyHint, expiresAt, scope },
    select: { id: true, name: true, isActive: true, scope: true, expiresAt: true, createdAt: true },
  })

  return { ...apiKey, key: rawKey }
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

  const apiKey = await prisma.apiKey.findFirst({
    where: {
      keyHash,
      routeId,
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
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
