'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Route, Users, Settings, ScrollText, Shield, LayoutDashboard } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/lib/api'

interface CommandItem {
  id: string
  label: string
  description?: string
  icon: typeof Search
  href: string
  adminOnly?: boolean
}

const PAGES: CommandItem[] = [
  { id: 'dashboard', label: 'Dashboard', description: 'Overview', icon: LayoutDashboard, href: '/dashboard' },
  { id: 'routes', label: 'Routes', description: 'Manage routes', icon: Route, href: '/routes' },
  { id: 'routes-new', label: 'New Route', description: 'Create a new route', icon: Route, href: '/routes/new' },
  { id: 'activity', label: 'Request Logs', description: 'View proxy logs', icon: ScrollText, href: '/activity' },
  { id: 'users', label: 'Users', description: 'Manage users', icon: Users, href: '/users', adminOnly: true },
  { id: 'audit', label: 'Audit Log', description: 'Activity history', icon: Shield, href: '/audit', adminOnly: true },
  { id: 'settings', label: 'Settings', description: 'Account & system', icon: Settings, href: '/settings' },
]

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [routeResults, setRouteResults] = useState<{ id: string; name: string; publicPath: string }[]>([])
  const router = useRouter()
  const { user } = useAuth()
  const inputRef = useRef<HTMLInputElement>(null)
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>()

  // Ctrl+K to open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Search routes when query changes
  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    if (!query || query.length < 2) {
      setRouteResults([])
      return
    }
    searchTimeout.current = setTimeout(async () => {
      try {
        const res = await api.routes.list({ search: query, pageSize: 5 })
        setRouteResults(res.data.map((r) => ({ id: r.id, name: r.name, publicPath: r.publicPath })))
      } catch {
        setRouteResults([])
      }
    }, 200)
  }, [query])

  const filteredPages = PAGES.filter((p) => {
    if (p.adminOnly && user?.role !== 'ADMIN') return false
    if (!query) return true
    return p.label.toLowerCase().includes(query.toLowerCase()) ||
           p.description?.toLowerCase().includes(query.toLowerCase())
  })

  const allItems = [
    ...filteredPages.map((p) => ({ type: 'page' as const, ...p })),
    ...routeResults.map((r) => ({
      type: 'route' as const,
      id: r.id,
      label: r.name,
      description: r.publicPath,
      icon: Route,
      href: `/routes/${r.id}`,
    })),
  ]

  const navigate = useCallback((href: string) => {
    router.push(href)
    setOpen(false)
    setQuery('')
  }, [router])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, allItems.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && allItems[activeIndex]) {
      navigate(allItems[activeIndex].href)
    }
  }

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setQuery('') }}>
      <DialogContent className="p-0 gap-0 max-w-lg overflow-hidden [&>button]:hidden">
        <div className="flex items-center gap-3 px-4 border-b border-border/50">
          <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search pages, routes..."
            className="flex-1 h-12 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            autoFocus
          />
          <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border border-border/50 bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">
            ESC
          </kbd>
        </div>

        <div className="max-h-72 overflow-y-auto p-2">
          {allItems.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No results found
            </div>
          ) : (
            <>
              {filteredPages.length > 0 && (
                <div className="mb-1">
                  <p className="px-2 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Pages</p>
                  {filteredPages.map((item, i) => {
                    const Icon = item.icon
                    return (
                      <button
                        key={item.id}
                        onClick={() => navigate(item.href)}
                        onMouseEnter={() => setActiveIndex(i)}
                        className={cn(
                          'flex items-center gap-3 w-full px-3 py-2.5 rounded-md text-sm transition-colors',
                          activeIndex === i ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-muted/50'
                        )}
                      >
                        <Icon className="w-4 h-4 flex-shrink-0" />
                        <span className="font-medium">{item.label}</span>
                        {item.description && (
                          <span className="text-xs text-muted-foreground ml-auto">{item.description}</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}

              {routeResults.length > 0 && (
                <div>
                  <p className="px-2 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Routes</p>
                  {routeResults.map((item, i) => {
                    const idx = filteredPages.length + i
                    return (
                      <button
                        key={item.id}
                        onClick={() => navigate(`/routes/${item.id}`)}
                        onMouseEnter={() => setActiveIndex(idx)}
                        className={cn(
                          'flex items-center gap-3 w-full px-3 py-2.5 rounded-md text-sm transition-colors',
                          activeIndex === idx ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-muted/50'
                        )}
                      >
                        <Route className="w-4 h-4 flex-shrink-0" />
                        <span className="font-medium">{item.name}</span>
                        <span className="text-xs text-muted-foreground font-mono ml-auto">{item.publicPath}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-4 px-4 py-2 border-t border-border/50 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 rounded border border-border/50 bg-muted font-mono">↑↓</kbd> Navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 rounded border border-border/50 bg-muted font-mono">↵</kbd> Open
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 rounded border border-border/50 bg-muted font-mono">Esc</kbd> Close
          </span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
