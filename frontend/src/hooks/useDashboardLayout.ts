'use client'

import { useState, useCallback, useEffect } from 'react'

export interface WidgetConfig {
  id: string
  label: string
  visible: boolean
  size: 'sm' | 'md' | 'lg' | 'full'  // sm=1col, md=2col, lg=3col, full=4col
}

const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: 'stats', label: 'Stats Cards', visible: true, size: 'full' },
  { id: 'requests-chart', label: 'Request Volume', visible: true, size: 'md' },
  { id: 'active-routes', label: 'Active Routes', visible: true, size: 'sm' },
  { id: 'system-health', label: 'System Health', visible: true, size: 'sm' },
  { id: 'recent-requests', label: 'Recent Requests', visible: true, size: 'full' },
  { id: 'recent-errors', label: 'Recent Errors', visible: true, size: 'full' },
]

const STORAGE_KEY = 'clustergate-dashboard-layout'

export function useDashboardLayout() {
  const [widgets, setWidgets] = useState<WidgetConfig[]>(DEFAULT_WIDGETS)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed: WidgetConfig[] = JSON.parse(stored)
        // Merge with defaults to pick up new widgets added in updates
        const merged = DEFAULT_WIDGETS.map((def) => {
          const saved = parsed.find((p) => p.id === def.id)
          return saved ? { ...def, visible: saved.visible, size: saved.size } : def
        })
        setWidgets(merged)
      }
    } catch {}
  }, [])

  const save = useCallback((next: WidgetConfig[]) => {
    setWidgets(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }, [])

  const toggleWidget = useCallback((id: string) => {
    setWidgets((prev) => {
      const next = prev.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w))
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const moveWidget = useCallback((id: string, direction: 'up' | 'down') => {
    setWidgets((prev) => {
      const idx = prev.findIndex((w) => w.id === id)
      if (idx < 0) return prev
      const target = direction === 'up' ? idx - 1 : idx + 1
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[target]] = [next[target], next[idx]]
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const resetLayout = useCallback(() => {
    save(DEFAULT_WIDGETS)
  }, [save])

  return { widgets, editing, setEditing, toggleWidget, moveWidget, resetLayout }
}
