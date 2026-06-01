import { prisma } from '../lib/prisma'
import { signToken } from '../lib/jwt'
import { config } from '../config'
import { Role } from '@prisma/client'
import { AppError } from '../lib/errors'

export interface SessionContext {
  ip?: string
  userAgent?: string
}

// Parse the configured JWT lifetime (e.g. "7d") into ms for the session expiry.
function tokenLifetimeMs(): number {
  const v = config.JWT_EXPIRES_IN
  const m = /^(\d+)([smhd])$/.exec(v.trim())
  if (!m) return 7 * 24 * 60 * 60 * 1000
  const n = parseInt(m[1], 10)
  const unit = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2]]!
  return n * unit
}

/**
 * Create a session row for a freshly-authenticated user and return a signed
 * JWT carrying its session id (sid). This is the single place a real session
 * token is minted.
 */
export async function issueSession(
  user: { id: string; email: string; role: Role; tokenVersion: number },
  ctx: SessionContext = {}
): Promise<string> {
  const expiresAt = new Date(Date.now() + tokenLifetimeMs())
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      ip: ctx.ip?.slice(0, 64),
      userAgent: ctx.userAgent?.slice(0, 512),
      expiresAt,
    },
    select: { id: true },
  })

  return signToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    tokenVersion: user.tokenVersion,
    sid: session.id,
  })
}

// Throttle lastSeenAt writes so we don't write to the DB on every request.
const lastTouch = new Map<string, number>()
const TOUCH_INTERVAL_MS = 60_000

/**
 * Validate a session by id. Returns true if it exists, is not revoked and has
 * not expired. Updates lastSeenAt at most once per minute.
 */
export async function validateSession(sessionId: string, ip?: string): Promise<boolean> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { revokedAt: true, expiresAt: true },
  })
  if (!session || session.revokedAt || session.expiresAt < new Date()) return false

  const now = Date.now()
  const last = lastTouch.get(sessionId) ?? 0
  if (now - last > TOUCH_INTERVAL_MS) {
    lastTouch.set(sessionId, now)
    prisma.session
      .update({ where: { id: sessionId }, data: { lastSeenAt: new Date(), ...(ip ? { ip: ip.slice(0, 64) } : {}) } })
      .catch(() => {})
  }
  return true
}

/** List a user's active (non-revoked, non-expired) sessions, newest first. */
export async function listSessions(userId: string) {
  return prisma.session.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: 'desc' },
    select: { id: true, ip: true, userAgent: true, createdAt: true, lastSeenAt: true, expiresAt: true },
  })
}

/** Revoke a single session — must belong to the requesting user. */
export async function revokeSession(userId: string, sessionId: string): Promise<void> {
  const session = await prisma.session.findUnique({ where: { id: sessionId }, select: { userId: true } })
  if (!session || session.userId !== userId) throw AppError.notFound('Session')
  await prisma.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
  lastTouch.delete(sessionId)
}

/** Revoke every active session for a user except the one provided. */
export async function revokeOtherSessions(userId: string, keepSessionId: string): Promise<number> {
  const result = await prisma.session.updateMany({
    where: { userId, revokedAt: null, id: { not: keepSessionId } },
    data: { revokedAt: new Date() },
  })
  return result.count
}

/** Delete expired/revoked sessions (called from the cron cleanup job). */
export async function cleanupSessions(): Promise<number> {
  const result = await prisma.session.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date() } },
        { revokedAt: { not: null } },
      ],
    },
  })
  return result.count
}
