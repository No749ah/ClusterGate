'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, ArrowLeft, ArrowRight, Compass } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { routeUrl } from '@/lib/urls'

const MESSAGES = [
  'This page went on vacation.',
  'Looks like this route took a wrong turn.',
  'The packets arrived, but no one was home.',
  '404: Gateway to nowhere.',
  'Even our proxy can\'t find this one.',
  'This page is playing hide and seek. It\'s winning.',
  'You\'ve reached the edge of the cluster.',
  'Route not found. Have you tried /r/?',
]

type Suggestion = { href: string; label: string; hint: string }

// Levenshtein distance — used for "did you mean…" fuzzy match.
function distance(a: string, b: string): number {
  if (a === b) return 0
  const m = a.length, n = b.length
  if (m === 0 || n === 0) return Math.max(m, n)
  const dp = new Array(n + 1).fill(0).map((_, i) => i)
  for (let i = 1; i <= m; i++) {
    let prev = i - 1
    dp[0] = i
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j]
      dp[j] = a[i - 1] === b[j - 1]
        ? prev
        : Math.min(prev, dp[j], dp[j - 1]) + 1
      prev = tmp
    }
  }
  return dp[n]
}

export default function NotFound() {
  const [message, setMessage] = useState('')
  const [glitch, setGlitch] = useState(false)
  const pathname = usePathname() ?? '/'
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])

  // Fuzzy-match the bad URL against known routes / top-level pages.
  useEffect(() => {
    const segments = pathname.split('/').filter(Boolean)
    const last = segments[segments.length - 1] || ''
    if (!last || last.length < 2) return

    const collected: Suggestion[] = []

    // Match against route slugs/publicPath if the URL looked like a route detail
    if (segments[0] === 'routes' && segments.length >= 2) {
      api.routes.list({ pageSize: 200 }).then((res) => {
        const candidates = res.data
          .map((r: any) => {
            const key = r.slug || r.publicPath?.replace(/^\/r\//, '').replace(/\/\*$/, '') || ''
            return { r, key, d: distance(last.toLowerCase(), String(key).toLowerCase()) }
          })
          .filter((x) => x.d <= 4)
          .sort((a, b) => a.d - b.d)
          .slice(0, 3)
        const fromRoutes = candidates.map((c) => ({
          href: routeUrl(c.r),
          label: c.r.name,
          hint: c.r.publicPath,
        }))
        if (fromRoutes.length) setSuggestions((prev) => [...prev, ...fromRoutes])
      }).catch(() => {})
    }

    // Always also offer the closest top-level page
    const TOP_PAGES: Suggestion[] = [
      { href: '/dashboard', label: 'Dashboard', hint: 'Overview' },
      { href: '/routes', label: 'Routes', hint: 'Manage proxy routes' },
      { href: '/groups', label: 'Groups', hint: 'Route groups' },
      { href: '/organizations', label: 'Organizations', hint: 'Tenants' },
      { href: '/analytics', label: 'Analytics', hint: 'Traffic + latency' },
      { href: '/logs', label: 'Logs', hint: 'Request logs' },
      { href: '/audit', label: 'Audit log', hint: 'Admin actions' },
      { href: '/users', label: 'Users', hint: 'Accounts' },
      { href: '/settings', label: 'Settings', hint: 'System config' },
    ]
    const first = segments[0] || ''
    const best = TOP_PAGES
      .map((p) => ({ p, d: distance(first.toLowerCase(), p.href.slice(1)) }))
      .filter((x) => x.d <= 3)
      .sort((a, b) => a.d - b.d)
      .slice(0, 2)
      .map((x) => x.p)
    if (best.length) collected.push(...best)

    if (collected.length) setSuggestions((prev) => [...collected, ...prev])
  }, [pathname])

  useEffect(() => {
    setMessage(MESSAGES[Math.floor(Math.random() * MESSAGES.length)])
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      setGlitch(true)
      setTimeout(() => setGlitch(false), 200)
    }, 4000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center space-y-6 max-w-md">
        <div className="relative">
          <h1
            className={`text-8xl font-bold text-primary/20 select-none transition-transform ${
              glitch ? 'translate-x-1 skew-x-2' : ''
            }`}
          >
            404
          </h1>
          <p
            className={`absolute inset-0 flex items-center justify-center text-8xl font-bold text-primary transition-transform ${
              glitch ? '-translate-x-1 -skew-x-1' : ''
            }`}
            style={glitch ? { clipPath: 'inset(30% 0 40% 0)' } : undefined}
          >
            404
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">Page Not Found</h2>
          <p className="text-muted-foreground">{message}</p>
        </div>

        {suggestions.length > 0 && (
          <div className="rounded-lg border border-border/50 bg-card/40 p-3 text-left space-y-2">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5" /> Did you mean…
            </p>
            <div className="space-y-1">
              {suggestions.slice(0, 4).map((s) => (
                <Link
                  key={s.href}
                  href={s.href}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50 transition-colors"
                >
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/60 flex-shrink-0" />
                  <span className="text-foreground font-medium">{s.label}</span>
                  <span className="text-xs text-muted-foreground truncate">· {s.hint}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" onClick={() => history.back()}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Back
          </Button>
          <Button asChild>
            <Link href="/dashboard">
              <Home className="w-4 h-4 mr-2" />
              Dashboard
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
