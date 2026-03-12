'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Plus,
  Search,
  MoreHorizontal,
  Play,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  Trash2,
  Edit,
  Eye,
  Filter,
  Power,
  PowerOff,
} from 'lucide-react'
import { useRoutes, usePublishRoute, useDeactivateRoute, useDuplicateRoute, useDeleteRoute, useBulkPublish, useBulkDeactivate, useBulkDelete } from '@/hooks/useRoutes'
import { RouteStatusBadge } from '@/components/routes/RouteStatusBadge'
import { HealthIndicator } from '@/components/routes/HealthIndicator'
import { CircuitBreakerBadge } from '@/components/routes/CircuitBreakerBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { formatRelativeTime, copyToClipboard } from '@/lib/utils'
import { Route, RouteStatus } from '@/types'

const HTTP_METHOD_COLORS: Record<string, string> = {
  GET: 'text-green-500 bg-green-500/10 border-green-500/20',
  POST: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
  PUT: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20',
  PATCH: 'text-orange-500 bg-orange-500/10 border-orange-500/20',
  DELETE: 'text-red-500 bg-red-500/10 border-red-500/20',
  HEAD: 'text-purple-500 bg-purple-500/10 border-purple-500/20',
}

function MethodBadge({ method }: { method: string }) {
  const color = HTTP_METHOD_COLORS[method] ?? 'text-muted-foreground bg-muted border-border'
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono font-medium border ${color}`}>
      {method}
    </span>
  )
}

export default function RoutesPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<RouteStatus | 'ALL'>('ALL')
  const [tagFilter, setTagFilter] = useState<string>('ALL')
  const [page, setPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Fetch all routes (no tag filter) to extract unique tags for the filter dropdown
  const { data: allRoutesData } = useRoutes({ pageSize: 200 })
  const allTags = Array.from(
    new Set((allRoutesData?.data ?? []).flatMap((r) => r.tags))
  ).sort()

  const { data, isLoading } = useRoutes({
    search: search || undefined,
    status: statusFilter === 'ALL' ? undefined : statusFilter,
    tags: tagFilter !== 'ALL' ? [tagFilter] : undefined,
    page,
    pageSize: 20,
  })

  const confirm = useConfirm()
  const publish = usePublishRoute()
  const deactivate = useDeactivateRoute()
  const duplicate = useDuplicateRoute()
  const deleteRoute = useDeleteRoute()
  const bulkPublish = useBulkPublish()
  const bulkDeactivate = useBulkDeactivate()
  const bulkDelete = useBulkDelete()

  const routes = data?.data ?? []
  const total = data?.total ?? 0
  const totalPages = data?.totalPages ?? 1

  const allSelected = routes.length > 0 && routes.every(r => selectedIds.has(r.id))
  const someSelected = selectedIds.size > 0

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(routes.map(r => r.id)))
    }
  }

  function toggleOne(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleBulkDelete() {
    const ids = Array.from(selectedIds)
    const ok = await confirm({
      title: 'Delete Routes',
      description: `Are you sure you want to delete ${ids.length} route(s)? This action cannot be undone.`,
      confirmLabel: 'Delete All',
      variant: 'destructive',
    })
    if (ok) {
      bulkDelete.mutate(ids, { onSuccess: () => setSelectedIds(new Set()) })
    }
  }

  const bulkPending = bulkPublish.isPending || bulkDeactivate.isPending || bulkDelete.isPending

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Routes</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {total} route{total !== 1 ? 's' : ''} configured
          </p>
        </div>
        <Button asChild>
          <Link href="/routes/new">
            <Plus className="w-4 h-4 mr-2" />
            New Route
          </Link>
        </Button>
      </div>

      {/* Bulk Toolbar */}
      {someSelected && (
        <div className="flex flex-wrap items-center gap-3 bg-muted/50 border border-border/50 rounded-lg px-4 py-2">
          <span className="text-sm font-medium text-foreground">
            {selectedIds.size} selected
          </span>
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                bulkPublish.mutate(Array.from(selectedIds), { onSuccess: () => setSelectedIds(new Set()) })
              }}
              disabled={bulkPending}
            >
              <Power className="w-3.5 h-3.5 mr-1.5" />
              Publish
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                bulkDeactivate.mutate(Array.from(selectedIds), { onSuccess: () => setSelectedIds(new Set()) })
              }}
              disabled={bulkPending}
            >
              <PowerOff className="w-3.5 h-3.5 mr-1.5" />
              Deactivate
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleBulkDelete}
              disabled={bulkPending}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              Delete
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedIds(new Set())}
            >
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search routes..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as any); setPage(1) }}>
          <SelectTrigger className="w-36">
            <Filter className="w-3 h-3 mr-2 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Status</SelectItem>
            <SelectItem value="PUBLISHED">Published</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
          </SelectContent>
        </Select>
        {allTags.length > 0 && (
          <Select value={tagFilter} onValueChange={(v) => { setTagFilter(v); setPage(1) }}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All Tags" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Tags</SelectItem>
              {allTags.map((tag) => (
                <SelectItem key={tag} value={tag}>{tag}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border/50 bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b border-border/50">
              <tr>
                <th className="px-3 py-3 text-left w-10">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleAll}
                    aria-label="Select all"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Route
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Target
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Methods
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Health
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Features
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Updated
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-3 py-3"><Skeleton className="h-4 w-4" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-10 w-full" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-40" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-20" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-8" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-8 w-8 ml-auto" /></td>
                  </tr>
                ))
              ) : routes.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-medium text-foreground">No routes found</p>
                        <p className="text-sm">
                          {search ? 'Try a different search term' : 'Create your first route to get started'}
                        </p>
                      </div>
                      {!search && (
                        <Button asChild>
                          <Link href="/routes/new">
                            <Plus className="w-4 h-4 mr-2" />
                            Create Route
                          </Link>
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                routes.map((route) => (
                  <RouteRow
                    key={route.id}
                    route={route}
                    selected={selectedIds.has(route.id)}
                    onToggle={() => toggleOne(route.id)}
                    onPublish={() => publish.mutate(route.id)}
                    onDeactivate={() => deactivate.mutate(route.id)}
                    onDuplicate={() => duplicate.mutate(route.id)}
                    onDelete={async () => {
                      const ok = await confirm({
                        title: 'Delete Route',
                        description: `Are you sure you want to delete "${route.name}"? This action cannot be undone.`,
                        confirmLabel: 'Delete',
                        variant: 'destructive',
                      })
                      if (ok) deleteRoute.mutate(route.id)
                    }}
                    isLoading={publish.isPending || deactivate.isPending}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border/50">
            <p className="text-xs text-muted-foreground">
              Page {page} of {totalPages} ({total} total)
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page === totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function CopyUrlButton({ path }: { path: string }) {
  const [copied, setCopied] = useState(false)
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const proxyPath = path.startsWith('/r/') ? path : `/r${path.startsWith('/') ? path : `/${path}`}`
  const url = `${origin}${proxyPath}`

  const handleCopy = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    copyToClipboard(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button
      onClick={handleCopy}
      title={`Copy: ${url}`}
      className="ml-1 inline-flex items-center opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
    >
      {copied
        ? <Check className="w-3 h-3 text-green-500" />
        : <Copy className="w-3 h-3" />
      }
    </button>
  )
}

function RouteRow({
  route,
  selected,
  onToggle,
  onPublish,
  onDeactivate,
  onDuplicate,
  onDelete,
  isLoading,
}: {
  route: Route
  selected: boolean
  onToggle: () => void
  onPublish: () => void
  onDeactivate: () => void
  onDuplicate: () => void
  onDelete: () => void
  isLoading: boolean
}) {
  const health = route.healthChecks?.[0]

  return (
    <tr className="hover:bg-muted/20 transition-colors group">
      <td className="px-3 py-3">
        <Checkbox
          checked={selected}
          onCheckedChange={onToggle}
          aria-label={`Select ${route.name}`}
        />
      </td>
      <td className="px-4 py-3">
        <div>
          <Link
            href={`/routes/${route.id}`}
            className="font-medium text-foreground hover:text-primary transition-colors"
          >
            {route.name}
          </Link>
          <p className="text-xs text-muted-foreground font-mono mt-0.5 flex items-center gap-0.5">
            {route.publicPath}
            <CopyUrlButton path={route.publicPath} />
          </p>
          {route.tags.length > 0 && (
            <div className="flex gap-1 mt-1 flex-wrap">
              {route.tags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs py-0 px-1.5">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </td>
      <td className="px-4 py-3 max-w-[200px]">
        <span className="text-xs text-muted-foreground font-mono block truncate" title={route.targetUrl}>
          {route.targetUrl}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-1 flex-wrap">
          {route.methods.map((m) => (
            <MethodBadge key={m} method={m} />
          ))}
        </div>
      </td>
      <td className="px-4 py-3">
        <RouteStatusBadge status={route.status} isActive={route.isActive} />
      </td>
      <td className="px-4 py-3">
        <HealthIndicator
          status={health?.status}
          responseTime={health?.responseTime}
          showLabel
        />
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-1 flex-wrap">
          {route.wsEnabled && (
            <Badge variant="outline" className="text-xs py-0 px-1.5">WS</Badge>
          )}
          <CircuitBreakerBadge
            enabled={route.circuitBreakerEnabled}
            state={route.cbState}
            failureCount={route.cbFailureCount}
          />
        </div>
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
        {formatRelativeTime(route.updatedAt)}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link href={`/routes/${route.id}`}>
              <Eye className="w-3.5 h-3.5" />
            </Link>
          </Button>
          <Button variant="ghost" size="icon-sm" asChild>
            <Link href={`/routes/${route.id}/edit`}>
              <Edit className="w-3.5 h-3.5" />
            </Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm">
                <MoreHorizontal className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {route.status === 'DRAFT' || !route.isActive ? (
                <DropdownMenuItem onClick={onPublish} disabled={isLoading}>
                  <Play className="w-4 h-4 mr-2 text-green-500" />
                  Publish
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={onDeactivate} disabled={isLoading}>
                  <XCircle className="w-4 h-4 mr-2 text-yellow-500" />
                  Deactivate
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={onDuplicate} disabled={isLoading}>
                <Copy className="w-4 h-4 mr-2" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </td>
    </tr>
  )
}
