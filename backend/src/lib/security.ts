import { URL } from 'url'
import dns from 'dns/promises'
import { timingSafeEqual, createHmac } from 'crypto'

// =============================================================================
// SSRF Protection — Block cloud metadata endpoints only
// Private/internal addresses are allowed since ClusterGate is an internal gateway
// =============================================================================

const BLOCKED_HOSTNAMES = new Set([
  'metadata.google.internal',
  'metadata.gke.internal',
  '169.254.169.254',           // AWS/GCP/Azure metadata
  '169.254.170.2',             // AWS ECS metadata
])

/**
 * Check if an IP is a cloud metadata endpoint (169.254.169.254, 169.254.170.2)
 */
function isMetadataIp(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4) return false
  // 169.254.169.254 and 169.254.170.2 — cloud metadata endpoints
  if (parts[0] === 169 && parts[1] === 254) {
    if ((parts[2] === 169 && parts[3] === 254) || (parts[2] === 170 && parts[3] === 2)) {
      return true
    }
  }
  return false
}

/**
 * Validate a target URL is safe to proxy to.
 * Only blocks cloud metadata endpoints — private/internal addresses are allowed
 * since ClusterGate is designed to route to internal services.
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

  // Block known cloud metadata hostnames
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new Error(`Blocked cloud metadata endpoint: ${hostname}`)
  }

  // Resolve DNS and check for metadata IPs
  try {
    const addresses = await dns.resolve4(hostname)
    for (const addr of addresses) {
      if (isMetadataIp(addr)) {
        throw new Error(`Target hostname ${hostname} resolves to cloud metadata IP ${addr}`)
      }
    }
  } catch (err: any) {
    if (err.message?.startsWith('Target hostname') || err.message?.startsWith('Blocked')) {
      throw err
    }
    // DNS failures are OK — let the proxy handle the error at request time
  }
}

/**
 * Quick synchronous check for URL scheme and cloud metadata endpoints.
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
    throw new Error(`Blocked cloud metadata endpoint: ${hostname}`)
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
