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
  // Every filter — including the rarely-bookmarked ones — survives reloads
  // and the browser back button by living in the URL search params. The
  // initial state seeds from the URL; every setter writes back via the
  // effect below.
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [routeId, setRouteId] = useState<string>(params?.get('routeId') ?? '')
  const [method, setMethod] = useState<string>(params?.get('method') ?? '')
  const [statusType, setStatusType] = useState<string>(params?.get('statusType') ?? '')
  const [search, setSearch] = useState<string>(params?.get('search') ?? '')
  const [dateFrom, setDateFrom] = useState<string>(params?.get('dateFrom') ?? '')
  const [dateTo, setDateTo] = useState<string>(params?.get('dateTo') ?? '')
  const [liveTail, setLiveTail] = useState<boolean>(params?.get('live') === '1')
  // Debounce free-text search to avoid hammering the API on every keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState(search)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  // Mirror state → URL. Empty values are dropped to keep links tidy. We use
  // replace so the back button skips intermediate keystrokes.
  useEffect(() => {
    const next = new URLSearchParams()
    if (routeId) next.set('routeId', routeId)
    if (method) next.set('method', method)
    if (statusType) next.set('statusType', statusType)
    if (debouncedSearch) next.set('search', debouncedSearch)
    if (dateFrom) next.set('dateFrom', dateFrom)
    if (dateTo) next.set('dateTo', dateTo)
    if (liveTail) next.set('live', '1')
    const qs = next.toString()
    const current = params?.toString() ?? ''
    if (qs !== current) {
      router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId, method, statusType, debouncedSearch, dateFrom, dateTo, liveTail])

  // External navigations (e.g. dashboard deep-links) overwrite local state.
  useEffect(() => {
    const r = params?.get('routeId') ?? ''
    const m = params?.get('method') ?? ''
    const s = params?.get('statusType') ?? ''
    const q = params?.get('search') ?? ''
    const df = params?.get('dateFrom') ?? ''
    const dt = params?.get('dateTo') ?? ''
    const lt = params?.get('live') === '1'
    if (r !== routeId) setRouteId(r)
    if (m !== method) setMethod(m)
    if (s !== statusType) setStatusType(s)
    if (q !== search) setSearch(q)
    if (df !== dateFrom) setDateFrom(df)
    if (dt !== dateTo) setDateTo(dt)
    if (lt !== liveTail) setLiveTail(lt)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.toString()])
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = usePageSize('activity', 25)
  const [selectedLog, setSelectedLog] = useState<RequestLog | null>(null)

  const { data: routesData } = useRoutes({ pageSize: 100 })
  const { data: logsData, isLoading, isFetching } = useLogs({
    routeId: routeId || undefined,
    method: method || undefined,
    statusType: (statusType as 'success' | 'error' | 'client' | 'throttled' | 'maintenance' | 'degraded') || undefined,
    search: debouncedSearch || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    page,
    pageSize,
  }, { refetchInterval: liveTail ? 2000 : undefined })

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

      {/* Filters — two rows so nothing gets squeezed.
            row 1: free-text search + date range + live tail
            row 2: route + method + status                       */}
      <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        {/* Free-text search across path / IP / error */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search path / IP / error"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="pl-8 h-9 w-56"
          />
        </div>
        {/* Date range — datetime-local inputs translate to ISO strings */}
        <Input
          type="datetime-local"
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
          className="h-9 w-44"
          title="From"
        />
        <Input
          type="datetime-local"
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
          className="h-9 w-44"
          title="To"
        />
        {/* Live tail — switch refetch interval to 2s and reset to page 1 */}
        <Button
          variant={liveTail ? 'default' : 'outline'}
          size="sm"
          onClick={() => { setLiveTail((v) => !v); if (!liveTail) setPage(1) }}
          title={liveTail ? 'Pause live tail' : 'Auto-refresh every 2s'}
          className="h-9"
        >
          {liveTail ? (
            <><span className="relative flex w-2 h-2 mr-1.5"><span className="animate-ping absolute inline-flex w-full h-full rounded-full bg-red-500 opacity-75" /><span className="relative inline-flex w-2 h-2 rounded-full bg-red-500" /></span> Live</>
          ) : (
            <><span className="w-2 h-2 mr-1.5 rounded-full bg-muted-foreground/40" /> Live</>
          )}
        </Button>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
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

      {/* Request/Response detail — modal with key-value header lists + a
          dedicated body block on each side. Much easier to scan than a
          single JSON.stringify dump. */}
      <Dialog open={!!selectedLog} onOpenChange={(open) => { if (!open) setSelectedLog(null) }}>
        <DialogContent className="max-w-4xl">
          <DialogHeader className="space-y-1">
            <DialogTitle className="flex items-center gap-2 text-base pr-8">
              <span className={cn(
                'font-mono text-xs px-1.5 py-0.5 rounded border',
                METHOD_TONE[selectedLog?.method as keyof typeof METHOD_TONE] ?? 'border-border text-muted-foreground'
              )}>{selectedLog?.method}</span>
              <span className="font-mono text-sm text-foreground truncate flex-1 min-w-0">{selectedLog?.path}</span>
              <span className={cn(
                'shrink-0 text-sm font-mono font-semibold tabular-nums px-1.5 py-0.5 rounded border',
                statusTone(selectedLog?.responseStatus, selectedLog?.error)
              )}>{selectedLog?.responseStatus ?? 'ERR'}</span>
            </DialogTitle>
            {selectedLog && (
              <DialogDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span>{formatDate(selectedLog.createdAt)}</span>
                <span>· {formatDuration(selectedLog.duration)}</span>
                {selectedLog.ip && <span>· {selectedLog.ip}</span>}
                {selectedLog.route?.name && <span>· {selectedLog.route.name}</span>}
              </DialogDescription>
            )}
          </DialogHeader>
          {selectedLog && (() => {
            const reqHeaders = (selectedLog.requestHeaders ?? {}) as Record<string, string>
            const resHeaders = (selectedLog.responseHeaders ?? {}) as Record<string, string>
            return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <RequestPanel title="Request" headers={reqHeaders} body={selectedLog.requestBody} />
                <RequestPanel
                  title="Response"
                  headers={resHeaders}
                  body={selectedLog.responseBody?.slice(0, 5000)}
                  error={selectedLog.error}
                />
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Method-pill colours for the detail modal title — match the route detail's palette
const METHOD_TONE: Record<string, string> = {
  GET:    'text-green-500 border-green-500/30 bg-green-500/10',
  POST:   'text-blue-500 border-blue-500/30 bg-blue-500/10',
  PUT:    'text-yellow-500 border-yellow-500/30 bg-yellow-500/10',
  PATCH:  'text-orange-500 border-orange-500/30 bg-orange-500/10',
  DELETE: 'text-red-500 border-red-500/30 bg-red-500/10',
  HEAD:   'text-purple-500 border-purple-500/30 bg-purple-500/10',
  OPTIONS:'text-muted-foreground border-border bg-muted/40',
}

function statusTone(status: number | null | undefined, error: string | null | undefined): string {
  if (status == null && error) return 'text-red-500 border-red-500/30 bg-red-500/10'
  if (status == null) return 'text-muted-foreground border-border bg-muted/40'
  if (status >= 500) return 'text-red-500 border-red-500/30 bg-red-500/10'
  if (status === 429) return 'text-amber-500 border-amber-500/30 bg-amber-500/10'
  if (status >= 400) return 'text-amber-500 border-amber-500/30 bg-amber-500/10'
  if (status >= 300) return 'text-blue-500 border-blue-500/30 bg-blue-500/10'
  return 'text-green-500 border-green-500/30 bg-green-500/10'
}

// Pretty pane for one side (Request or Response) of the detail modal.
// Renders headers as a key:value list (much easier to scan than the old
// JSON.stringify dump) plus an optional body block.
function RequestPanel({ title, headers, body, error }: {
  title: string
  headers: Record<string, string>
  body?: string | null
  error?: string | null
}) {
  const headerEntries = Object.entries(headers ?? {})
  return (
    <section className="rounded-lg border border-border/40 bg-card/40 overflow-hidden flex flex-col min-h-0">
      <header className="px-3 py-2 border-b border-border/40 flex items-center justify-between bg-muted/20">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
        <span className="text-[10px] text-muted-foreground">{headerEntries.length} header{headerEntries.length === 1 ? '' : 's'}</span>
      </header>
      {error && (
        <div className="px-3 py-2 border-b border-border/40 bg-red-500/5 text-xs">
          <p className="text-red-500 font-medium mb-0.5">Error</p>
          <p className="font-mono text-red-500/90 break-all">{error}</p>
        </div>
      )}
      {headerEntries.length > 0 && (
        <dl className="px-3 py-2 text-[11px] font-mono divide-y divide-border/20 max-h-56 overflow-auto">
          {headerEntries.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[minmax(0,140px),1fr] gap-3 py-1">
              <dt className="text-muted-foreground truncate" title={k}>{k}</dt>
              <dd className="text-foreground break-all whitespace-pre-wrap">{Array.isArray(v) ? v.join(', ') : String(v)}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="px-3 py-2 border-t border-border/40 flex-1 min-h-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Body</p>
        {body ? (
          <pre className="font-mono text-[11px] text-foreground whitespace-pre-wrap break-all max-h-72 overflow-auto rounded border border-border/30 p-2 bg-background/40">{body}</pre>
        ) : (
          <p className="text-xs text-muted-foreground italic">— no body</p>
        )}
      </div>
    </section>
  )
}
