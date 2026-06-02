'use client'

import { useEffect, useState } from 'react'

const KEY = 'cg-pinned-routes'
const MAX_PINNED = 6

export interface PinnedRoute {
  id: string
  slug: string | null
  name: string
  publicPath: string
  pinnedAt: number
}

function read(): PinnedRoute[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as PinnedRoute[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter((r) => r && r.id && typeof r.name === 'string').slice(0, MAX_PINNED)
  } catch {
    return []
  }
}

function write(list: PinnedRoute[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_PINNED))) } catch { /* ignore */ }
  window.dispatchEvent(new Event('cg-pinned-routes-changed'))
}

export function isPinned(id: string): boolean {
  return read().some((r) => r.id === id)
}

/** Toggle a route's pinned state. Returns the new pinned state. */
export function togglePin(r: { id: string; slug?: string | null; name: string; publicPath: string }): boolean {
  const list = read()
  const next = list.some((x) => x.id === r.id)
    ? list.filter((x) => x.id !== r.id)
    : [...list, { id: r.id, slug: r.slug ?? null, name: r.name, publicPath: r.publicPath, pinnedAt: Date.now() }]
  write(next)
  return next.some((x) => x.id === r.id)
}

export function usePinnedRoutes(): PinnedRoute[] {
  const [list, setList] = useState<PinnedRoute[]>([])
  useEffect(() => {
    setList(read())
    const handler = () => setList(read())
    window.addEventListener('cg-pinned-routes-changed', handler)
    window.addEventListener('storage', handler)
    return () => {
      window.removeEventListener('cg-pinned-routes-changed', handler)
      window.removeEventListener('storage', handler)
    }
  }, [])
  return list
}

export function useIsPinned(id: string | null | undefined): [boolean, () => void] {
  const list = usePinnedRoutes()
  const pinned = !!id && list.some((r) => r.id === id)
  const toggle = () => { /* set via caller (needs full route info) */ }
  return [pinned, toggle]
}
