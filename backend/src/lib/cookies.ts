/**
 * ClusterGate's own cookies (cg_session, cg_csrf, ...) all share the `cg_`
 * prefix. They authenticate the user against ClusterGate itself and must never
 * reach an upstream service behind a route — otherwise any exposed app could
 * read the admin's session JWT and replay it against the ClusterGate API.
 */
const CLUSTERGATE_COOKIE_PREFIX = 'cg_'

/**
 * Remove ClusterGate's own cookies from a `Cookie` request header while keeping
 * every other (application) cookie untouched and in order.
 *
 * Returns `undefined` when no cookies remain, so callers can drop the header
 * entirely instead of forwarding an empty one.
 */
export function stripClusterGateCookies(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined

  const kept = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter((part) => {
      if (!part) return false
      const eq = part.indexOf('=')
      const name = (eq === -1 ? part : part.slice(0, eq)).trim()
      return !name.toLowerCase().startsWith(CLUSTERGATE_COOKIE_PREFIX)
    })

  return kept.length > 0 ? kept.join('; ') : undefined
}
