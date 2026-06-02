/**
 * Build readable detail-page URLs. Prefers each entity's slug; falls back to
 * the cuid id so old bookmarks and freshly-created entities (slug filled async)
 * keep working.
 *
 * Routes have one extra trick: when the stored slug carries a disambiguator
 * (because two routes share a friendly name, or because pickRouteSlug added
 * a suffix on collision), we hide that suffix behind ?id= so the path stays
 * readable. /routes/n8n-guidelines-agent-v2wzsz becomes
 * /routes/n8n-guidelines-agent?id=v2wzsz. The page reassembles slug+id when
 * looking the route up, and the bare friendly slug still resolves directly
 * when there is no disambiguator.
 */

type WithIdSlug = { id: string; slug?: string | null }
type WithIdSlugName = WithIdSlug & { name?: string | null }

// Mirror of backend/src/lib/slug.ts:slugify. Keep them aligned so the split
// here matches whatever pickRouteSlug produced.
function slugify(input: string | null | undefined): string | null {
  if (!input) return null
  const s = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64)
  return s || null
}

export function routeUrl(r: WithIdSlugName): string {
  const slug = r.slug
  if (slug && r.name) {
    const friendly = slugify(r.name)
    if (friendly && slug.startsWith(`${friendly}-`)) {
      const tail = slug.slice(friendly.length + 1)
      if (tail) return `/routes/${friendly}?id=${encodeURIComponent(tail)}`
    }
  }
  return `/routes/${slug || r.id}`
}

export function routeEdit(r: WithIdSlugName): string {
  const slug = r.slug
  if (slug && r.name) {
    const friendly = slugify(r.name)
    if (friendly && slug.startsWith(`${friendly}-`)) {
      const tail = slug.slice(friendly.length + 1)
      if (tail) return `/routes/${friendly}/edit?id=${encodeURIComponent(tail)}`
    }
  }
  return `/routes/${slug || r.id}/edit`
}

/**
 * Reconstruct the slug we should send to the backend from a split URL. The
 * caller hands over the :id path segment and the ?id= query value (if any);
 * we glue them back together so api.routes.getById finds the row.
 */
export function resolveRouteLookupKey(pathId: string, queryId?: string | null): string {
  if (queryId && pathId) return `${pathId}-${queryId}`
  return pathId
}

function splitNamed(base: string, e: WithIdSlugName): string {
  const slug = e.slug
  if (slug && e.name) {
    const friendly = slugify(e.name)
    if (friendly && slug.startsWith(`${friendly}-`)) {
      const tail = slug.slice(friendly.length + 1)
      if (tail) return `${base}/${friendly}?id=${encodeURIComponent(tail)}`
    }
  }
  return `${base}/${slug || e.id}`
}

export const groupUrl = (g: WithIdSlugName) => splitNamed('/groups', g)
export const orgUrl   = (o: WithIdSlugName) => splitNamed('/organizations', o)

export function resolveGenericLookupKey(pathId: string, queryId?: string | null): string {
  return resolveRouteLookupKey(pathId, queryId)
}
