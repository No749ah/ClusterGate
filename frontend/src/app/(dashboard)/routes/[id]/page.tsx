'use client'

import { useState, use } from 'react'
import Link from 'next/link'
import { ArrowLeft, Edit, Play, CheckCircle2, XCircle, Clock, Activity, Copy, Check, RefreshCw, Target, Zap, ArrowRightLeft, Plus, Trash2, Power, PowerOff, Shield, Wifi } from 'lucide-react'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { useRoute, useRouteStats, useRouteUptime, usePublishRoute, useDeactivateRoute, useDuplicateRoute, useRouteVersions, useRestoreRouteVersion, useRouteHealth } from '@/hooks/useRoutes'
import { useLogs } from '@/hooks/useLogs'
import { RouteTestPanel } from '@/components/routes/RouteTestPanel'
import { ApiKeysPanel } from '@/components/routes/ApiKeysPanel'
import { RouteStatusBadge } from '@/components/routes/RouteStatusBadge'
import { HealthIndicator } from '@/components/routes/HealthIndicator'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { RequestLog, RouteVersion, RouteTarget, TransformRule, TransformPhase, TransformType, LBStrategy } from '@/types'
import { formatRelativeTime, formatDate, formatDuration, getStatusColor, copyToClipboard } from '@/lib/utils'
import { api } from '@/lib/api'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

// Removed PROXY_BASE - using window.location.origin instead

