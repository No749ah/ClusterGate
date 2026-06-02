/**
 * Build readable detail-page URLs. Prefers each entity's slug; falls back to
 * the cuid id so old bookmarks and freshly-created entities (slug filled async)
 * keep working.
 */

type WithIdSlug = { id: string; slug?: string | null }

export const routeUrl   = (r: WithIdSlug) => `/routes/${r.slug || r.id}`
export const routeEdit  = (r: WithIdSlug) => `/routes/${r.slug || r.id}/edit`
export const groupUrl   = (g: WithIdSlug) => `/groups/${g.slug || g.id}`
export const orgUrl     = (o: WithIdSlug) => `/organizations/${o.slug || o.id}`
