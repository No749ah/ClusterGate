'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

// Parent path segments whose next segment is a resource id-or-slug to resolve
const RESOURCE_PARENTS = new Set(['routes', 'organizations', 'groups', 'users', 'incidents', 'change-requests'])
// Sub-route keywords — not entity ids
const SUB_KEYWORDS = new Set(['edit', 'new'])

/**
 * Breadcrumbs are intentionally minimal:
 * - Hidden on the dashboard and on top-level list pages (/routes, /users, …)
 *   — the sidebar + page heading already say where you are.
 * - On detail / sub-pages, the trail starts at the resource list (no
 *   "Dashboard / …" noise prefix) and resolves entity ids/slugs to names.
 */
export function Breadcrumbs() {
  const pathname = usePathname()
  const segments = pathname.split('/').filter(Boolean)

  // Detect a resource id/slug segment: /routes/<entity>[/...]
  let resourceType: string | null = null
  let resourceId: string | null = null
  for (let i = 0; i < segments.length - 1; i++) {
    if (RESOURCE_PARENTS.has(segments[i])) {
      const candidate = segments[i + 1]
      if (candidate && !SUB_KEYWORDS.has(candidate)) {
        resourceType = segments[i]
        resourceId = candidate
        break
      }
    }
  }

  const { data: resourceData } = useQuery({
    queryKey: ['breadcrumb', resourceType, resourceId],
    queryFn: async () => {
      if (resourceType === 'routes') return api.routes.getById(resourceId!)
      if (resourceType === 'organizations') return api.organizations.getById(resourceId!)
      if (resourceType === 'groups') return api.routeGroups.getById(resourceId!)
      return null
    },
    enabled: !!resourceId,
    staleTime: 60 * 1000,
  })
  const resourceName = (resourceData as any)?.data?.name

  const crumbs = segments.map((segment, index) => {
    const href = '/' + segments.slice(0, index + 1).join('/')
    let label = segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ')
    if (segment === resourceId && resourceName) label = resourceName
    return { href, label, isLast: index === segments.length - 1 }
  })

  // Only show breadcrumbs when there's actually a path worth showing.
  // - Hide on the dashboard ("/" or "/dashboard")
  // - Hide on top-level pages ("/routes", "/users", …) — they're self-evident
  if (crumbs.length <= 1) return null

  return (
    <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-4">
      {crumbs.map((crumb, i) => (
        <span key={crumb.href} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-muted-foreground/50">/</span>}
          {crumb.isLast ? (
            <span className="text-foreground font-medium truncate max-w-[40ch]">{crumb.label}</span>
          ) : (
            <Link href={crumb.href} className="hover:text-foreground transition-colors">
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  )
}
