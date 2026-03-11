'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  BarChart3,
  Clock,
  AlertTriangle,
  Activity,
  Gauge,
  TrendingUp,
} from 'lucide-react'
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useRoutes } from '@/hooks/useRoutes'
import {
  useAnalyticsOverview,
  useLatencyTrend,
  useErrorTrend,
  useTrafficHeatmap,
  useSlowestRoutes,
  useStatusDistribution,
} from '@/hooks/useAnalytics'
import { cn } from '@/lib/utils'

const PERIOD_OPTIONS = [
  { value: '7', label: '7 days' },
  { value: '14', label: '14 days' },
  { value: '30', label: '30 days' },
]

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) =>
  i.toString().padStart(2, '0')
)

const STATUS_COLORS: Record<string, string> = {
  '2xx': '#22c55e',
  '3xx': '#3b82f6',
  '4xx': '#f59e0b',
  '5xx': '#ef4444',
  unknown: '#6b7280',
}

function formatTimestamp(ts: string, granularity?: string) {
  const d = new Date(ts)
  if (granularity === 'day') {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatMs(ms: number) {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`
  return `${ms}ms`
}

export default function AnalyticsPage() {
  const [routeId, setRouteId] = useState<string | undefined>(undefined)
  const [days, setDays] = useState(7)

  const granularity = days > 14 ? 'day' : 'hour'

  const { data: routesData } = useRoutes({ pageSize: 200 })
  const routes = routesData?.data ?? []

  const { data: overviewData, isLoading: overviewLoading } =
    useAnalyticsOverview(routeId, days)
  const { data: latencyData, isLoading: latencyLoading } = useLatencyTrend(
    routeId,
    days,
    granularity as 'hour' | 'day'
  )
  const { data: errorData, isLoading: errorLoading } = useErrorTrend(
    routeId,
    days
  )
  const { data: heatmapData, isLoading: heatmapLoading } = useTrafficHeatmap(
    routeId,
    days > 14 ? days : 28
  )
  const { data: slowestData, isLoading: slowestLoading } = useSlowestRoutes(10)
  const { data: statusData, isLoading: statusLoading } = useStatusDistribution(
    routeId,
    days
  )

  const overview = overviewData?.data
  const latencyTrend = latencyData?.data ?? []
  const errorTrend = errorData?.data ?? []
  const heatmapCells = heatmapData?.data ?? []
  const slowestRoutes = slowestData?.data ?? []
  const statusDist = statusData?.data ?? []

  // Compute max for heatmap color scale
  const heatmapMax = useMemo(() => {
    if (heatmapCells.length === 0) return 1
    return Math.max(...heatmapCells.map((c) => c.count), 1)
  }, [heatmapCells])

  function getHeatmapColor(count: number): string {
    if (count === 0) return 'bg-muted/30'
    const intensity = count / heatmapMax
    if (intensity < 0.25) return 'bg-emerald-500/20'
    if (intensity < 0.5) return 'bg-emerald-500/40'
    if (intensity < 0.75) return 'bg-emerald-500/60'
    return 'bg-emerald-500/80'
  }

  // Format latency trend chart data
  const latencyChartData = latencyTrend.map((p) => ({
    ...p,
    label: formatTimestamp(p.timestamp, granularity),
  }))

  // Format error trend chart data
  const errorChartData = errorTrend.map((p) => ({
    ...p,
    label: formatTimestamp(p.timestamp),
  }))

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Route performance metrics and traffic patterns
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select
            value={routeId ?? 'all'}
            onValueChange={(v) => setRouteId(v === 'all' ? undefined : v)}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All routes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All routes</SelectItem>
              {routes.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={String(days)}
            onValueChange={(v) => setDays(parseInt(v, 10))}
          >
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <OverviewCard
          title="Total Requests"
          value={overview?.totalRequests.toLocaleString()}
          icon={Activity}
          isLoading={overviewLoading}
          colorClass="text-blue-500 bg-blue-500/10"
        />
        <OverviewCard
          title="Avg Latency"
          value={overview ? formatMs(overview.avgResponseTime) : undefined}
          icon={Clock}
          isLoading={overviewLoading}
          colorClass="text-purple-500 bg-purple-500/10"
        />
        <OverviewCard
          title="Error Rate"
          value={overview ? `${overview.errorRate}%` : undefined}
          icon={AlertTriangle}
          isLoading={overviewLoading}
          colorClass="text-amber-500 bg-amber-500/10"
        />
        <OverviewCard
          title="P95 Latency"
          value={overview ? formatMs(overview.p95) : undefined}
          icon={Gauge}
          isLoading={overviewLoading}
          colorClass="text-red-500 bg-red-500/10"
        />
      </div>

      {/* Latency Trend + Error Rate Trend */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Latency Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Latency Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            {latencyLoading ? (
              <Skeleton className="h-[300px] w-full rounded-lg" />
            ) : latencyChartData.length === 0 ? (
              <EmptyChart message="No latency data available" />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={latencyChartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11 }}
                    className="text-muted-foreground"
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    className="text-muted-foreground"
                    tickFormatter={(v) => formatMs(v)}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                    formatter={(value: number, name: string) => [
                      formatMs(value),
                      name.toUpperCase(),
                    ]}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="p50"
                    stroke="#22c55e"
                    strokeWidth={2}
                    dot={false}
                    name="p50"
                  />
                  <Line
                    type="monotone"
                    dataKey="p95"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={false}
                    name="p95"
                  />
                  <Line
                    type="monotone"
                    dataKey="p99"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={false}
                    name="p99"
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Error Rate Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Error Rate Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            {errorLoading ? (
              <Skeleton className="h-[300px] w-full rounded-lg" />
            ) : errorChartData.length === 0 ? (
              <EmptyChart message="No error data available" />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={errorChartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11 }}
                    className="text-muted-foreground"
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    className="text-muted-foreground"
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                    formatter={(value: number, name: string) => {
                      if (name === 'errorRate') return [`${value}%`, 'Error Rate']
                      return [value, name]
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="errorRate"
                    stroke="#ef4444"
                    fill="#ef4444"
                    fillOpacity={0.15}
                    strokeWidth={2}
                    name="errorRate"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Traffic Heatmap */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Traffic Heatmap
          </CardTitle>
        </CardHeader>
        <CardContent>
          {heatmapLoading ? (
            <Skeleton className="h-[220px] w-full rounded-lg" />
          ) : heatmapCells.length === 0 ? (
            <EmptyChart message="No traffic data available" />
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[700px]">
                {/* Hour labels */}
                <div className="flex items-center mb-1">
                  <div className="w-10 flex-shrink-0" />
                  {HOUR_LABELS.map((h) => (
                    <div
                      key={h}
                      className="flex-1 text-center text-[10px] text-muted-foreground"
                    >
                      {parseInt(h) % 3 === 0 ? h : ''}
                    </div>
                  ))}
                </div>
                {/* Grid rows */}
                {DAY_LABELS.map((dayLabel, dayIdx) => (
                  <div key={dayLabel} className="flex items-center gap-0.5 mb-0.5">
                    <div className="w-10 flex-shrink-0 text-xs text-muted-foreground text-right pr-2">
                      {dayLabel}
                    </div>
                    {HOUR_LABELS.map((_, hourIdx) => {
                      const cell = heatmapCells.find(
                        (c) => c.dayOfWeek === dayIdx && c.hour === hourIdx
                      )
                      const count = cell?.count ?? 0
                      return (
                        <div
                          key={hourIdx}
                          className={cn(
                            'flex-1 aspect-square rounded-sm transition-colors',
                            getHeatmapColor(count)
                          )}
                          title={`${dayLabel} ${HOUR_LABELS[hourIdx]}:00 - ${count.toLocaleString()} requests`}
                        />
                      )
                    })}
                  </div>
                ))}
                {/* Legend */}
                <div className="flex items-center justify-end gap-1.5 mt-3 text-[10px] text-muted-foreground">
                  <span>Less</span>
                  <div className="w-3 h-3 rounded-sm bg-muted/30" />
                  <div className="w-3 h-3 rounded-sm bg-emerald-500/20" />
                  <div className="w-3 h-3 rounded-sm bg-emerald-500/40" />
                  <div className="w-3 h-3 rounded-sm bg-emerald-500/60" />
                  <div className="w-3 h-3 rounded-sm bg-emerald-500/80" />
                  <span>More</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Slowest Routes + Status Distribution */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Slowest Routes */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Slowest Routes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {slowestLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : slowestRoutes.length === 0 ? (
              <EmptyChart message="No route performance data available" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 text-xs text-muted-foreground">
                      <th className="pb-2 text-left font-medium">Route</th>
                      <th className="pb-2 text-right font-medium">Avg</th>
                      <th className="pb-2 text-right font-medium">P95</th>
                      <th className="pb-2 text-right font-medium">Requests</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {slowestRoutes.map((route) => (
                      <tr
                        key={route.routeId}
                        className="hover:bg-muted/30 transition-colors"
                      >
                        <td className="py-2 pr-4">
                          <Link
                            href={`/routes/${route.routeId}`}
                            className="hover:text-primary transition-colors"
                          >
                            <p className="font-medium text-foreground truncate max-w-[200px]">
                              {route.routeName}
                            </p>
                            <p className="text-xs text-muted-foreground font-mono truncate max-w-[200px]">
                              {route.publicPath}
                            </p>
                          </Link>
                        </td>
                        <td className="py-2 pr-4 text-right text-muted-foreground whitespace-nowrap">
                          {formatMs(route.avgDuration)}
                        </td>
                        <td className="py-2 pr-4 text-right whitespace-nowrap">
                          <span
                            className={cn(
                              'font-medium',
                              route.p95Duration > 2000
                                ? 'text-red-500'
                                : route.p95Duration > 1000
                                  ? 'text-amber-500'
                                  : 'text-green-500'
                            )}
                          >
                            {formatMs(route.p95Duration)}
                          </span>
                        </td>
                        <td className="py-2 text-right text-muted-foreground">
                          {route.requestCount.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Status Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statusLoading ? (
              <Skeleton className="h-[300px] w-full rounded-lg" />
            ) : statusDist.length === 0 ? (
              <EmptyChart message="No status code data available" />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={statusDist}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                  <XAxis
                    dataKey="bucket"
                    tick={{ fontSize: 12 }}
                    className="text-muted-foreground"
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    className="text-muted-foreground"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                    formatter={(value: number) => [
                      value.toLocaleString(),
                      'Requests',
                    ]}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {statusDist.map((entry) => (
                      <Cell
                        key={entry.bucket}
                        fill={STATUS_COLORS[entry.bucket] ?? STATUS_COLORS.unknown}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ============================================================================
// Sub-components
// ============================================================================

function OverviewCard({
  title,
  value,
  icon: Icon,
  isLoading,
  colorClass,
}: {
  title: string
  value?: string
  icon: typeof Activity
  isLoading: boolean
  colorClass: string
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            {isLoading ? (
              <Skeleton className="h-8 w-24 mt-1" />
            ) : (
              <p className="text-2xl font-bold text-foreground mt-1">
                {value ?? '--'}
              </p>
            )}
          </div>
          <div className={cn('p-3 rounded-lg', colorClass)}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-[300px] text-sm text-muted-foreground">
      <div className="text-center">
        <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>{message}</p>
      </div>
    </div>
  )
}
