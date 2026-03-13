'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { TrafficCountry, TrafficCity } from '@/types'
import {
  Globe,
  Activity,
  Clock,
  Zap,
  MapPin,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// Mercator projection: lat/lng → canvas x/y
function project(lat: number, lng: number, width: number, height: number): [number, number] {
  const x = ((lng + 180) / 360) * width
  const latRad = (lat * Math.PI) / 180
  const mercY = Math.log(Math.tan(Math.PI / 4 + latRad / 2))
  const y = height / 2 - (mercY / Math.PI) * (height / 2)
  return [x, Math.max(0, Math.min(height, y))]
}

interface LiveDot {
  x: number
  y: number
  age: number
  status: number | null
  country: string
}

export default function TrafficMapPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hours, setHours] = useState('24')
  const [liveDots, setLiveDots] = useState<LiveDot[]>([])
  const animFrameRef = useRef<number>(0)

  const { data: mapData } = useQuery({
    queryKey: ['traffic-map', hours],
    queryFn: () => api.traffic.map(parseInt(hours)),
    refetchInterval: 30000,
  })

  const traffic = mapData?.data

  // SSE live traffic connection
  useEffect(() => {
    const url = api.traffic.liveUrl()
    const es = new EventSource(url, { withCredentials: true })

    es.onmessage = (event) => {
      try {
        const logs = JSON.parse(event.data) as any[]
        const canvas = canvasRef.current
        if (!canvas) return
        const { width, height } = canvas

        const newDots = logs
          .filter((l) => l.geoLatitude && l.geoLongitude)
          .map((l) => {
            const [x, y] = project(l.geoLatitude, l.geoLongitude, width, height)
            return {
              x, y,
              age: 0,
              status: l.responseStatus,
              country: l.geoCountry || '??',
            }
          })

        if (newDots.length > 0) {
          setLiveDots((prev) => [...prev.slice(-200), ...newDots])
        }
      } catch {}
    }

    return () => es.close()
  }, [])

  // Canvas animation loop
  const drawMap = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { width, height } = canvas

    // Dark background
    ctx.fillStyle = '#0a0f1a'
    ctx.fillRect(0, 0, width, height)

    // Draw grid lines
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.06)'
    ctx.lineWidth = 1
    for (let lat = -60; lat <= 80; lat += 30) {
      const [, y] = project(lat, 0, width, height)
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
      ctx.stroke()
    }
    for (let lng = -180; lng <= 180; lng += 40) {
      const [x] = project(0, lng, width, height)
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
      ctx.stroke()
    }

    // Draw static traffic hotspots from historical data
    if (traffic?.countries) {
      const maxCount = Math.max(...traffic.countries.map((c) => c.count), 1)
      for (const c of traffic.countries) {
        const [x, y] = project(c.lat, c.lng, width, height)
        const size = 4 + (c.count / maxCount) * 20
        const alpha = 0.15 + (c.count / maxCount) * 0.4

        // Glow
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, size * 2)
        gradient.addColorStop(0, `rgba(59, 130, 246, ${alpha})`)
        gradient.addColorStop(1, 'rgba(59, 130, 246, 0)')
        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(x, y, size * 2, 0, Math.PI * 2)
        ctx.fill()

        // Center dot
        ctx.fillStyle = `rgba(96, 165, 250, ${alpha + 0.2})`
        ctx.beginPath()
        ctx.arc(x, y, size / 2, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // Draw live dots with pulse animation
    const now = Date.now()
    setLiveDots((prev) => {
      const updated = prev.map((d) => ({ ...d, age: d.age + 1 })).filter((d) => d.age < 60) // ~2s lifetime at 30fps
      for (const dot of updated) {
        const progress = dot.age / 60
        const alpha = 1 - progress
        const size = 3 + progress * 12

        const isError = dot.status && dot.status >= 400
        const color = isError ? `rgba(239, 68, 68, ${alpha})` : `rgba(34, 197, 94, ${alpha})`

        // Expanding ring
        ctx.strokeStyle = color
        ctx.lineWidth = 2 * alpha
        ctx.beginPath()
        ctx.arc(dot.x, dot.y, size, 0, Math.PI * 2)
        ctx.stroke()

        // Center point
        if (progress < 0.5) {
          ctx.fillStyle = color
          ctx.beginPath()
          ctx.arc(dot.x, dot.y, 2, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      return updated
    })

    animFrameRef.current = requestAnimationFrame(drawMap)
  }, [traffic])

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(drawMap)
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [drawMap])

  // Resize canvas to container
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.parentElement?.getBoundingClientRect()
      if (rect) {
        canvas.width = rect.width
        canvas.height = Math.max(400, rect.height)
      }
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const topCountries = (traffic?.countries || []).slice(0, 10)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Globe className="w-6 h-6" /> Live Traffic Map
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time geographic visualization of proxy traffic
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-green-400">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            Live
          </div>
          <Select value={hours} onValueChange={setHours}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Last 1h</SelectItem>
              <SelectItem value="6">Last 6h</SelectItem>
              <SelectItem value="24">Last 24h</SelectItem>
              <SelectItem value="168">Last 7d</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Map Canvas */}
      <div className="rounded-lg border border-border overflow-hidden relative" style={{ minHeight: 450 }}>
        <canvas
          ref={canvasRef}
          className="w-full"
          style={{ display: 'block', minHeight: 450 }}
        />
        {/* Overlay stats */}
        <div className="absolute top-3 left-3 flex gap-2 flex-wrap">
          <Badge variant="outline" className="bg-background/80 backdrop-blur-sm text-xs">
            <Activity className="w-3 h-3 mr-1" />
            {traffic?.total?.toLocaleString() || 0} requests
          </Badge>
          <Badge variant="outline" className="bg-background/80 backdrop-blur-sm text-xs">
            <MapPin className="w-3 h-3 mr-1" />
            {traffic?.countries?.length || 0} countries
          </Badge>
        </div>
        {/* Legend */}
        <div className="absolute bottom-3 right-3 flex gap-3 text-xs bg-background/80 backdrop-blur-sm rounded-md px-3 py-1.5 border border-border/50">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-500" /> Success
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500" /> Error
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500/30 border border-blue-400/40" /> Hotspot
          </span>
        </div>
      </div>

      {/* Top Countries */}
      {topCountries.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
              <Globe className="w-4 h-4" /> Top Countries
            </h3>
            <div className="space-y-2">
              {topCountries.map((c, i) => {
                const pct = traffic ? (c.count / traffic.total) * 100 : 0
                return (
                  <div key={c.country} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-5">{i + 1}</span>
                    <span className="text-sm font-medium w-8">{c.country}</span>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${Math.max(2, pct)}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground w-20 text-right">
                      {c.count.toLocaleString()} ({pct.toFixed(1)}%)
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
              <Zap className="w-4 h-4" /> Performance by Region
            </h3>
            <div className="space-y-2">
              {topCountries.map((c) => (
                <div key={c.country} className="flex items-center justify-between">
                  <span className="text-sm font-medium">{c.country}</span>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {c.avgDuration}ms avg
                    </span>
                    <span>{c.count.toLocaleString()} req</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
