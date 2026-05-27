import { URL } from 'url'
import dns from 'dns/promises'
import { lookup as dnsLookup, LookupAddress } from 'dns'
import { timingSafeEqual, createHmac } from 'crypto'
import safeRegex from 'safe-regex2'

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

// Additional known cloud metadata IPs (Alibaba/Oracle/DigitalOcean use 100.100.100.200)
const BLOCKED_METADATA_IPS = new Set(['100.100.100.200'])

/**
 * Check if an IP is a cloud metadata endpoint.
 * Blocks the entire 169.254.0.0/16 link-local range (covers AWS/GCP/Azure
 * 169.254.169.254, ECS 169.254.170.2 and any other link-local target) plus
 * known provider metadata IPs.
 */
export function isMetadataIp(ip: string): boolean {
  if (BLOCKED_METADATA_IPS.has(ip)) return true
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return false
  // 169.254.0.0/16 — IPv4 link-local (cloud metadata lives here)
  if (parts[0] === 169 && parts[1] === 254) return true
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

/**
 * A drop-in replacement for Node's dns.lookup that rejects resolution to cloud
 * metadata IPs. Wiring this into the proxy's http/https agents enforces the
 * SSRF guard at connection time on every request, closing the DNS-rebinding
 * window left by validating only at route create/update time.
 */
export function safeLookup(
  hostname: string,
  options: any,
  callback: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void
): void {
  const cb = typeof options === 'function' ? options : callback
  const opts = typeof options === 'function' ? {} : options
  dnsLookup(hostname, opts, (err, address: any, family: any) => {
    if (err) return cb(err, address, family)
    const addrs: LookupAddress[] = Array.isArray(address)
      ? address
      : [{ address: address as string, family: family as number }]
    for (const a of addrs) {
      if (a.family === 4 && isMetadataIp(a.address)) {
        return cb(new Error(`Blocked SSRF to cloud metadata IP ${a.address}`), address, family)
      }
    }
    cb(null, address, family)
  })
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

  // Test 1b: Vetted star-height ReDoS detector (catches nested-quantifier
  // blowups like (a+)+ more reliably than the heuristic below).
  try {
    if (!safeRegex(pattern)) return false
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
