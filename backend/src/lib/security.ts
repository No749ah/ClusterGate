import { URL } from 'url'
import dns from 'dns/promises'
import { timingSafeEqual, createHmac } from 'crypto'

// =============================================================================
// SSRF Protection — Block private/internal IPs and non-HTTP schemes
// =============================================================================

const BLOCKED_HOSTNAMES = new Set([
  'metadata.google.internal',
  'metadata.gke.internal',
  '169.254.169.254',           // AWS/GCP/Azure metadata
  '169.254.170.2',             // AWS ECS metadata
  'kubernetes.default',
  'kubernetes.default.svc',
  'kubernetes.default.svc.cluster.local',
])

/**
 * Check if an IP address is in a private/reserved range (RFC 1918, loopback, link-local, etc.)
 */
function isPrivateIp(ip: string): boolean {
  // Block IPv6 loopback and mapped addresses
  const lower = ip.toLowerCase()
  if (lower === '::1' || lower === '::' || lower === '0:0:0:0:0:0:0:1') return true
  if (lower.startsWith('::ffff:')) {
    // IPv4-mapped IPv6 — extract and check the IPv4 part
    return isPrivateIp(lower.slice(7))
  }
  if (lower.startsWith('fe80:') || lower.startsWith('fc00:') || lower.startsWith('fd')) return true

  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    // Not a valid IPv4 — block by default
    return true
  }

  const [a, b] = parts

  // 0.0.0.0/8 — Current network
  if (a === 0) return true
  // 10.0.0.0/8 — Private (RFC 1918)
  if (a === 10) return true
  // 100.64.0.0/10 — Carrier-grade NAT (RFC 6598)
  if (a === 100 && b >= 64 && b <= 127) return true
  // 127.0.0.0/8 — Loopback
  if (a === 127) return true
  // 169.254.0.0/16 — Link-local / metadata
  if (a === 169 && b === 254) return true
  // 172.16.0.0/12 — Private (RFC 1918)
  if (a === 172 && b >= 16 && b <= 31) return true
  // 192.0.0.0/24 — IETF Protocol Assignments
  if (a === 192 && b === 0 && parts[2] === 0) return true
  // 192.168.0.0/16 — Private (RFC 1918)
  if (a === 192 && b === 168) return true
  // 198.18.0.0/15 — Benchmarking
  if (a === 198 && (b === 18 || b === 19)) return true
  // 224.0.0.0/4 — Multicast
  if (a >= 224 && a <= 239) return true
  // 240.0.0.0/4 — Reserved
  if (a >= 240) return true

  return false
}

/**
 * Validate a target URL is safe to proxy to (no SSRF)
 * Checks: scheme, hostname blocklist, and DNS resolution to private IPs
 */
export async function validateTargetUrl(targetUrl: string): Promise<void> {
  let parsed: URL
  try {
    parsed = new URL(targetUrl)
  } catch {
    throw new Error('Invalid target URL format')
  }

  // Only allow http and https
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Blocked URL scheme: ${parsed.protocol} — only http: and https: are allowed`)
  }

  const hostname = parsed.hostname.toLowerCase()

  // Block known metadata/internal hostnames
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new Error(`Blocked target hostname: ${hostname}`)
  }

  // Block if hostname is a raw private IP
  if (isPrivateIp(hostname)) {
    throw new Error(`Blocked private/reserved IP address: ${hostname}`)
  }

  // Resolve DNS and check resolved IPs
  try {
    const addresses = await dns.resolve4(hostname)
    for (const addr of addresses) {
      if (isPrivateIp(addr)) {
        throw new Error(`Target hostname ${hostname} resolves to private IP ${addr}`)
      }
    }
  } catch (err: any) {
    // If DNS resolution fails with our own error, re-throw
    if (err.message?.startsWith('Target hostname') || err.message?.startsWith('Blocked')) {
      throw err
    }
    // DNS resolution failures for IPs are fine (they're checked above)
    // For hostnames that can't be resolved, let the proxy handle the error
  }
}

/**
 * Quick synchronous check for URL scheme and obvious blocklisted hosts.
 * Used in health checks and other places that need a fast check.
 */
export function validateTargetUrlSync(targetUrl: string): void {
  let parsed: URL
  try {
    parsed = new URL(targetUrl)
  } catch {
    throw new Error('Invalid target URL format')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Blocked URL scheme: ${parsed.protocol}`)
  }

  const hostname = parsed.hostname.toLowerCase()

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new Error(`Blocked target hostname: ${hostname}`)
  }

  if (isPrivateIp(hostname)) {
    throw new Error(`Blocked private/reserved IP address: ${hostname}`)
  }
}

