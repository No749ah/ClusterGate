'use client'

import { useState, useEffect } from 'react'
import { Activity, Database, Clock, Server, Wifi, WifiOff } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/lib/api'

interface SystemHealthProps {
  healthyRoutes: number
  unhealthyRoutes: number
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h ${mins}m`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}

export function SystemHealth({ healthyRoutes, unhealthyRoutes }: SystemHealthProps) {
  const { user } = useAuth()
  const [health, setHealth] = useState<{
    status: string
    uptime: number
    database: { status: string; latency: number }
    memory: { heapUsed: number; heapTotal: number; rss: number }
  } | null>(null)

  useEffect(() => {
    if (user?.role !== 'ADMIN') return

    const fetch = () => {
      api.health.status().then(setHealth).catch(() => {})
    }
    fetch()
    const interval = setInterval(fetch, 30000)
    return () => clearInterval(interval)
  }, [user?.role])

  if (user?.role !== 'ADMIN' || !health) return null

  const isHealthy = health.status === 'healthy'
  const memPercent = health.memory.heapTotal > 0
    ? Math.round((health.memory.heapUsed / health.memory.heapTotal) * 100)
    : 0

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Server className="w-4 h-4" />
          System Health
          <span className={`ml-auto inline-flex items-center gap-1.5 text-xs font-normal ${isHealthy ? 'text-emerald-500' : 'text-amber-500'}`}>
            <span className={`w-2 h-2 rounded-full ${isHealthy ? 'bg-emerald-500' : 'bg-amber-500'} animate-pulse`} />
            {isHealthy ? 'Healthy' : 'Degraded'}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Route Health */}
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2 text-muted-foreground">
            <Activity className="w-3.5 h-3.5" />
            Routes
          </span>
          <span className="font-medium">
            <span className="text-emerald-500">{healthyRoutes}</span>
            {unhealthyRoutes > 0 && (
              <> / <span className="text-red-500">{unhealthyRoutes} down</span></>
            )}
          </span>
        </div>

        {/* DB Latency */}
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2 text-muted-foreground">
            <Database className="w-3.5 h-3.5" />
            Database
          </span>
          <span className="font-medium">
            {health.database.status === 'ok' ? (
              <span className="text-emerald-500">{health.database.latency}ms</span>
            ) : (
              <span className="text-red-500">Offline</span>
            )}
          </span>
        </div>

        {/* Memory */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-muted-foreground">
              <Server className="w-3.5 h-3.5" />
              Memory
            </span>
            <span className="font-medium text-xs">
              {health.memory.heapUsed} / {health.memory.heapTotal} MB ({memPercent}%)
            </span>
          </div>
          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${memPercent > 85 ? 'bg-red-500' : memPercent > 60 ? 'bg-amber-500' : 'bg-emerald-500'}`}
              style={{ width: `${Math.min(memPercent, 100)}%` }}
            />
          </div>
        </div>

        {/* Uptime */}
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2 text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            Uptime
          </span>
          <span className="font-medium">{formatUptime(health.uptime)}</span>
        </div>
      </CardContent>
    </Card>
  )
}
