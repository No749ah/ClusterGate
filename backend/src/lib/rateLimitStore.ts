// =============================================================================
// ClusterGate - Rate Limit Store (fixed-window counter)
// Shared across replicas via Postgres so limits are correct in HA setups.
// Falls back to allow-on-error (fail-open) so the proxy never hard-fails.
// =============================================================================
import { prisma } from './prisma'

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
}

export async function checkRateLimit(
  routeId: string,
  clientIp: string,
  max: number,
  windowMs: number
): Promise<RateLimitResult> {
  const now = Date.now()
  const windowStart = Math.floor(now / windowMs) * windowMs
  const key = `${routeId}:${clientIp}`
  const resetAt = windowStart + windowMs

  try {
    // Atomic fixed-window upsert — resets the counter when the window rolls over
    const rows = await prisma.$queryRaw<Array<{ count: number }>>`
      INSERT INTO "rate_limit_counters" ("key", "windowStart", "count")
      VALUES (${key}, ${windowStart}, 1)
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "rate_limit_counters"."windowStart" = ${windowStart}
                       THEN "rate_limit_counters"."count" + 1 ELSE 1 END,
        "windowStart" = ${windowStart}
      RETURNING "count"`
    const count = Number(rows[0]?.count ?? 1)
    return { allowed: count <= max, remaining: Math.max(0, max - count), resetAt }
  } catch {
    // Fail open — never block traffic because the limiter store is unavailable
    return { allowed: true, remaining: max, resetAt }
  }
}

// Periodically purge stale counters (older than 1h)
export async function cleanupRateLimitCounters(): Promise<number> {
  try {
    const cutoff = Date.now() - 3_600_000
    const res = await prisma.$executeRaw`DELETE FROM "rate_limit_counters" WHERE "windowStart" < ${cutoff}`
    return Number(res)
  } catch {
    return 0
  }
}
