'use client'

import Link from 'next/link'
import {
  Route, Activity, AlertCircle, Plus, ScrollText, ArrowRight, Clock,
  Settings2, Eye, EyeOff, ChevronUp, ChevronDown, RotateCcw, X,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { StatsCard } from '@/components/dashboard/StatsCard'
import { RequestsChart } from '@/components/dashboard/RequestsChart'
import { SystemHealth } from '@/components/dashboard/SystemHealth'
import { RecentErrors } from '@/components/dashboard/RecentErrors'
import { useRoutes } from '@/hooks/useRoutes'
import { useLogs } from '@/hooks/useLogs'
import { useDashboardLayout, WidgetConfig } from '@/hooks/useDashboardLayout'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { RouteStatusBadge } from '@/components/routes/RouteStatusBadge'
import { HealthIndicator } from '@/components/routes/HealthIndicator'
import { formatRelativeTime, formatDuration, getStatusColor } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

function calcTrend(current: number, previous: number): { value: number; label: string } | undefined {
  if (previous === 0 && current === 0) return undefined
  if (previous === 0) return { value: 100, label: 'vs previous period' }
  const pct = Math.round(((current - previous) / previous) * 100)
  return { value: pct, label: 'vs previous period' }
}

function WidgetEditor({
  widgets,
  onToggle,
  onMove,
  onReset,
  onClose,
}: {
  widgets: WidgetConfig[]
  onToggle: (id: string) => void
  onMove: (id: string, dir: 'up' | 'down') => void
  onReset: () => void
  onClose: () => void
}) {
  return (
    <Card className="border-primary/30">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Settings2 className="w-4 h-4" />
          Customize Dashboard
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onReset} className="h-7 text-xs">
            <RotateCcw className="w-3 h-3 mr-1" />
            Reset
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {widgets.map((w, idx) => (
            <div
              key={w.id}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                w.visible ? 'bg-muted/30' : 'opacity-50'
              )}
            >
              <button
                onClick={() => onToggle(w.id)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {w.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </button>
              <span className={cn('flex-1 font-medium', !w.visible && 'line-through text-muted-foreground')}>
                {w.label}
              </span>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => onMove(w.id, 'up')}
                  disabled={idx === 0}
                  className="p-1 rounded hover:bg-muted disabled:opacity-30 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onMove(w.id, 'down')}
                  disabled={idx === widgets.length - 1}
                  className="p-1 rounded hover:bg-muted disabled:opacity-30 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export default function DashboardPage() {
  const { data: routesData, isLoading: routesLoading } = useRoutes({ pageSize: 100 })
  const { data: logsData, isLoading: logsLoading } = useLogs({ pageSize: 10 })

  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: () => api.analytics.dashboardSummary(7),
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  })

  const { data: dailyData } = useQuery({
    queryKey: ['logs-daily-dashboard'],
    queryFn: () => api.logs.getDaily(undefined, 7),
    staleTime: 60 * 1000,
  })

  const { widgets, editing, setEditing, toggleWidget, moveWidget, resetLayout } = useDashboardLayout()

  const routes = routesData?.data ?? []
  const logs = logsData?.data ?? []
  const summary = summaryData?.data

  const totalRoutes = routesData?.total ?? 0
  const publishedRoutes = routes.filter((r) => r.status === 'PUBLISHED' && r.isActive).length
  const healthyRoutes = routes.filter(r => r.isActive && r.healthChecks?.[0]?.status === 'HEALTHY').length
  const unhealthyRoutes = routes.filter(r => r.isActive && r.healthChecks?.[0]?.status === 'UNHEALTHY').length

  const dailyTotals = (dailyData?.data ?? []).map(d => d.total)
  const dailyErrors = (dailyData?.data ?? []).map(d => d.errors)

  const statsLoading = routesLoading || summaryLoading

  const isVisible = (id: string) => widgets.find((w) => w.id === id)?.visible ?? true

  const widgetRenderers: Record<string, () => React.ReactNode> = {
    stats: () => (
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
            return t ? { value: -t.value, label: t.label } : undefined
          })() : undefined}
          sparklineData={dailyErrors.length > 1 ? dailyErrors : undefined}
          sparklineColor="#ef4444"
          isLoading={statsLoading}
          colorClass="text-red-500 bg-red-500/10"
        />
      </div>
    ),

    'requests-chart': () => <RequestsChart />,

    'active-routes': () => (
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
    ),

    'system-health': () => (
      <SystemHealth healthyRoutes={healthyRoutes} unhealthyRoutes={unhealthyRoutes} />
    ),

    'recent-requests': () => (
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
                    <th className="pb-2 text-left font-medium hidden sm:table-cell">Path</th>
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
                      <td className="py-2 pr-4 text-muted-foreground font-mono text-xs max-w-[200px] truncate hidden sm:table-cell">
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
    ),

    'recent-errors': () => <RecentErrors />,
  }

  // Build the grid layout based on widget order
  // Group consecutive non-full widgets into a grid row
  const renderWidgets = () => {
    const visibleWidgets = widgets.filter((w) => w.visible)
    const elements: React.ReactNode[] = []
    let gridBuffer: { id: string; size: string }[] = []

    const flushGrid = () => {
      if (gridBuffer.length === 0) return
      const cols = gridBuffer.reduce((sum, w) => {
        if (w.size === 'sm') return sum + 1
        if (w.size === 'md') return sum + 2
        if (w.size === 'lg') return sum + 3
        return sum + 4
      }, 0)

      elements.push(
        <div key={`grid-${gridBuffer[0].id}`} className="grid grid-cols-1 gap-6 lg:grid-cols-4">
          {gridBuffer.map((item) => {
            const colSpan = item.size === 'sm' ? 'lg:col-span-1' : item.size === 'md' ? 'lg:col-span-2' : item.size === 'lg' ? 'lg:col-span-3' : 'lg:col-span-4'
            return (
              <div key={item.id} className={colSpan}>
                {widgetRenderers[item.id]?.()}
              </div>
            )
          })}
        </div>
      )
      gridBuffer = []
    }

    for (const w of visibleWidgets) {
      if (w.size === 'full') {
        flushGrid()
        elements.push(
          <div key={w.id}>{widgetRenderers[w.id]?.()}</div>
        )
      } else {
        gridBuffer.push(w)
        // Flush when accumulated cols reach 4
        const totalCols = gridBuffer.reduce((sum, item) => {
          if (item.size === 'sm') return sum + 1
          if (item.size === 'md') return sum + 2
          if (item.size === 'lg') return sum + 3
          return sum + 4
        }, 0)
        if (totalCols >= 4) flushGrid()
      }
    }
    flushGrid()

    return elements
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Overview of your routing gateway
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditing(!editing)}
            className={cn(editing && 'border-primary text-primary')}
          >
            <Settings2 className="w-4 h-4 mr-2" />
            {editing ? 'Done' : 'Customize'}
          </Button>
          <Button asChild>
            <Link href="/routes/new">
              <Plus className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">New Route</span>
              <span className="sm:hidden">New</span>
            </Link>
          </Button>
        </div>
      </div>

      {/* Widget Editor */}
      {editing && (
        <WidgetEditor
          widgets={widgets}
          onToggle={toggleWidget}
          onMove={moveWidget}
          onReset={resetLayout}
          onClose={() => setEditing(false)}
        />
      )}

      {/* Widgets */}
      {renderWidgets()}
    </div>
  )
}