export default function RouteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [selectedLog, setSelectedLog] = useState<RequestLog | null>(null)
  const [diffVersion, setDiffVersion] = useState<RouteVersion | null>(null)

  const { data: routeData, isLoading } = useRoute(id)
  const { data: statsData } = useRouteStats(id)
  const { data: uptimeData } = useRouteUptime(id)
  const { data: logsData } = useLogs({ routeId: id, pageSize: 20 })
  const { data: versionsData } = useRouteVersions(id)

  const confirm = useConfirm()
  const publish = usePublishRoute()
  const deactivate = useDeactivateRoute()
  const duplicate = useDuplicateRoute()
  const healthCheck = useRouteHealth(id)
  const restoreVersion = useRestoreRouteVersion(id)

  const route = routeData?.data
  const stats = statsData?.data
  const uptime = uptimeData?.data
  const logs = logsData?.data ?? []
  const versions = versionsData?.data ?? []

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (!route) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
        <p className="text-lg font-medium text-foreground">Route not found</p>
        <Button className="mt-4" asChild><Link href="/routes">Back to Routes</Link></Button>
      </div>
    )
  }

  const health = route.healthChecks?.[0]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/routes"><ArrowLeft className="w-4 h-4" /></Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">{route.name}</h1>
              <RouteStatusBadge status={route.status} isActive={route.isActive} />
              <HealthIndicator status={health?.status} responseTime={health?.responseTime} error={health?.error} showLabel />
            </div>
            {route.description && (
              <p className="text-sm text-muted-foreground mt-1">{route.description}</p>
            )}
            <div className="flex items-center gap-2 mt-2 font-mono text-sm min-w-0">
              <CopyUrlButton path={route.publicPath} />
              <span className="text-muted-foreground flex-shrink-0">→</span>
              <span className="text-primary truncate max-w-[300px]" title={route.targetUrl}>{route.targetUrl}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => healthCheck.mutate()}
            disabled={healthCheck.isPending}
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-2 ${healthCheck.isPending ? 'animate-spin' : ''}`} />
            Check Health
          </Button>
          {route.status === 'DRAFT' || !route.isActive ? (
            <Button size="sm" onClick={() => publish.mutate(id)} disabled={publish.isPending}>
              <Play className="w-3.5 h-3.5 mr-2" />
              Publish
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => deactivate.mutate(id)} disabled={deactivate.isPending}>
              <XCircle className="w-3.5 h-3.5 mr-2" />
              Deactivate
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => duplicate.mutate(id)} disabled={duplicate.isPending}>
            <Copy className="w-3.5 h-3.5 mr-2" />
            {duplicate.isPending ? 'Duplicating...' : 'Duplicate'}
          </Button>
          <Button size="sm" asChild>
            <Link href={`/routes/${id}/edit`}>
              <Edit className="w-3.5 h-3.5 mr-2" />
              Edit
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <StatsCard icon={Activity} label="Total Requests" value={stats.total.toLocaleString()} />
          <StatsCard
            icon={CheckCircle2}
            label="Success Rate"
            value={`${stats.successRate}%`}
            valueClass={stats.successRate >= 95 ? 'text-green-500' : 'text-red-500'}
          />
          <StatsCard icon={Clock} label="Avg Duration" value={formatDuration(stats.avgDuration)} />
          <StatsCard
            icon={Clock}
            label="P95 Duration"
            value={formatDuration(stats.p95Duration)}
          />
          <StatsCard
            icon={CheckCircle2}
            label="Uptime"
            value={uptime ? `${uptime.uptimePercent}%` : 'N/A'}
            valueClass={uptime && uptime.uptimePercent >= 99 ? 'text-green-500' : uptime && uptime.uptimePercent >= 95 ? 'text-yellow-500' : uptime ? 'text-red-500' : undefined}
          />
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="test">Test</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="api-keys">API Keys</TabsTrigger>
          <TabsTrigger value="targets">Targets</TabsTrigger>
          <TabsTrigger value="transforms">Transforms</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">Routing</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <InfoRow label="Public Path" value={route.publicPath} mono />
                <InfoRow label="Target URL" value={route.targetUrl} mono />
                <InfoRow label="Methods" value={
                  <div className="flex gap-1 flex-wrap">
                    {route.methods.map((m) => (
                      <span key={m} className="px-1.5 py-0.5 rounded text-xs font-mono bg-muted border border-border/50">{m}</span>
                    ))}
                  </div>
                } />
                <InfoRow label="Strip Prefix" value={route.stripPrefix ? 'Yes' : 'No'} />
                <InfoRow label="SSL Verify" value={route.sslVerify !== false ? 'Enabled' : 'Disabled'} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm">Configuration</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <InfoRow label="Timeout" value={`${route.timeout}ms`} />
                <InfoRow label="Retry Count" value={String(route.retryCount)} />
                <InfoRow label="Retry Delay" value={`${route.retryDelay}ms`} />
                <InfoRow label="Body Limit" value={route.requestBodyLimit} />
                <InfoRow label="Version" value={`v${route.version}`} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm">Security</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <InfoRow label="Auth Required" value={route.requireAuth ? 'Yes' : 'No'} />
                {route.requireAuth && <InfoRow label="Auth Type" value={route.authType} />}
                <InfoRow label="IP Allowlist" value={route.ipAllowlist.length > 0 ? `${route.ipAllowlist.length} entries` : 'Allow all'} />
                <InfoRow label="Webhook Secret" value={route.webhookSecret ? '••••••••' : 'None'} />
                <InfoRow label="CORS" value={route.corsEnabled ? `Enabled (${route.corsOrigins.length} origins)` : 'Disabled'} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm">Meta</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <InfoRow label="Tags" value={
                  route.tags.length > 0
                    ? <div className="flex gap-1 flex-wrap">
                        {route.tags.map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}
                      </div>
                    : 'None'
                } />
                <InfoRow label="Created By" value={route.createdBy?.name ?? '—'} />
                <InfoRow label="Updated By" value={route.updatedBy?.name ?? '—'} />
                <InfoRow label="Created" value={formatDate(route.createdAt)} />
                <InfoRow label="Updated" value={formatDate(route.updatedAt)} />
              </CardContent>
            </Card>

            {/* WebSocket & Circuit Breaker */}
            <Card>
              <CardHeader><CardTitle className="text-sm">Features</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <InfoRow label="WebSocket" value={route.wsEnabled ? 'Enabled' : 'Disabled'} />
                <InfoRow label="Circuit Breaker" value={route.circuitBreakerEnabled ? 'Enabled' : 'Disabled'} />
                {route.circuitBreakerEnabled && (
                  <>
                    <InfoRow label="CB State" value={route.cbState || 'CLOSED'} />
                    <InfoRow label="Failure Threshold" value={String(route.cbFailureThreshold)} />
                    <InfoRow label="Recovery Timeout" value={`${route.cbRecoveryTimeout}ms`} />
                    <InfoRow label="Failure Count" value={String(route.cbFailureCount)} />
                  </>
                )}
                <InfoRow label="LB Strategy" value={route.lbStrategy?.replace('_', ' ') || 'Round Robin'} />
                {route.routeGroup && (
                  <InfoRow label="Route Group" value={route.routeGroup.name} />
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="test" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Test Route</CardTitle>
            </CardHeader>
            <CardContent>
              <RouteTestPanel routeId={id} defaultPath={route.publicPath} methods={route.methods} requireAuth={route.requireAuth} authType={route.authType} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Request Logs</CardTitle></CardHeader>
            <CardContent>
              {logs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No requests logged yet</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50 text-xs text-muted-foreground">
                        <th className="pb-2 text-left font-medium">Time</th>
                        <th className="pb-2 text-left font-medium">Method</th>
                        <th className="pb-2 text-left font-medium">Path</th>
                        <th className="pb-2 text-left font-medium">Status</th>
                        <th className="pb-2 text-right font-medium">Duration</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {logs.map((log) => (
                        <tr key={log.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => setSelectedLog(log)}>
                          <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap text-xs">
                            {formatRelativeTime(log.createdAt)}
                          </td>
                          <td className="py-2 pr-4">
                            <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{log.method}</span>
                          </td>
                          <td className="py-2 pr-4 font-mono text-xs text-muted-foreground max-w-[200px] truncate" title={log.path}>
                            {log.path}
                          </td>
                          <td className="py-2 pr-4">
                            <span className={`font-medium text-sm ${getStatusColor(log.responseStatus)}`}>
                              {log.responseStatus ?? 'ERR'}
                            </span>
                          </td>
                          <td className="py-2 text-right text-xs text-muted-foreground">
                            {formatDuration(log.duration)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="api-keys" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>API Keys</CardTitle>
            </CardHeader>
            <CardContent>
              <ApiKeysPanel routeId={id} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="targets" className="mt-4">
          <TargetsPanel routeId={id} lbStrategy={route.lbStrategy} />
        </TabsContent>

        <TabsContent value="transforms" className="mt-4">
          <TransformsPanel routeId={id} />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Version History</CardTitle></CardHeader>
            <CardContent>
              {versions.length === 0 ? (
                <p className="text-muted-foreground text-sm py-4 text-center">No versions yet</p>
              ) : (
                <div className="space-y-2">
                  {versions.map((v) => (
                    <div key={v.id} className="flex items-center justify-between p-3 rounded-lg border border-border/50 hover:bg-muted/30">
                      <div>
                        <p className="text-sm font-medium">Version {v.version}</p>
                        <p className="text-xs text-muted-foreground">
                          {v.createdBy?.name ?? 'Unknown'} · {formatRelativeTime(v.createdAt)}
                        </p>
                      </div>
                      {v.version !== route.version && (
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDiffVersion(v)}
                          >
                            Compare
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={restoreVersion.isPending}
                            onClick={async () => {
                              const ok = await confirm({
                                title: 'Restore Version',
                                description: `Restore route configuration to version ${v.version}? The current configuration will be saved as a new version.`,
                                confirmLabel: 'Restore',
                              })
                              if (ok) restoreVersion.mutate(v.id)
                            }}
                          >
                            {restoreVersion.isPending ? 'Restoring...' : 'Restore'}
                          </Button>
                        </div>
                      )}
                      {v.version === route.version && (
                        <Badge variant="success">Current</Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Log Detail Modal */}
      <LogDetailDialog log={selectedLog} onClose={() => setSelectedLog(null)} />

      {/* Version Diff Dialog */}
      <VersionDiffDialog
        oldVersion={diffVersion}
        currentRoute={route}
        onClose={() => setDiffVersion(null)}
      />
    </div>
  )
}

function CopyUrlButton({ path }: { path: string }) {
  const [copied, setCopied] = useState(false)
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const proxyPath = path.startsWith('/r/') ? path : `/r${path.startsWith('/') ? path : `/${path}`}`
  const url = `${origin}${proxyPath}`

  const truncateUrl = (u: string, maxLen = 50) => {
    if (u.length <= maxLen) return u
    const proto = u.indexOf('://') + 3
    const start = u.slice(0, proto + 15)
    const end = u.slice(-15)
    return `${start}...${end}`
  }

  return (
    <button
      onClick={() => {
        copyToClipboard(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      title={url}
      className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors min-w-0"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-500 flex-shrink-0" /> : <Copy className="w-3.5 h-3.5 flex-shrink-0" />}
      <span className="truncate">{truncateUrl(url)}</span>
    </button>
  )
}

function StatsCard({
  icon: Icon,
  label,
  value,
  valueClass,
}: {
  icon: any
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-2">
          <Icon className="w-4 h-4" />
          <span className="text-xs">{label}</span>
        </div>
        <p className={`text-2xl font-bold ${valueClass ?? 'text-foreground'}`}>{value}</p>
      </CardContent>
    </Card>
  )
}

function LogDetailDialog({ log, onClose }: { log: RequestLog | null; onClose: () => void }) {
  const [curlCopied, setCurlCopied] = useState(false)

  if (!log) return null

  const fullUrl = log.targetUrl || log.path
  const curlCommand = generateCurl(log)

  return (
    <Dialog open={!!log} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Request Detail</DialogTitle>
          <DialogDescription>
            {log.method} {log.path} - {log.responseStatus ?? 'ERR'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Request ID</span>
              <p className="font-mono text-xs mt-0.5 break-all">{log.requestId}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Route</span>
              <p className="mt-0.5">{log.route?.name ?? 'Unknown'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Method</span>
              <p className="mt-0.5 font-mono">{log.method}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Path</span>
              <p className="mt-0.5 font-mono text-xs break-all">{log.path}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Full URL</span>
              <p className="mt-0.5 font-mono text-xs break-all">{fullUrl}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Status Code</span>
              <p className={`mt-0.5 font-medium ${getStatusColor(log.responseStatus)}`}>
                {log.responseStatus ?? 'ERR'}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Duration</span>
              <p className="mt-0.5">{formatDuration(log.duration)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Timestamp</span>
              <p className="mt-0.5 text-xs">{formatDate(log.createdAt)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Client IP</span>
              <p className="mt-0.5 font-mono text-xs">{log.ip ?? 'Unknown'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">User Agent</span>
              <p className="mt-0.5 text-xs truncate" title={log.userAgent ?? undefined}>{log.userAgent ?? 'Unknown'}</p>
            </div>
          </div>

          {/* Error */}
          {log.error && (
            <div>
              <h4 className="text-sm font-medium text-red-500 mb-1">Error</h4>
              <pre className="bg-red-500/10 border border-red-500/20 rounded-md p-3 text-xs text-red-400 whitespace-pre-wrap break-all">
                {log.error}
              </pre>
            </div>
          )}

          {/* Request Headers */}
          {log.requestHeaders && Object.keys(log.requestHeaders).length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-1">Request Headers</h4>
              <pre className="bg-muted rounded-md p-3 text-xs overflow-x-auto whitespace-pre-wrap break-all">
                {JSON.stringify(log.requestHeaders, null, 2)}
              </pre>
            </div>
          )}

          {/* Request Body */}
          {log.requestBody && (
            <div>
              <h4 className="text-sm font-medium mb-1">Request Body</h4>
              <pre className="bg-muted rounded-md p-3 text-xs overflow-x-auto whitespace-pre-wrap break-all">
                {formatJsonSafe(log.requestBody)}
              </pre>
            </div>
          )}

          {/* Response Headers */}
          {log.responseHeaders && Object.keys(log.responseHeaders).length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-1">Response Headers</h4>
              <pre className="bg-muted rounded-md p-3 text-xs overflow-x-auto whitespace-pre-wrap break-all">
                {JSON.stringify(log.responseHeaders, null, 2)}
              </pre>
            </div>
          )}

          {/* Response Body */}
          {log.responseBody && (
            <div>
              <h4 className="text-sm font-medium mb-1">Response Body</h4>
              <pre className="bg-muted rounded-md p-3 text-xs overflow-x-auto whitespace-pre-wrap break-all max-h-[200px]">
                {formatJsonSafe(log.responseBody)}
              </pre>
            </div>
          )}

          {/* Copy as cURL */}
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => {
              copyToClipboard(curlCommand)
              setCurlCopied(true)
              setTimeout(() => setCurlCopied(false), 1500)
            }}
          >
            {curlCopied ? (
              <><Check className="w-3.5 h-3.5 mr-2" /> Copied!</>
            ) : (
              <><Copy className="w-3.5 h-3.5 mr-2" /> Copy as cURL</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function generateCurl(log: RequestLog): string {
  const parts = ['curl']
  parts.push(`-X ${log.method}`)
  const url = log.targetUrl || log.path
  parts.push(`'${url}'`)

  if (log.requestHeaders) {
    for (const [key, value] of Object.entries(log.requestHeaders)) {
      if (['host', 'content-length', 'transfer-encoding'].includes(key.toLowerCase())) continue
      parts.push(`-H '${key}: ${value}'`)
    }
  }

  if (log.requestBody) {
    parts.push(`-d '${log.requestBody.replace(/'/g, "'\\''")}'`)
  }

  return parts.join(' \\\n  ')
}

