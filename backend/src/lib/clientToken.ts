import { createHmac, timingSafeEqual } from 'crypto'
import type { Request } from 'express'
import { config } from '../config'

/**
 * Same-origin isolation for the management API.
 *
 * The UI (/), the API (/api) and every exposed app (/r/...) can share one
 * host. Browsers treat them as ONE origin, so JavaScript served by an exposed
 * app could call /api with the admin's session cookie attached. Cookies and
 * path-based checks (Referer, Sec-Fetch-Site) cannot tell the two apart —
 * `history.pushState` alone rewrites the Referer.
 *
 * So cookie-authenticated API calls must also carry a client token that only
 * the ClusterGate UI ever holds:
 *
 *  - It is an HMAC over the session JWT, so it cannot be computed without the
 *    server secret and dies with the session.
 *  - It is handed out only in the response body of a credentialed login, or
 *    via a top-level navigation to /api/auth/resume that redirects into the UI
 *    with the token in the URL fragment. Fetch Metadata headers (Sec-Fetch-*)
 *    cannot be forged by page scripts, so a fetch() from an exposed app can
 *    never obtain it, and the document that receives it is isolated from
 *    exposed apps by Cross-Origin-Opener-Policy and frame-ancestors.
 *  - The UI keeps it in memory only (never in cookies or storage that other
 *    same-origin pages could read).
 */

export const CLIENT_TOKEN_HEADER = 'x-cg-client-token'
/** Query parameter accepted for EventSource (SSE), which cannot set headers. */
export const CLIENT_TOKEN_QUERY = 'cg_ct'

let cachedKey: Buffer | null = null

function key(): Buffer {
  if (!cachedKey) {
    // Derive a dedicated key so the client token is never a raw JWT signature.
    cachedKey = createHmac('sha256', config.JWT_SECRET).update('clustergate-client-token-v1').digest()
  }
  return cachedKey
}

/** Client token bound to one session JWT. */
export function deriveClientToken(sessionJwt: string): string {
  return createHmac('sha256', key()).update(sessionJwt).digest('base64url')
}

export function isValidClientToken(sessionJwt: string, candidate: unknown): boolean {
  if (typeof candidate !== 'string' || candidate.length === 0) return false
  const expected = Buffer.from(deriveClientToken(sessionJwt))
  const given = Buffer.from(candidate)
  return expected.length === given.length && timingSafeEqual(expected, given)
}

/** Whether the API enforces the client token for cookie sessions (default on). */
export function clientTokenRequired(): boolean {
  const raw = config.API_CLIENT_TOKEN_REQUIRED
  return raw === undefined || !['false', '0', 'no', 'off'].includes(raw.toLowerCase())
}

/**
 * A top-level document navigation. Its response is rendered in a browsing
 * context the initiating page cannot read (COOP severs popups, framing is
 * denied), so it is safe to serve without the client token. Covers links,
 * downloads opened in a new tab and the Swagger UI page itself.
 */
export function isTopLevelNavigation(req: Request): boolean {
  return (
    (req.method === 'GET' || req.method === 'HEAD') &&
    req.get('sec-fetch-mode') === 'navigate' &&
    req.get('sec-fetch-dest') === 'document'
  )
}

/** Number of `cg_session` entries in the raw Cookie header. */
export function countSessionCookies(cookieHeader: string | undefined): number {
  if (!cookieHeader) return 0
  return cookieHeader
    .split(';')
    .filter((part) => part.trim().split('=')[0].trim() === 'cg_session').length
}

// Paths a resume redirect must never land on: anything served by the API,
// the proxy or metrics would expose the fragment to non-UI code.
const NON_UI_PREFIXES = ['api', 'r', 'metrics']

/**
 * Validate the `to` target of /api/auth/resume. Accepts a same-origin path
 * or an absolute URL on one of the allowed UI origins (split deployments),
 * and only UI pages. Returns the normalized target or null.
 */
export function safeResumeTarget(to: unknown, allowedOrigins: string[]): string | null {
  if (typeof to !== 'string' || to.length === 0 || to.length > 2048) return null
  const base = 'http://resume.invalid'
  let url: URL
  try {
    url = new URL(to, base)
  } catch {
    return null
  }
  const isRelative = url.origin === base && to.startsWith('/') && !to.startsWith('//')
  if (!isRelative && !allowedOrigins.includes(url.origin)) return null
  if (url.username || url.password) return null

  // URL parsing already resolved ./.. segments; refuse encoded characters so
  // no server can decode the path into a different first segment.
  if (url.pathname.includes('%')) return null
  const first = url.pathname.split('/')[1]?.toLowerCase() ?? ''
  if (NON_UI_PREFIXES.includes(first)) return null

  const pathAndQuery = url.pathname + url.search
  return isRelative ? pathAndQuery : url.origin + pathAndQuery
}
