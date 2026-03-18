'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

// Segments that are parent resource names — the next segment is an ID to resolve
const RESOURCE_PARENTS = new Set(['routes', 'organizations', 'groups'])

export function Breadcrumbs() {
  const pathname = usePathname()

  const segments = pathname.split('/').filter(Boolean)

  // Detect if we have a resource ID segment (e.g. /routes/[id])
  let resourceType: string | null = null
  let resourceId: string | null = null
  for (let i = 0; i < segments.length - 1; i++) {
    if (RESOURCE_PARENTS.has(segments[i])) {
      const candidate = segments[i + 1]
      // IDs are cuid/uuid-like — not normal words like "edit"
      if (candidate && candidate.length > 10 && !['edit', 'new'].includes(candidate)) {
        resourceType = segments[i]
        resourceId = candidate
        break
      }
    }
  }

  // Fetch resource name if we have an ID in the breadcrumb
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

  // Build breadcrumb items from path segments
  const items = segments.map((segment, index) => {
    const href = '/' + segments.slice(0, index + 1).join('/')
    let label = segment.charAt(0).toUpperCase() + segment.slice(1)

    // Replace ID with resolved name
    if (segment === resourceId && resourceName) {
      label = resourceName
    }

    const isLast = index === segments.length - 1
    return { href, label, isLast }
  })

  // Always start with Dashboard
  const crumbs = [
    { href: '/dashboard', label: 'Dashboard', isLast: items.length === 0 || (items.length === 1 && items[0].href === '/dashboard') },
    ...items.filter((item) => item.href !== '/dashboard'),
  ]

  // Recalculate isLast
  crumbs.forEach((crumb, i) => {
    crumb.isLast = i === crumbs.length - 1
  })

  if (crumbs.length <= 1) return null

  return (
    <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-4">
      {crumbs.map((crumb, i) => (
        <span key={crumb.href} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-muted-foreground/50">/</span>}
          {crumb.isLast ? (
            <span className="text-foreground font-medium">{crumb.label}</span>
          ) : (
            <Link
              href={crumb.href}
              className="hover:text-foreground transition-colors"
            >
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  )
}