function formatJsonSafe(str: string): string {
  try {
    return JSON.stringify(JSON.parse(str), null, 2)
  } catch {
    return str
  }
}

const DIFF_FIELDS = [
  'name', 'description', 'publicPath', 'targetUrl', 'methods', 'tags',
  'timeout', 'retryCount', 'retryDelay', 'stripPrefix', 'sslVerify',
  'requestBodyLimit', 'addHeaders', 'removeHeaders', 'rewriteRules',
  'corsEnabled', 'corsOrigins', 'ipAllowlist', 'requireAuth', 'authType',
  'maintenanceMode', 'maintenanceMessage',
] as const

function VersionDiffDialog({
  oldVersion,
  currentRoute,
  onClose,
}: {
  oldVersion: RouteVersion | null
  currentRoute: any
  onClose: () => void
}) {
  if (!oldVersion || !currentRoute) return null

  const oldSnap = oldVersion.snapshot as Record<string, any>
  const current = currentRoute as Record<string, any>

  const diffs: { field: string; old: string; new: string }[] = []
  for (const field of DIFF_FIELDS) {
    const oldVal = JSON.stringify(oldSnap[field] ?? null)
    const newVal = JSON.stringify(current[field] ?? null)
    if (oldVal !== newVal) {
      diffs.push({ field, old: oldVal, new: newVal })
    }
  }

  return (
    <Dialog open={!!oldVersion} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Version {oldVersion.version} vs Current (v{currentRoute.version})
          </DialogTitle>
          <DialogDescription>
            {diffs.length === 0 ? 'No differences found.' : `${diffs.length} field(s) changed.`}
          </DialogDescription>
        </DialogHeader>

        {diffs.length > 0 && (
          <div className="space-y-3">
            {diffs.map((d) => (
              <div key={d.field} className="rounded-lg border border-border/50 overflow-hidden">
                <div className="px-3 py-1.5 bg-muted text-xs font-medium">{d.field}</div>
                <div className="grid grid-cols-2 divide-x divide-border/50">
                  <div className="p-3">
                    <p className="text-[10px] text-muted-foreground mb-1">v{oldVersion.version}</p>
                    <pre className="text-xs bg-red-500/10 text-red-400 rounded p-2 whitespace-pre-wrap break-all">
                      {formatJsonValue(d.old)}
                    </pre>
                  </div>
                  <div className="p-3">
                    <p className="text-[10px] text-muted-foreground mb-1">Current (v{currentRoute.version})</p>
                    <pre className="text-xs bg-green-500/10 text-green-400 rounded p-2 whitespace-pre-wrap break-all">
                      {formatJsonValue(d.new)}
                    </pre>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function formatJsonValue(str: string): string {
  try {
    const parsed = JSON.parse(str)
    if (typeof parsed === 'object' && parsed !== null) {
      return JSON.stringify(parsed, null, 2)
    }
    return String(parsed)
  } catch {
    return str
  }
}

function InfoRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted-foreground flex-shrink-0">{label}</span>
      {typeof value === 'string' ? (
        <span
          className={`text-foreground text-right truncate max-w-[260px] ${mono ? 'font-mono text-xs' : ''}`}
          title={value}
        >
          {value}
        </span>
      ) : (
        <div className="flex justify-end">{value}</div>
      )}
    </div>
  )
}

function TargetsPanel({ routeId, lbStrategy }: { routeId: string; lbStrategy: LBStrategy }) {
  const queryClient = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [newUrl, setNewUrl] = useState('')
  const [newWeight, setNewWeight] = useState(1)
  const [newPriority, setNewPriority] = useState(0)

  const { data: targetsData, isLoading } = useQuery({
    queryKey: ['targets', routeId],
    queryFn: () => api.targets.list(routeId),
  })

  const createTarget = useMutation({
    mutationFn: (data: { url: string; weight: number; priority: number }) =>
      api.targets.create(routeId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['targets', routeId] })
      toast.success('Target added')
      setShowAdd(false)
      setNewUrl('')
      setNewWeight(1)
      setNewPriority(0)
    },
    onError: (err: any) => toast.error(err.message || 'Failed to add target'),
  })

  const deleteTarget = useMutation({
    mutationFn: (targetId: string) => api.targets.delete(routeId, targetId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['targets', routeId] })
      toast.success('Target removed')
    },
    onError: (err: any) => toast.error(err.message || 'Failed to remove target'),
  })

  const toggleHealth = useMutation({
    mutationFn: ({ targetId, isHealthy }: { targetId: string; isHealthy: boolean }) =>
      api.targets.update(routeId, targetId, { isHealthy }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['targets', routeId] })
    },
  })

  const targets = targetsData?.data ?? []

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Load Balancer Targets</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Strategy: <Badge variant="secondary">{lbStrategy?.replace('_', ' ') || 'Round Robin'}</Badge>
            </p>
          </div>
          <Button size="sm" onClick={() => setShowAdd(!showAdd)}>
            <Plus className="w-3.5 h-3.5 mr-2" />
            Add Target
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {showAdd && (
          <div className="flex gap-2 mb-4 p-3 rounded-lg border border-border/50 bg-muted/30">
            <Input
              placeholder="http://backend:8080"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              className="flex-1"
            />
            <Input
              type="number"
              placeholder="Weight"
              value={newWeight}
              onChange={(e) => setNewWeight(Number(e.target.value))}
              className="w-24"
            />
            <Input
              type="number"
              placeholder="Priority"
              value={newPriority}
              onChange={(e) => setNewPriority(Number(e.target.value))}
              className="w-24"
            />
            <Button
              size="sm"
              disabled={!newUrl || createTarget.isPending}
              onClick={() => createTarget.mutate({ url: newUrl, weight: newWeight, priority: newPriority })}
            >
              {createTarget.isPending ? 'Adding...' : 'Add'}
            </Button>
          </div>
        )}

        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground text-sm">Loading targets...</div>
        ) : targets.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <p className="text-sm">No targets configured</p>
            <p className="text-xs mt-1">Add backend targets for load balancing. Without targets, the route uses the primary target URL.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {targets.map((target) => (
              <div key={target.id} className="flex items-center justify-between p-3 rounded-lg border border-border/50 hover:bg-muted/30">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${target.isHealthy ? 'bg-green-500' : 'bg-red-500'}`} />
                  <div>
                    <p className="text-sm font-mono">{target.url}</p>
                    <p className="text-xs text-muted-foreground">
                      Weight: {target.weight} · Priority: {target.priority}
                      {target.lastError && <span className="text-red-400 ml-2">Last error: {target.lastError}</span>}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleHealth.mutate({ targetId: target.id, isHealthy: !target.isHealthy })}
                    title={target.isHealthy ? 'Mark unhealthy' : 'Mark healthy'}
                  >
                    {target.isHealthy ? <Power className="w-3.5 h-3.5 text-green-500" /> : <PowerOff className="w-3.5 h-3.5 text-red-500" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteTarget.mutate(target.id)}
                    disabled={deleteTarget.isPending}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function TransformsPanel({ routeId }: { routeId: string }) {
  const queryClient = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPhase, setNewPhase] = useState<string>('REQUEST')
  const [newType, setNewType] = useState<string>('SET_HEADER')
  const [newConfigKey, setNewConfigKey] = useState('')
  const [newConfigValue, setNewConfigValue] = useState('')

  const { data: transformsData, isLoading } = useQuery({
    queryKey: ['transforms', routeId],
    queryFn: () => api.transforms.list(routeId),
  })

  const createTransform = useMutation({
    mutationFn: (data: { phase: string; type: string; name: string; config: Record<string, any> }) =>
      api.transforms.create(routeId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transforms', routeId] })
      toast.success('Transform rule added')
      setShowAdd(false)
      setNewName('')
      setNewConfigKey('')
      setNewConfigValue('')
    },
    onError: (err: any) => toast.error(err.message || 'Failed to add transform'),
  })

  const deleteTransform = useMutation({
    mutationFn: (ruleId: string) => api.transforms.delete(routeId, ruleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transforms', routeId] })
      toast.success('Transform rule removed')
    },
    onError: (err: any) => toast.error(err.message || 'Failed to remove transform'),
  })

  const toggleActive = useMutation({
    mutationFn: ({ ruleId, isActive }: { ruleId: string; isActive: boolean }) =>
      api.transforms.update(routeId, ruleId, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transforms', routeId] })
    },
  })

  const transforms = transformsData?.data ?? []

  const buildConfig = () => {
    if (newType === 'SET_HEADER') return { headerName: newConfigKey, headerValue: newConfigValue }
    if (newType === 'REMOVE_HEADER') return { headerName: newConfigKey }
    if (newType === 'SET_QUERY_PARAM') return { paramName: newConfigKey, paramValue: newConfigValue }
    if (newType === 'REMOVE_QUERY_PARAM') return { paramName: newConfigKey }
    if (newType === 'MAP_STATUS_CODE') return { from: Number(newConfigKey), to: Number(newConfigValue) }
    if (newType === 'REWRITE_BODY_JSON') return { path: newConfigKey, value: newConfigValue }
    return {}
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Transform Rules</CardTitle>
          <Button size="sm" onClick={() => setShowAdd(!showAdd)}>
            <Plus className="w-3.5 h-3.5 mr-2" />
            Add Rule
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {showAdd && (
          <div className="mb-4 p-3 rounded-lg border border-border/50 bg-muted/30 space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <Input
                placeholder="Rule name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <Select value={newPhase} onValueChange={setNewPhase}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="REQUEST">Request</SelectItem>
                  <SelectItem value="RESPONSE">Response</SelectItem>
                </SelectContent>
              </Select>
              <Select value={newType} onValueChange={setNewType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SET_HEADER">Set Header</SelectItem>
                  <SelectItem value="REMOVE_HEADER">Remove Header</SelectItem>
                  <SelectItem value="SET_QUERY_PARAM">Set Query Param</SelectItem>
                  <SelectItem value="REMOVE_QUERY_PARAM">Remove Query Param</SelectItem>
                  <SelectItem value="MAP_STATUS_CODE">Map Status Code</SelectItem>
                  <SelectItem value="REWRITE_BODY_JSON">Rewrite Body JSON</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Input
                placeholder={newType.includes('HEADER') ? 'Header name' : newType.includes('PARAM') ? 'Param name' : newType === 'MAP_STATUS_CODE' ? 'From status' : 'JSON path'}
                value={newConfigKey}
                onChange={(e) => setNewConfigKey(e.target.value)}
                className="flex-1"
              />
              {!['REMOVE_HEADER', 'REMOVE_QUERY_PARAM'].includes(newType) && (
                <Input
                  placeholder={newType === 'MAP_STATUS_CODE' ? 'To status' : 'Value'}
                  value={newConfigValue}
                  onChange={(e) => setNewConfigValue(e.target.value)}
                  className="flex-1"
                />
              )}
              <Button
                size="sm"
                disabled={!newName || !newConfigKey || createTransform.isPending}
                onClick={() => createTransform.mutate({ phase: newPhase, type: newType, name: newName, config: buildConfig() })}
              >
                {createTransform.isPending ? 'Adding...' : 'Add'}
              </Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground text-sm">Loading transforms...</div>
        ) : transforms.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <p className="text-sm">No transform rules configured</p>
            <p className="text-xs mt-1">Add rules to modify requests or responses passing through this route.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {transforms.map((rule) => (
              <div key={rule.id} className="flex items-center justify-between p-3 rounded-lg border border-border/50 hover:bg-muted/30">
                <div className="flex items-center gap-3">
                  <Badge variant={rule.phase === 'REQUEST' ? 'default' : 'secondary'}>
                    {rule.phase}
                  </Badge>
                  <div>
                    <p className="text-sm font-medium">{rule.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {rule.type.replace(/_/g, ' ')} · Order: {rule.order}
                      {rule.config && Object.keys(rule.config).length > 0 && (
                        <span className="ml-2">
                          {Object.entries(rule.config).map(([k, v]) => `${k}=${v}`).join(', ')}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={rule.isActive}
                    onCheckedChange={(v) => toggleActive.mutate({ ruleId: rule.id, isActive: v })}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteTransform.mutate(rule.id)}
                    disabled={deleteTransform.isPending}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
