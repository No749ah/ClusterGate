'use client'

import Link from 'next/link'
import { Route, Activity, CheckCircle2, AlertCircle, Plus, ScrollText, ArrowRight, Clock } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { StatsCard } from '@/components/dashboard/StatsCard'
import { RequestsChart } from '@/components/dashboard/RequestsChart'
import { SystemHealth } from '@/components/dashboard/SystemHealth'
import { useRoutes } from '@/hooks/useRoutes'
import { useLogs, useRecentErrors } from '@/hooks/useLogs'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { RouteStatusBadge } from '@/components/routes/RouteStatusBadge'
import { HealthIndicator } from '@/components/routes/HealthIndicator'
import { formatRelativeTime, formatDuration, getStatusColor } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

function calcTrend(current: number, previous: number): { value: number; label: string } | undefined {
  if (previous === 0 && current === 0) return undefined
  if (previous === 0) return { value: 100, label: 'vs previous period' }
  const pct = Math.round(((current - previous) / previous) * 100)
  return { value: pct, label: 'vs previous period' }
}

export default function DashboardPage() {
  const { data: routesData, isLoading: routesLoading } = useRoutes({ pageSize: 100 })
  const { data: logsData, isLoading: logsLoading } = useLogs({ pageSize: 10 })
  const { data: errorsData } = useRecentErrors(undefined, 5)

  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: () => api.analytics.dashboardSummary(7),
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  })

  // Daily data for sparklines
  const { data: dailyData } = useQuery({
    queryKey: ['logs-daily-dashboard'],
    queryFn: () => api.logs.getDaily(undefined, 7),
    staleTime: 60 * 1000,
  })

  const routes = routesData?.data ?? []
  const logs = logsData?.data ?? []
  const recentErrors = errorsData?.data ?? []
  const summary = summaryData?.data

  const totalRoutes = routesData?.total ?? 0
  const publishedRoutes = routes.filter((r) => r.status === 'PUBLISHED' && r.isActive).length
  const healthyRoutes = routes.filter(r => r.isActive && r.healthChecks?.[0]?.status === 'HEALTHY').length
  const unhealthyRoutes = routes.filter(r => r.isActive && r.healthChecks?.[0]?.status === 'UNHEALTHY').length

  const dailyTotals = (dailyData?.data ?? []).map(d => d.total)
  const dailyErrors = (dailyData?.data ?? []).map(d => d.errors)

  const statsLoading = routesLoading || summaryLoading

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Overview of your routing gateway
          </p>
        </div>
        <Button asChild>
          <Link href="/routes/new">
            <Plus className="w-4 h-4 mr-2" />
            New Route
          </Link>
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total Routes"
          value={totalRoutes}
          description={`${publishedRoutes} active`}
          icon={Route}
          isLoading={statsLoading}
          colorClass="text-blue-500 bg-blue-500/10"
        />
        <StatsCard
          title="Total Requests"
          value={summary?.totalRequests?.toLocaleString() ?? '—'}
          description="Last 7 days"
          icon={Activity}
          trend={summary ? calcTrend(summary.totalRequests, summary.previousTotalRequests) : undefined}
          sparklineData={dailyTotals.length > 1 ? dailyTotals : undefined}
          sparklineColor="#8b5cf6"
          isLoading={statsLoading}
          colorClass="text-purple-500 bg-purple-500/10"
        />
        <StatsCard
          title="Avg Response Time"
          value={summary ? `${summary.avgResponseTime}ms` : '—'}
          description="Last 7 days"
          icon={Clock}
          trend={summary ? (() => {
            const t = calcTrend(summary.avgResponseTime, summary.previousAvgResponseTime)
            // For response time, lower is better — invert the color
            return t ? { value: -t.value, label: t.label } : undefined
          })() : undefined}
          isLoading={statsLoading}
          colorClass="text-amber-500 bg-amber-500/10"
        />
        <StatsCard
          title="Error Rate"
          value={summary ? `${summary.errorRate}%` : '—'}
          description="Last 7 days"
          icon={AlertCircle}
          trend={summary ? (() => {
            const t = calcTrend(summary.errorRate, summary.previousErrorRate)
            // For error rate, lower is better — invert the color
            return t ? { value: -t.value, label: t.label } : undefined
          })() : undefined}
          sparklineData={dailyErrors.length > 1 ? dailyErrors : undefined}
          sparklineColor="#ef4444"
          isLoading={statsLoading}
          colorClass="text-red-500 bg-red-500/10"
        />
      </div>

      {/* Charts + Recent Activity */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <RequestsChart />
        </div>

        {/* Recent Routes */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Active Routes</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/routes">
                View all <ArrowRight className="w-3 h-3 ml-1" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {routesLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))
            ) : routes.length === 0 ? (
              <div className="text-center py-8">
                <Route className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No routes yet</p>
                <Button size="sm" variant="outline" className="mt-3" asChild>
                  <Link href="/routes/new">Create first route</Link>
                </Button>
              </div>
            ) : (
              routes.slice(0, 5).map((route) => (
                <Link
                  key={route.id}
                  href={`/routes/${route.id}`}
                  className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors group"
                >
                  <HealthIndicator
                    status={route.healthChecks?.[0]?.status}
                    responseTime={route.healthChecks?.[0]?.responseTime}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                      {route.name}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {route.publicPath}
                    </p>
                  </div>
                  <RouteStatusBadge status={route.status} isActive={route.isActive} />
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <SystemHealth healthyRoutes={healthyRoutes} unhealthyRoutes={unhealthyRoutes} />
      </div>

      {/* Recent Request Logs */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent Requests</CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/activity">
              View all <ArrowRight className="w-3 h-3 ml-1" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8">
              <ScrollText className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No requests yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 text-xs text-muted-foreground">
                    <th className="pb-2 text-left font-medium">Time</th>
                    <th className="pb-2 text-left font-medium">Route</th>
                    <th className="pb-2 text-left font-medium">Method</th>
                    <th className="pb-2 text-left font-medium">Path</th>
                    <th className="pb-2 text-left font-medium">Status</th>
                    <th className="pb-2 text-right font-medium">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap">
                        {formatRelativeTime(log.createdAt)}
                      </td>
                      <td className="py-2 pr-4 text-foreground max-w-[150px] truncate">
                        {log.route?.name ?? '—'}
                      </td>
                      <td className="py-2 pr-4">
                        <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                          {log.method}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground font-mono text-xs max-w-[200px] truncate">
                        {log.path}
                      </td>
                      <td className="py-2 pr-4">
                        <span className={`font-medium ${getStatusColor(log.responseStatus)}`}>
                          {log.responseStatus ?? 'ERR'}
                        </span>
                      </td>
                      <td className="py-2 text-right text-muted-foreground">
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
    </div>
  )
}
