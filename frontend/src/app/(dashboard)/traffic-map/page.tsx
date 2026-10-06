'use client'

import { useState, useEffect, useRef } from 'react'
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

interface LiveEvent {
  id: string
  geoLatitude: number | null
  geoLongitude: number | null
  geoCountry: string | null
  responseStatus: number | null
}

interface LiveDot {
  lat: number
  lng: number
  born: number
  status: number | null
}

type LiveState = 'connecting' | 'live' | 'offline'

const LIVE_STATE: Record<LiveState, { label: string; text: string; dot: string }> = {
  live: { label: 'Live', text: 'text-green-400', dot: 'bg-green-400 animate-pulse' },
  connecting: { label: 'Connecting…', text: 'text-amber-400', dot: 'bg-amber-400' },
  offline: { label: 'Offline', text: 'text-red-400', dot: 'bg-red-400' },
}

// How long a live request pulses on the map.
const DOT_LIFETIME_MS = 2000
const MAX_LIVE_DOTS = 300
// The live stream re-sends a short window on every tick; ids already shown are skipped.
const SEEN_IDS_LIMIT = 1000
const RECONNECT_DELAY_MS = 5000
const MAP_HEIGHT = 450

export default function TrafficMapPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hours, setHours] = useState('24')
  const [liveState, setLiveState] = useState<LiveState>('connecting')
  // Live dots and canvas size live in refs: the animation loop reads and
  // updates them every frame without re-rendering the page.
  const liveDotsRef = useRef<LiveDot[]>([])
  const sizeRef = useRef({ width: 0, height: 0 })

  const { data: mapData } = useQuery({
    queryKey: ['traffic-map', hours],
    queryFn: () => api.traffic.map(parseInt(hours)),
    refetchInterval: 30000,
  })

  const traffic = mapData?.data

  // SSE live traffic connection
  useEffect(() => {
    let es: EventSource | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined
    let disposed = false
    const seen = new Set<string>()

    const connect = () => {
      if (disposed) return
      setLiveState('connecting')
      // Built per connection so a reconnect picks up a refreshed client token.
      es = new EventSource(api.traffic.liveUrl(), { withCredentials: true })

      es.onopen = () => setLiveState('live')

      es.onmessage = (event) => {
        let logs: LiveEvent[]
        try {
          logs = JSON.parse(event.data)
        } catch {
          return
        }
        const now = performance.now()
        for (const l of logs) {
          if (seen.has(l.id)) continue
          seen.add(l.id)
          if (l.geoLatitude == null || l.geoLongitude == null) continue
          liveDotsRef.current.push({ lat: l.geoLatitude, lng: l.geoLongitude, born: now, status: l.responseStatus })
        }
        if (liveDotsRef.current.length > MAX_LIVE_DOTS) {
          liveDotsRef.current = liveDotsRef.current.slice(-MAX_LIVE_DOTS)
        }
        if (seen.size > SEEN_IDS_LIMIT) {
          // Sets iterate in insertion order: drop the oldest ids.
          const drop = seen.size - SEEN_IDS_LIMIT
          let i = 0
          for (const id of seen) {
            if (i++ >= drop) break
            seen.delete(id)
          }
        }
      }

      es.onerror = () => {
        // EventSource retries network errors itself, but gives up for good on
        // an HTTP error (e.g. an expired client token). Reconnect in that case.
        if (es?.readyState === EventSource.CLOSED) {
          setLiveState('offline')
          es.close()
          reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS)
        } else {
          setLiveState('connecting')
        }
      }
    }

    connect()
    return () => {
      disposed = true
      clearTimeout(reconnectTimer)
      es?.close()
    }
  }, [])

  // Store traffic in a ref so the animation loop always sees current data
  const trafficRef = useRef(traffic)
  trafficRef.current = traffic

  // Canvas animation loop
  useEffect(() => {
    let running = true
    let frame = 0

    const drawMap = () => {
      if (!running) return
      frame = requestAnimationFrame(drawMap)
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      const { width, height } = sizeRef.current
      if (!canvas || !ctx || width === 0 || height === 0) return

      const dpr = canvas.width / width
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

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

      // Simple region markers for visual reference
      const landmarks = [
        { lat: 48, lng: 10, label: 'EU' }, { lat: 40, lng: -100, label: 'US' },
        { lat: 35, lng: 105, label: 'CN' }, { lat: -25, lng: 135, label: 'AU' },
        { lat: 20, lng: 78, label: 'IN' }, { lat: -15, lng: -50, label: 'BR' },
        { lat: 35, lng: 140, label: 'JP' }, { lat: 5, lng: 25, label: 'AF' },
      ]
      for (const lm of landmarks) {
        const [x, y] = project(lm.lat, lm.lng, width, height)
        ctx.fillStyle = 'rgba(59, 130, 246, 0.04)'
        ctx.beginPath()
        ctx.arc(x, y, 30, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = 'rgba(59, 130, 246, 0.12)'
        ctx.font = '9px sans-serif'
        ctx.fillText(lm.label, x - 6, y + 3)
      }

      // Draw static traffic hotspots from historical data
      const currentTraffic = trafficRef.current
      if (currentTraffic?.countries) {
        const maxCount = Math.max(...currentTraffic.countries.map((c: TrafficCountry) => c.count), 1)
        for (const c of currentTraffic.countries) {
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
      const now = performance.now()
      const dots = liveDotsRef.current.filter((d) => now - d.born < DOT_LIFETIME_MS)
      liveDotsRef.current = dots
      for (const dot of dots) {
        const progress = Math.max(0, (now - dot.born) / DOT_LIFETIME_MS)
        const alpha = 1 - progress
        const size = 3 + progress * 12
        const [x, y] = project(dot.lat, dot.lng, width, height)

        const isError = dot.status != null && dot.status >= 400
        const color = isError ? `rgba(239, 68, 68, ${alpha})` : `rgba(34, 197, 94, ${alpha})`

        ctx.strokeStyle = color
        ctx.lineWidth = 2 * alpha
        ctx.beginPath()
        ctx.arc(x, y, size, 0, Math.PI * 2)
        ctx.stroke()

        if (progress < 0.5) {
          ctx.fillStyle = color
          ctx.beginPath()
          ctx.arc(x, y, 2, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // Show "no geo data" message on canvas when there are requests but no countries
      if (currentTraffic && currentTraffic.total > 0 && (!currentTraffic.countries || currentTraffic.countries.length === 0)) {
        ctx.fillStyle = 'rgba(148, 163, 184, 0.5)'
        ctx.font = '14px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('No geographic data available', width / 2, height / 2 - 10)
        ctx.font = '11px sans-serif'
        ctx.fillStyle = 'rgba(148, 163, 184, 0.3)'
        ctx.fillText('Requests from private/internal IPs cannot be geolocated', width / 2, height / 2 + 12)
        ctx.textAlign = 'start'
      }
    }

    frame = requestAnimationFrame(drawMap)
    return () => { running = false; cancelAnimationFrame(frame) }
  }, [])

  // Size the canvas to its container. A ResizeObserver also catches layout
  // changes without a window resize (e.g. collapsing the sidebar).
  useEffect(() => {
    const canvas = canvasRef.current
    const container = canvas?.parentElement
    if (!canvas || !container) return
    const resize = () => {
      // Height stays fixed: deriving it from the container would feed the
      // canvas size back into the observed element and grow without bound.
      const width = container.clientWidth
      const height = MAP_HEIGHT
      const dpr = window.devicePixelRatio || 1
      sizeRef.current = { width, height }
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      canvas.style.height = `${height}px`
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    return () => observer.disconnect()
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
          <div className={`flex items-center gap-1.5 text-xs ${LIVE_STATE[liveState].text}`}>
            <span className={`w-2 h-2 rounded-full ${LIVE_STATE[liveState].dot}`} />
            {LIVE_STATE[liveState].label}
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
