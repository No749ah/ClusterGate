'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Search, Filter, RefreshCw, Download, Check, ChevronDown } from 'lucide-react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { useLogs } from '@/hooks/useLogs'
import { useRoutes } from '@/hooks/useRoutes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { formatRelativeTime, formatDate, formatDuration, getStatusColor } from '@/lib/utils'
import { RequestLog } from '@/types'
import { useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { usePageSize } from '@/hooks/usePageSize'
import { Pagination } from '@/components/ui/pagination'

export default function LogsPage() {
  const queryClient = useQueryClient()
  // Seed filters from the URL so dashboard tiles can deep-link
  // (e.g. /activity?statusType=error from the Error Rate card).
  const params = useSearchParams()
  const [routeId, setRouteId] = useState<string>(params?.get('routeId') ?? '')
  const [method, setMethod] = useState<string>(params?.get('method') ?? '')
  const [statusType, setStatusType] = useState<string>(params?.get('statusType') ?? '')
  // Apply later URL changes too (e.g. user navigates with a different filter
  // while already on this page).
  useEffect(() => {
    const r = params?.get('routeId') ?? ''
    const m = params?.get('method') ?? ''
    const s = params?.get('statusType') ?? ''
    if (r) setRouteId(r)
    if (m) setMethod(m)
    if (s) setStatusType(s)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.get('routeId'), params?.get('method'), params?.get('statusType')])
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = usePageSize('activity', 25)
  const [selectedLog, setSelectedLog] = useState<RequestLog | null>(null)

  const { data: routesData } = useRoutes({ pageSize: 100 })
  const { data: logsData, isLoading, isFetching } = useLogs({
    routeId: routeId || undefined,
    method: method || undefined,
    statusType: (statusType as 'success' | 'error' | 'client' | 'throttled' | 'maintenance' | 'degraded') || undefined,
    page,
    pageSize,
  })

  const logs = logsData?.data ?? []
  const total = logsData?.total ?? 0
  const totalPages = logsData?.totalPages ?? 1
  const routes = routesData?.data ?? []

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['logs'] })
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="sticky top-0 z-20 -mx-4 px-4 md:-mx-6 md:px-6 -mt-4 md:-mt-6 pt-4 md:pt-6 pb-3 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border/40 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Request Logs</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {total.toLocaleString()} total requests
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isFetching}>
          <RefreshCw className={cn('w-4 h-4 mr-2', isFetching && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        {(() => {
          const selected = new Set(routeId.split(',').map((s) => s.trim()).filter(Boolean))
          const label = selected.size === 0
            ? 'All Routes'
            : selected.size === 1
              ? routes.find((r) => r.id === [...selected][0])?.name ?? '1 route'
              : `${selected.size} routes`
          const toggle = (id: string) => {
            const next = new Set(selected)
            if (next.has(id)) next.delete(id); else next.add(id)
            setRouteId([...next].join(',')); setPage(1)
          }
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-52 justify-between h-9 font-normal">
                  <span className="flex items-center gap-2 min-w-0">
                    <Filter className="w-3 h-3 text-muted-foreground" />
                    <span className="truncate">{label}</span>
                  </span>
                  <ChevronDown className="w-3 h-3 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-64 max-h-72 overflow-y-auto p-1">
                <div className="flex items-center justify-between px-2 pt-1 pb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <span>{selected.size === 0 ? 'All routes' : `${selected.size} selected`}</span>
                  {selected.size > 0 && (
                    <button type="button" onClick={() => { setRouteId(''); setPage(1) }} className="hover:text-foreground">Clear</button>
                  )}
                </div>
                {routes.map((r) => {
                  const on = selected.has(r.id)
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => toggle(r.id)}
                      className={cn(
                        'flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm text-left hover:bg-muted/50',
                        on ? 'text-foreground' : 'text-muted-foreground'
                      )}
                    >
                      <span className={cn('inline-flex items-center justify-center w-4 h-4 rounded border', on ? 'bg-primary border-primary text-primary-foreground' : 'border-border')}>
                        {on && <Check className="w-3 h-3" />}
                      </span>
                      <span className="truncate">{r.name}</span>
                    </button>
                  )
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        })()}

        {/* Multi-select method chips: click toggles, no selection = all */}
        <div className="flex items-center gap-1 rounded-md border border-input bg-transparent px-1 h-9">
          {(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const).map((m) => {
            const selected = method.split(',').map(s => s.trim()).filter(Boolean)
            const on = selected.includes(m)
            return (
              <button
                key={m}
                type="button"
                onClick={() => {
                  const next = on ? selected.filter((x) => x !== m) : [...selected, m]
                  setMethod(next.join(','))
                  setPage(1)
                }}
                className={cn(
                  'px-1.5 py-0.5 rounded text-[10px] font-mono font-medium border transition-colors',
                  on
                    ? 'bg-primary/20 border-primary/40 text-primary'
                    : 'bg-transparent border-transparent text-muted-foreground hover:bg-muted/50'
                )}
                title={`${on ? 'Hide' : 'Show only'} ${m}`}
              >
                {m}
              </button>
            )
          })}
        </div>

        <Select value={statusType || 'ALL'} onValueChange={(v) => { setStatusType(v === 'ALL' ? '' : v); setPage(1) }}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Status</SelectItem>
            <SelectItem value="success">Success (2xx/3xx)</SelectItem>
            <SelectItem value="client">Client (4xx)</SelectItem>
            <SelectItem value="throttled">Throttled (rate limit)</SelectItem>
            <SelectItem value="maintenance">Maintenance</SelectItem>
            <SelectItem value="degraded">Degraded (circuit breaker)</SelectItem>
            <SelectItem value="error">Server error / gateway failure</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Logs Table */}
      <div className="rounded-lg border border-border/50 bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b border-border/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Time</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Route</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Method</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Path</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                    No logs found
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr
                    key={log.id}
                    className={cn(
                      'hover:bg-muted/20 transition-colors cursor-pointer',
                      selectedLog?.id === log.id && 'bg-muted/30'
                    )}
                    onClick={() => setSelectedLog(selectedLog?.id === log.id ? null : log)}
                  >
                    <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                      {formatRelativeTime(log.createdAt)}
                    </td>
                    <td className="px-4 py-2.5 text-xs max-w-[140px]" title={log.route?.name ?? undefined}>
                      {log.route?.name && log.routeId ? (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); const rid = log.routeId!; const next = new Set(routeId.split(',').map(s=>s.trim()).filter(Boolean)); next.has(rid) ? next.delete(rid) : next.add(rid); setRouteId([...next].join(',')); setPage(1) }}
                          className="text-foreground truncate hover:text-primary block w-full text-left"
                          title={`Filter by ${log.route.name}`}
                        >
                          {log.route.name}
                        </button>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); const next = new Set(method.split(',').map(s=>s.trim()).filter(Boolean)); next.has(log.method) ? next.delete(log.method) : next.add(log.method); setMethod([...next].join(',')); setPage(1) }}
                        className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded hover:bg-primary/20 hover:text-primary transition-colors"
                        title={`Filter by ${log.method}`}
                      >
                        {log.method}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground max-w-[200px] truncate" title={log.path}>
                      {log.path}
                    </td>
                    <td className="px-4 py-2.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          // Map the row's status onto the closest statusType bucket
                          const s = log.responseStatus
                          const bucket =
                            s == null ? 'error'
                            : s === 429 ? 'throttled'
                            : log.error?.includes('Circuit breaker') ? 'degraded'
                            : log.error === 'MAINTENANCE_MODE' ? 'maintenance'
                            : s >= 500 ? 'error'
                            : s >= 400 ? 'client'
                            : 'success'
                          setStatusType(statusType === bucket ? '' : bucket); setPage(1)
                        }}
                        className={`font-semibold text-sm hover:underline ${getStatusColor(log.responseStatus)}`}
                        title="Filter by this status bucket"
                      >
                        {log.responseStatus ?? 'ERR'}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-muted-foreground">
                      {formatDuration(log.duration)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Detail panel */}
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          totalPages={totalPages}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      {/* Request/Response detail — modal instead of inline below the table */}
      <Dialog open={!!selectedLog} onOpenChange={(open) => { if (!open) setSelectedLog(null) }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <span className="font-mono">{selectedLog?.method}</span>
              <span className="font-mono text-muted-foreground truncate">{selectedLog?.path}</span>
              <span className={cn(
                'ml-auto text-sm font-mono px-1.5 py-0.5 rounded',
                selectedLog && selectedLog.responseStatus && selectedLog.responseStatus >= 400 ? 'text-red-500 bg-red-500/10' : 'text-green-500 bg-green-500/10'
              )}>{selectedLog?.responseStatus ?? '—'}</span>
            </DialogTitle>
            <DialogDescription>
              {selectedLog?.createdAt && `${formatDate(selectedLog.createdAt)} · ${formatDuration(selectedLog.duration)}${selectedLog.ip ? ` · ${selectedLog.ip}` : ''}`}
            </DialogDescription>
          </DialogHeader>
          {selectedLog && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <p className="font-medium text-muted-foreground mb-2">Request</p>
                <pre className="font-mono text-foreground whitespace-pre-wrap break-all max-h-96 overflow-auto rounded border border-border/40 p-2 bg-muted/20">
                  {JSON.stringify({ headers: selectedLog.requestHeaders, body: selectedLog.requestBody }, null, 2)}
                </pre>
              </div>
              <div>
                <p className="font-medium text-muted-foreground mb-2">Response</p>
                <pre className="font-mono text-foreground whitespace-pre-wrap break-all max-h-96 overflow-auto rounded border border-border/40 p-2 bg-muted/20">
                  {selectedLog.error
                    ? `Error: ${selectedLog.error}`
                    : JSON.stringify({ status: selectedLog.responseStatus, headers: selectedLog.responseHeaders, body: selectedLog.responseBody?.slice(0, 5000) }, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
