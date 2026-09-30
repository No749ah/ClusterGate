import type { Response } from 'express'

/**
 * Response-header hardening for apps exposed under /r/.
 *
 * Exposed apps share the browser origin with the ClusterGate UI and API. These
 * rules keep an upstream from reaching into ClusterGate through that origin,
 * without changing how well-behaved apps work.
 */

/**
 * CSP sandbox for routes with `sandbox` enabled. Without `allow-same-origin`
 * the page runs in an opaque origin: it cannot read cookies or storage of the
 * host, and its requests to /api or other routes are cross-origin. Apps that
 * rely on their own cookies, localStorage, service workers or same-origin
 * fetch() will break, so this is opt-in per route.
 */
export const SANDBOX_CSP =
  'sandbox allow-scripts allow-forms allow-popups allow-modals allow-downloads allow-pointer-lock allow-presentation'

// ClusterGate's own cookies (cg_session, cg_csrf, ...) share this prefix.
const RESERVED_COOKIE_PREFIX = 'cg_'

function cookieName(setCookie: string): string {
  const name = setCookie.split(';')[0].split('=')[0].trim().toLowerCase()
  // __Host-/__Secure- prefixed names would still shadow ours once stripped.
  return name.replace(/^__(host|secure)-/, '')
}

function findKey(headers: Record<string, unknown>, name: string): string | undefined {
  return Object.keys(headers).find((k) => k.toLowerCase() === name)
}

/**
 * Clean upstream response headers in place before they are sent:
 *  - drop `Service-Worker-Allowed`, which would let a worker script under /r/
 *    claim scope over the UI and /api
 *  - drop `Cross-Origin-Opener-Policy`, so an exposed page can never share a
 *    browsing context group with the UI (which runs COOP same-origin)
 *  - drop `Set-Cookie` entries for ClusterGate's own cookie names, so an
 *    upstream cannot overwrite or shadow the admin session
 *  - add the sandbox CSP when the route opts in (kept next to any CSP the
 *    upstream sends; browsers enforce every policy)
 */
export function hardenProxyResponseHeaders(
  headers: Record<string, any>,
  options: { sandbox?: boolean } = {},
): Record<string, any> {
  for (const key of Object.keys(headers)) {
    const lower = key.toLowerCase()
    if (lower === 'service-worker-allowed' || lower === 'cross-origin-opener-policy') {
      delete headers[key]
    }
  }

  const setCookieKey = findKey(headers, 'set-cookie')
  if (setCookieKey) {
    const raw = headers[setCookieKey]
    const list: string[] = Array.isArray(raw) ? raw : [String(raw)]
    const kept = list.filter((c) => !cookieName(c).startsWith(RESERVED_COOKIE_PREFIX))
    if (kept.length > 0) headers[setCookieKey] = kept
    else delete headers[setCookieKey]
  }

  if (options.sandbox) {
    const cspKey = findKey(headers, 'content-security-policy')
    if (cspKey) {
      const existing = headers[cspKey]
      const list: string[] = Array.isArray(existing) ? existing : [String(existing)]
      delete headers[cspKey]
      headers['Content-Security-Policy'] = [...list, SANDBOX_CSP]
    } else {
      headers['Content-Security-Policy'] = SANDBOX_CSP
    }
  }

  return headers
}

// Set app-wide by helmet for the JSON API. On proxied pages the API's CSP
// would block the app's own scripts and styles, and its COOP would put the
// page in the UI's browsing context group; the upstream's own headers (if
// any) are applied afterwards.
const API_ONLY_HEADERS = ['Content-Security-Policy', 'Cross-Origin-Opener-Policy', 'Cross-Origin-Resource-Policy']

/** Drop the API's page-level security headers before sending a proxied response. */
export function clearApiSecurityHeaders(res: Response): void {
  for (const name of API_ONLY_HEADERS) res.removeHeader(name)
}
