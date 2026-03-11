'use client'

import { useState } from 'react'
import { Filter, RefreshCw, Shield, User, FileText } from 'lucide-react'
import { useAuditLogs } from '@/hooks/useAuditLogs'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatRelativeTime, formatDate } from '@/lib/utils'
import { useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { AuditLog } from '@/types'

const ACTION_COLORS: Record<string, string> = {
  CREATE: 'text-green-500 bg-green-500/10',
  UPDATE: 'text-blue-500 bg-blue-500/10',
  DELETE: 'text-red-500 bg-red-500/10',
  PUBLISH: 'text-purple-500 bg-purple-500/10',
  LOGIN: 'text-yellow-500 bg-yellow-500/10',
  LOGIN_FAILED: 'text-red-500 bg-red-500/10',
  LOGOUT: 'text-gray-500 bg-gray-500/10',
  SETUP: 'text-emerald-500 bg-emerald-500/10',
  CHANGE_PASSWORD: 'text-orange-500 bg-orange-500/10',
  ACCEPT_INVITE: 'text-teal-500 bg-teal-500/10',
  REVOKE: 'text-red-500 bg-red-500/10',
}

function getActionColor(action: string): string {
  const key = action.split('.').pop()?.toUpperCase() ?? ''
  return ACTION_COLORS[key] ?? 'text-muted-foreground bg-muted'
}

export default function AuditPage() {
  const queryClient = useQueryClient()
  const [resource, setResource] = useState<string>('')
  const [page, setPage] = useState(1)
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null)

  const { data: logsData, isLoading, isFetching } = useAuditLogs({
    resource: resource || undefined,
    page,
    pageSize: 50,
  })

  const logs = logsData?.data ?? []
  const total = logsData?.total ?? 0
  const totalPages = logsData?.totalPages ?? 1

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Audit Log</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {total.toLocaleString()} audit entries
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => queryClient.invalidateQueries({ queryKey: ['audit'] })}
          disabled={isFetching}
        >
          <RefreshCw className={cn('w-4 h-4 mr-2', isFetching && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={resource || 'ALL'} onValueChange={(v) => { setResource(v === 'ALL' ? '' : v); setPage(1) }}>
          <SelectTrigger className="w-40">
            <Filter className="w-3 h-3 mr-2 text-muted-foreground" />
            <SelectValue placeholder="All Resources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Resources</SelectItem>
            <SelectItem value="routes">Routes</SelectItem>
            <SelectItem value="users">Users</SelectItem>
            <SelectItem value="auth">Auth</SelectItem>
            <SelectItem value="api-keys">API Keys</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border/50 bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b border-border/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Time</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">User</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Action</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Resource</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 5 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                    <Shield className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No audit entries found</p>
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
                    <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap" title={formatDate(log.createdAt)}>
                      {formatRelativeTime(log.createdAt)}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-semibold flex-shrink-0">
                          {log.user?.name?.charAt(0).toUpperCase() ?? '?'}
                        </div>
                        <span className="text-xs text-foreground truncate max-w-[120px]">
                          {log.user?.name ?? 'System'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge className={cn('text-xs font-mono', getActionColor(log.action))}>
                        {log.action}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <FileText className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs text-foreground">{log.resource}</span>
                        {log.resourceId && (
                          <span className="text-xs text-muted-foreground font-mono truncate max-w-[80px]">
                            #{log.resourceId.slice(-6)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground font-mono">
                      {log.ip ?? '—'}
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
            <p className="text-xs font-medium text-muted-foreground mb-2">Details</p>
            <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-all max-h-40 overflow-auto rounded-md bg-muted/30 p-3">
              {JSON.stringify(selectedLog.details, null, 2)}
            </pre>
            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              <span>User Agent: {selectedLog.userAgent?.slice(0, 80) ?? '—'}</span>
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
