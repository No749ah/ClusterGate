'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Search, Filter, RefreshCw, Download } from 'lucide-react'
import { useLogs } from '@/hooks/useLogs'
import { useRoutes } from '@/hooks/useRoutes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
    statusType: (statusType as 'success' | 'error' | 'client') || undefined,
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
        <Select value={routeId || 'ALL'} onValueChange={(v) => { setRouteId(v === 'ALL' ? '' : v); setPage(1) }}>
          <SelectTrigger className="w-44">
            <Filter className="w-3 h-3 mr-2 text-muted-foreground" />
            <SelectValue placeholder="All Routes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Routes</SelectItem>
            {routes.map((r) => (
              <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

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
            <SelectItem value="error">Server error (5xx)</SelectItem>
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
                    <td className="px-4 py-2.5 text-xs text-foreground max-w-[140px] truncate" title={log.route?.name ?? undefined}>
                      {log.route?.name ?? '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{log.method}</span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground max-w-[200px] truncate" title={log.path}>
                      {log.path}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`font-semibold text-sm ${getStatusColor(log.responseStatus)}`}>
                        {log.responseStatus ?? 'ERR'}
                      </span>
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
