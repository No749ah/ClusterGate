/**
 * Per-route path allowlist.
 *
 * A wildcard route (/r/foo/* -> https://svc/test) normally forwards every
 * sub-path. With a path allowlist only the listed sub-paths (relative to the
 * route's public base path) are forwarded; anything else is rejected before
 * it reaches the upstream. An empty allowlist keeps the old "everything"
 * behaviour.
 *
 * Pattern syntax (matched per path segment, case-sensitive):
 *   /foo1          exactly /foo1 (a trailing slash on the request is fine)
 *   /foo2/*        /foo2 and everything below it
 *   /users/* /edit `*` in the middle matches exactly one segment
 *   /              the route's base path itself
 */

export const PATH_ALLOWLIST_MAX_ENTRIES = 100
export const PATH_ALLOWLIST_MAX_LENGTH = 500

/** Normalise a user-entered pattern: leading slash, no trailing slash. */
export function normalizePathPattern(pattern: string): string {
  let p = pattern.trim()
  if (!p.startsWith('/')) p = `/${p}`
  while (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1)
  return p
}

/** Returns an error message for an invalid pattern, or null when it is valid. */
export function validatePathPattern(pattern: string): string | null {
  const p = normalizePathPattern(pattern)
  if (p.length > PATH_ALLOWLIST_MAX_LENGTH) return 'Path pattern is too long'
  if (/[\s?#\\]/.test(p)) return 'Path pattern must not contain whitespace, ?, # or \\'
  if (p !== '/' && p.slice(1).split('/').some((s) => s === '')) return 'Path pattern must not contain empty segments (//)'
  for (const seg of p.slice(1).split('/')) {
    if (seg === '.' || seg === '..') return 'Path pattern must not contain . or .. segments'
    if (seg.includes('*') && seg !== '*') return 'Use * only as a whole segment, e.g. /api/*'
  }
  return null
}

function safeDecode(segment: string): string | null {
  try {
    return decodeURIComponent(segment)
  } catch {
    return null
  }
}

/**
 * Split a request sub-path into decoded segments. Returns null when the path
 * is ambiguous to an upstream (dot segments, encoded slashes, backslashes,
 * empty segments) so it can never be used to step out of an allowed path,
 * e.g. /foo1/../foo3 or /foo1%2F..%2Ffoo3.
 */
function requestSegments(subPath: string): string[] | null {
  if (!subPath.startsWith('/')) return null
  if (subPath.includes('\\')) return null
  let raw = subPath.slice(1).split('/')
  // Tolerate a single trailing slash (/foo1/ == /foo1)
  if (raw.length > 0 && raw[raw.length - 1] === '') raw = raw.slice(0, -1)
  const out: string[] = []
  for (const seg of raw) {
    if (seg === '') return null
    const decoded = safeDecode(seg)
    if (decoded === null) return null
    if (decoded === '.' || decoded === '..') return null
    if (decoded.includes('/') || decoded.includes('\\')) return null
    out.push(decoded)
  }
  return out
}

function patternSegments(pattern: string): string[] {
  const p = normalizePathPattern(pattern)
  if (p === '/') return []
  return p.slice(1).split('/').map((s) => safeDecode(s) ?? s)
}

function matchesPattern(segments: string[], pattern: string[]): boolean {
  const trailingWildcard = pattern.length > 0 && pattern[pattern.length - 1] === '*'
  const fixed = trailingWildcard ? pattern.slice(0, -1) : pattern
  if (trailingWildcard ? segments.length < fixed.length : segments.length !== fixed.length) return false
  return fixed.every((p, i) => p === '*' || p === segments[i])
}

/**
 * Is `subPath` (the request path relative to the route base, e.g. "/foo1")
 * allowed by `allowlist`? An empty allowlist allows everything.
 */
export function isPathAllowed(subPath: string, allowlist: string[] | null | undefined): boolean {
  if (!allowlist || allowlist.length === 0) return true
  const segments = requestSegments(subPath || '/')
  if (!segments) return false
  return allowlist.some((entry) => validatePathPattern(entry) === null && matchesPattern(segments, patternSegments(entry)))
}

/**
 * The part of a full public request path below the route's base, e.g.
 * publicPath "/r/foo/*" + requestPath "/r/foo/foo1" -> "/foo1".
 */
export function routeSubPath(publicPath: string, requestPath: string): string {
  const base = publicPath.endsWith('/*') ? publicPath.slice(0, -2) : publicPath
  if (base !== '/' && (requestPath === base || requestPath.startsWith(base + '/'))) {
    return requestPath.slice(base.length) || '/'
  }
  return requestPath
}
