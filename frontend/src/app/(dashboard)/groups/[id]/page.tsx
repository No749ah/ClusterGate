'use client'

import { useState, use } from 'react'
import Link from 'next/link'
import { ArrowLeft, Plus, Trash2, ExternalLink, Shield, Clock, RefreshCw, Globe, Network } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { RouteGroup } from '@/types'
import { formatRelativeTime } from '@/lib/utils'

export default function RouteGroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const [showAddRoute, setShowAddRoute] = useState(false)
  const [routeSearch, setRouteSearch] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['route-group', id],
    queryFn: () => api.routeGroups.getById(id),
  })

  const { data: allRoutesData } = useQuery({
    queryKey: ['routes', 'all'],
    queryFn: () => api.routes.list({ pageSize: 500 }),
    enabled: showAddRoute,
  })

  const assignMutation = useMutation({
    mutationFn: (routeId: string) => api.routeGroups.assignRoute(id, routeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['route-group', id] })
      toast.success('Route added to group')
      setShowAddRoute(false)
      setRouteSearch('')
    },
    onError: (err: any) => toast.error(err.message || 'Failed to add route'),
  })

  const removeMutation = useMutation({
    mutationFn: (routeId: string) => api.routeGroups.removeRoute(id, routeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['route-group', id] })
      toast.success('Route removed from group')
    },
    onError: (err: any) => toast.error(err.message || 'Failed to remove route'),
  })

  const handleRemoveRoute = async (routeId: string, routeName: string) => {
    const confirmed = await confirm({
      title: 'Remove Route',
      description: `Remove "${routeName}" from this group? The route will not be deleted.`,
      confirmLabel: 'Remove',
      variant: 'destructive',
    })
    if (confirmed) removeMutation.mutate(routeId)
  }

  const group: RouteGroup | undefined = data?.data

  const existingRouteIds = new Set(group?.routes?.map((r) => r.id) ?? [])
  const availableRoutes = (allRoutesData?.data ?? []).filter(
    (r: any) => !existingRouteIds.has(r.id) && (!routeSearch || r.name.toLowerCase().includes(routeSearch.toLowerCase()))
  )

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    )
  }

  if (!group) {
    return (
      <div className="space-y-6">
        <Link href="/groups" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Groups
        </Link>
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <p className="text-sm font-medium">Route group not found</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Link href="/groups" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2">
            <ArrowLeft className="w-4 h-4" /> Back to Groups
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{group.name}</h1>
            <Badge variant={group.isActive ? 'default' : 'secondary'}>
              {group.isActive ? 'Active' : 'Inactive'}
            </Badge>
          </div>
          {group.description && (
            <p className="text-muted-foreground mt-1">{group.description}</p>
          )}
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Path Prefix */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Path Prefix</CardTitle>
          </CardHeader>
          <CardContent>
            <code className="text-sm bg-muted px-2 py-1 rounded">{group.pathPrefix}</code>
          </CardContent>
        </Card>

        {/* Team */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Team</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{group.team?.name || 'No team assigned'}</p>
          </CardContent>
        </Card>

        {/* Timestamps */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Created</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{formatRelativeTime(group.createdAt)}</p>
            <p className="text-xs text-muted-foreground mt-1">Updated {formatRelativeTime(group.updatedAt)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Default Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Default Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Timeout:</span>
              <span className="text-sm font-medium">{group.defaultTimeout != null ? `${group.defaultTimeout}ms` : 'Not set'}</span>
            </div>
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Retries:</span>
              <span className="text-sm font-medium">{group.defaultRetryCount ?? 'Not set'}</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Auth Type:</span>
              <span className="text-sm font-medium">{group.defaultAuthType || 'Not set'}</span>
            </div>
            <div className="flex items-center gap-2">
              <Network className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Rate Limit:</span>
              <span className="text-sm font-medium">
                {group.defaultRateLimitEnabled
                  ? `${group.defaultRateLimitMax ?? '?'} / ${group.defaultRateLimitWindow ?? '?'}s`
                  : 'Disabled'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">CORS:</span>
              <span className="text-sm font-medium">
                {group.defaultCorsEnabled
                  ? group.defaultCorsOrigins.length > 0
                    ? group.defaultCorsOrigins.join(', ')
                    : 'Enabled (all origins)'
                  : 'Disabled'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">IP Allowlist:</span>
              <span className="text-sm font-medium">
                {group.defaultIpAllowlist.length > 0
                  ? `${group.defaultIpAllowlist.length} entries`
                  : 'None'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Routes */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Routes ({group.routes?.length ?? group._count?.routes ?? 0})</CardTitle>
          <Button size="sm" onClick={() => setShowAddRoute(!showAddRoute)}>
            <Plus className="w-4 h-4 mr-2" /> Add Route
          </Button>
        </CardHeader>
        <CardContent>
          {/* Add Route Picker */}
          {showAddRoute && (
            <div className="mb-4 rounded-lg border border-border bg-muted/30 p-4 space-y-3">
              <input
                type="text"
                placeholder="Search routes to add..."
                value={routeSearch}
                onChange={(e) => setRouteSearch(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <div className="max-h-48 overflow-y-auto space-y-1">
                {availableRoutes.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">No available routes found.</p>
                ) : (
                  availableRoutes.slice(0, 20).map((route: any) => (
                    <div
                      key={route.id}
                      className="flex items-center justify-between px-3 py-2 rounded hover:bg-muted/50 transition-colors"
                    >
                      <div>
                        <span className="text-sm font-medium">{route.name}</span>
                        <code className="text-xs text-muted-foreground ml-2">{route.publicPath}</code>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => assignMutation.mutate(route.id)}
                        disabled={assignMutation.isPending}
                      >
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
              <Button size="sm" variant="ghost" onClick={() => { setShowAddRoute(false); setRouteSearch('') }}>
                Cancel
              </Button>
            </div>
          )}

          {/* Routes List */}
          {!group.routes || group.routes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <p className="text-sm">No routes in this group yet.</p>
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <th className="text-left px-4 py-3">Name</th>
                    <th className="text-left px-4 py-3 hidden sm:table-cell">Path</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-right px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {group.routes.map((route) => (
                    <tr key={route.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <Link
                          href={`/routes/${route.id}`}
                          className="text-sm font-medium hover:text-primary transition-colors inline-flex items-center gap-1"
                        >
                          {route.name}
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <code className="text-xs bg-muted px-2 py-0.5 rounded">{route.publicPath}</code>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          route.isActive
                            ? 'bg-emerald-500/10 text-emerald-500'
                            : 'bg-zinc-500/10 text-zinc-400'
                        }`}>
                          {route.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveRoute(route.id, route.name)}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
