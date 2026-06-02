'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

// Top-level segment → human label
const SEGMENT_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  routes: 'Routes',
  groups: 'Groups',
  organizations: 'Organizations',
  users: 'Users',
  analytics: 'Analytics',
  logs: 'Request logs',
  audit: 'Audit log',
  incidents: 'Incidents',
  'change-requests': 'Change requests',
  backups: 'Backups',
  notifications: 'Notifications',
  activity: 'Activity',
  account: 'Account',
  settings: 'Settings',
  sanitizer: 'Sanitizer',
  'traffic-map': 'Traffic map',
}

const RESOURCE_PARENTS = new Set(['routes', 'organizations', 'groups'])
const SUB_KEYWORDS: Record<string, string> = { edit: 'Edit', new: 'New' }

/**
 * Mounts a side-effect that keeps `document.title` in sync with the current
 * route, so multiple browser tabs are distinguishable at a glance.
 *
 *   /dashboard          → "Dashboard · ClusterGate"
 *   /routes             → "Routes · ClusterGate"
 *   /routes/docs-proxy  → "Docs Proxy · ClusterGate"   (entity name resolved)
 *   /routes/abc/edit    → "Edit Docs Proxy · ClusterGate"
 *   /routes/new         → "New route · ClusterGate"
 */
export function PageTitle() {
  const pathname = usePathname() ?? '/'
  const segments = pathname.split('/').filter(Boolean)

  let resourceType: string | null = null
  let resourceId: string | null = null
  let subKeyword: string | null = null
  for (let i = 0; i < segments.length; i++) {
    if (RESOURCE_PARENTS.has(segments[i])) {
      const next = segments[i + 1]
      if (next && !(next in SUB_KEYWORDS)) {
        resourceType = segments[i]
        resourceId = next
        if (segments[i + 2] in SUB_KEYWORDS) subKeyword = SUB_KEYWORDS[segments[i + 2]]
      } else if (next === 'new') {
        // /routes/new etc.
        const t = SEGMENT_LABELS[segments[i]] ?? segments[i]
        document.title = `New ${t.toLowerCase().replace(/s$/, '')} · ClusterGate`
        return null
      }
      break
    }
  }

  const { data } = useQuery({
    queryKey: ['page-title', resourceType, resourceId],
    queryFn: async () => {
      if (resourceType === 'routes') return api.routes.getById(resourceId!)
      if (resourceType === 'organizations') return api.organizations.getById(resourceId!)
      if (resourceType === 'groups') return api.routeGroups.getById(resourceId!)
      return null
    },
    enabled: !!resourceId,
    staleTime: 60 * 1000,
  })
  const entityName = (data as any)?.data?.name

  useEffect(() => {
    let title: string
    if (resourceId && entityName) {
      title = subKeyword ? `${subKeyword} ${entityName}` : entityName
    } else if (segments.length === 0) {
      title = 'Dashboard'
    } else {
      const top = segments[0]
      title = SEGMENT_LABELS[top] ?? (top.charAt(0).toUpperCase() + top.slice(1).replace(/-/g, ' '))
    }
    document.title = `${title} · ClusterGate`
  }, [pathname, entityName, resourceId, subKeyword, segments])

  return null
}