// =============================================================================
// Safe Regex — Prevent ReDoS via catastrophic backtracking
// =============================================================================

/**
 * Test if a regex pattern is safe (no catastrophic backtracking).
 * Rejects patterns with nested quantifiers like (a+)+, (a*)*b, etc.
 */
export function isSafeRegex(pattern: string): boolean {
  // Test 1: Try to compile the regex
  try {
    new RegExp(pattern)
  } catch {
    return false
  }

  // Test 2: Reject patterns with nested quantifiers (common ReDoS patterns)
  // Matches things like (x+)+, (x*)+, (x+)*, (x{1,})+, etc.
  const nestedQuantifier = /(\((?:[^()]*[+*]|[^()]*\{[^}]*\})[^()]*\))[+*]|\)(?:\{[^}]*\})[+*]/
  if (nestedQuantifier.test(pattern)) {
    return false
  }

  // Test 3: Reject excessively long patterns
  if (pattern.length > 500) {
    return false
  }

  // Test 4: Test with a timing check — run against a pathological input
  const start = Date.now()
  try {
    const regex = new RegExp(pattern)
    const testInput = 'a'.repeat(30)
    regex.test(testInput)
  } catch {
    return false
  }
  if (Date.now() - start > 100) {
    return false
  }

  return true
}

// =============================================================================
// Timing-Safe Comparison
// =============================================================================

/**
 * Constant-time string comparison to prevent timing attacks.
 * Used for webhook signature validation.
 */
export function timingSafeCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a)
    const bufB = Buffer.from(b)

    if (bufA.length !== bufB.length) {
      // Still do a comparison to avoid timing leaks on length
      timingSafeEqual(bufA, bufA)
      return false
    }

    return timingSafeEqual(bufA, bufB)
  } catch {
    return false
  }
}

/**
 * Validate an HMAC webhook signature using timing-safe comparison.
 */
export function validateWebhookSignature(
  body: string,
  secret: string,
  signature: string
): boolean {
  const expected = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
  return timingSafeCompare(signature, expected)
}

// =============================================================================
// Sensitive Field Stripping
// =============================================================================

const SENSITIVE_ROUTE_FIELDS = ['authValue', 'webhookSecret'] as const

/**
 * Strip sensitive fields from a route object for non-admin responses.
 */
export function stripSensitiveRouteFields<T extends Record<string, unknown>>(route: T): T {
  const cleaned = { ...route }
  for (const field of SENSITIVE_ROUTE_FIELDS) {
    if (field in cleaned && cleaned[field]) {
      (cleaned as any)[field] = '••••••••'
    }
  }
  return cleaned
}

// =============================================================================
// Page Size Validation
// =============================================================================

const MAX_PAGE_SIZE = 100
const DEFAULT_PAGE_SIZE = 20

/**
 * Clamp pageSize to safe bounds.
 */
export function safePageSize(input: number | string | undefined): number {
  const size = typeof input === 'string' ? parseInt(input, 10) : (input ?? DEFAULT_PAGE_SIZE)
  if (isNaN(size) || size < 1) return DEFAULT_PAGE_SIZE
  return Math.min(size, MAX_PAGE_SIZE)
}
