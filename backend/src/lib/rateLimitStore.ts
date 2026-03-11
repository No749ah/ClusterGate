// =============================================================================
// ClusterGate - In-memory Rate Limit Store (sliding window counter)
// =============================================================================

interface RateLimitEntry {
  count: number
  windowStart: number
}

const store = new Map<string, RateLimitEntry>()

// Clean up expired entries every 60 seconds
const CLEANUP_INTERVAL = 60_000

setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of store) {
    // Remove entries whose window has fully expired
    if (now - entry.windowStart > 2 * 3_600_000) {
      store.delete(key)
    }
  }
}, CLEANUP_INTERVAL).unref()

/**
 * Check whether a request is allowed under the rate limit.
 *
 * Uses a fixed-window counter per route+clientIp.
 */
export function checkRateLimit(
  routeId: string,
  clientIp: string,
  max: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetAt: number } {
  const key = `${routeId}:${clientIp}`
  const now = Date.now()

  let entry = store.get(key)

  // If no entry or window has expired, start a new window
  if (!entry || now - entry.windowStart >= windowMs) {
    entry = { count: 1, windowStart: now }
    store.set(key, entry)
    return {
      allowed: true,
      remaining: max - 1,
      resetAt: now + windowMs,
    }
  }

  // Window is still active — increment counter
  entry.count++

  const resetAt = entry.windowStart + windowMs

  if (entry.count > max) {
    return {
      allowed: false,
      remaining: 0,
      resetAt,
    }
  }

  return {
    allowed: true,
    remaining: max - entry.count,
    resetAt,
  }
}
