'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Edit, Play, CheckCircle2, XCircle, Clock, Activity, Copy, Check, RefreshCw } from 'lucide-react'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { useRoute, useRouteStats, usePublishRoute, useDeactivateRoute, useDuplicateRoute, useRouteVersions, useRestoreRouteVersion, useRouteHealth } from '@/hooks/useRoutes'
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
import { formatRelativeTime, formatDate, formatDuration, getStatusColor } from '@/lib/utils'

const PROXY_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export default function RouteDetailPage({ params }: { params: { id: string } }) {
  const { id } = params
  const { data: routeData, isLoading } = useRoute(id)
  const { data: statsData } = useRouteStats(id)
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
    <div className="space-y-6 animate-fade-in">
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
              <HealthIndicator status={health?.status} responseTime={health?.responseTime} showLabel />
            </div>
            {route.description && (
              <p className="text-sm text-muted-foreground mt-1">{route.description}</p>
            )}
            <div className="flex items-center gap-2 mt-2 font-mono text-sm">
              <CopyUrlButton path={route.publicPath} />
              <span className="text-muted-foreground">→</span>
              <span className="text-primary">{route.targetUrl}</span>
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
          <Button variant="outline" size="sm" onClick={() => duplicate.mutate(id)}>
            <Copy className="w-3.5 h-3.5 mr-2" />
            Duplicate
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="test">Test</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="api-keys">API Keys</TabsTrigger>
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
          </div>
        </TabsContent>

        <TabsContent value="test" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Test Route</CardTitle>
            </CardHeader>
            <CardContent>
              <RouteTestPanel routeId={id} defaultPath={route.publicPath} />
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
                        <tr key={log.id} className="hover:bg-muted/30">
                          <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap text-xs">
                            {formatRelativeTime(log.createdAt)}
                          </td>
                          <td className="py-2 pr-4">
                            <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{log.method}</span>
                          </td>
                          <td className="py-2 pr-4 font-mono text-xs text-muted-foreground max-w-[200px] truncate">
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
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            const ok = await confirm({
                              title: 'Restore Version',
                              description: `Restore route configuration to version ${v.version}? The current configuration will be saved as a new version.`,
                              confirmLabel: 'Restore',
                            })
                            if (ok) restoreVersion.mutate(v.id)
                          }}
                        >
                          Restore
                        </Button>
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
    </div>
  )
}

function CopyUrlButton({ path }: { path: string }) {
  const [copied, setCopied] = useState(false)
  const url = `${PROXY_BASE}${path}`

  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      title={`Copy: ${url}`}
      className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
      <span>{url}</span>
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

function InfoRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted-foreground flex-shrink-0">{label}</span>
      {typeof value === 'string' ? (
        <span className={`text-foreground text-right truncate max-w-[240px] ${mono ? 'font-mono text-xs' : ''}`}>
          {value}
        </span>
      ) : (
        <div className="flex justify-end">{value}</div>
      )}
    </div>
  )
}
