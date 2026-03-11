'use client'

import { useState } from 'react'
import { Search, Filter, RefreshCw, Download } from 'lucide-react'
import { useLogs } from '@/hooks/useLogs'
import { useRoutes } from '@/hooks/useRoutes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatRelativeTime, formatDuration, getStatusColor } from '@/lib/utils'
import { RequestLog } from '@/types'
import { useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'

export default function LogsPage() {
  const queryClient = useQueryClient()
  const [routeId, setRouteId] = useState<string>('')
  const [method, setMethod] = useState<string>('')
  const [statusType, setStatusType] = useState<string>('')
  const [page, setPage] = useState(1)
  const [selectedLog, setSelectedLog] = useState<RequestLog | null>(null)

  const { data: routesData } = useRoutes({ pageSize: 100 })
  const { data: logsData, isLoading, isFetching } = useLogs({
    routeId: routeId || undefined,
    method: method || undefined,
    statusType: (statusType as 'success' | 'error') || undefined,
    page,
    pageSize: 50,
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
      <div className="flex items-center justify-between">
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

        <Select value={method || 'ALL'} onValueChange={(v) => { setMethod(v === 'ALL' ? '' : v); setPage(1) }}>
          <SelectTrigger className="w-28">
            <SelectValue placeholder="Method" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Methods</SelectItem>
            {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusType || 'ALL'} onValueChange={(v) => { setStatusType(v === 'ALL' ? '' : v); setPage(1) }}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Status</SelectItem>
            <SelectItem value="success">Success (2xx)</SelectItem>
            <SelectItem value="error">Error (4xx/5xx)</SelectItem>
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
                    <td className="px-4 py-2.5 text-xs text-foreground max-w-[140px] truncate">
                      {log.route?.name ?? '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{log.method}</span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground max-w-[200px] truncate">
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
        {selectedLog && (
          <div className="border-t border-border/50 p-4 bg-muted/10">
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <p className="font-medium text-muted-foreground mb-2">Request</p>
                <pre className="font-mono text-foreground whitespace-pre-wrap break-all max-h-32 overflow-auto">
                  {JSON.stringify(
                    { headers: selectedLog.requestHeaders, body: selectedLog.requestBody },
                    null,
                    2
                  )}
                </pre>
              </div>
              <div>
                <p className="font-medium text-muted-foreground mb-2">Response</p>
                <pre className="font-mono text-foreground whitespace-pre-wrap break-all max-h-32 overflow-auto">
                  {selectedLog.error
                    ? `Error: ${selectedLog.error}`
                    : JSON.stringify(
                        { status: selectedLog.responseStatus, body: selectedLog.responseBody?.slice(0, 1000) },
                        null,
                        2
                      )}
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border/50">
            <p className="text-xs text-muted-foreground">Page {page} of {totalPages}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
