'use client'

import { useEffect, useState } from 'react'

const KEY = 'cg-recent-routes'
const MAX_RECENT = 5

export interface RecentRoute {
  id: string
  slug: string | null
  name: string
  publicPath: string
  visitedAt: number
}

function read(): RecentRoute[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as RecentRoute[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter((r) => r && r.id && typeof r.name === 'string').slice(0, MAX_RECENT)
  } catch {
    return []
  }
}

function write(list: RecentRoute[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_RECENT))) } catch { /* ignore */ }
  window.dispatchEvent(new Event('cg-recent-routes-changed'))
}

/** Push a route to the front of the "recently visited" list. */
export function rememberRoute(r: { id: string; slug?: string | null; name: string; publicPath: string }) {
  const next = [{ id: r.id, slug: r.slug ?? null, name: r.name, publicPath: r.publicPath, visitedAt: Date.now() }, ...read().filter((x) => x.id !== r.id)]
  write(next)
}

/** Read the recent list reactively (re-fires when rememberRoute is called). */
export function useRecentRoutes(): RecentRoute[] {
  const [list, setList] = useState<RecentRoute[]>([])
  useEffect(() => {
    setList(read())
    const handler = () => setList(read())
    window.addEventListener('cg-recent-routes-changed', handler)
    window.addEventListener('storage', handler)
    return () => {
      window.removeEventListener('cg-recent-routes-changed', handler)
      window.removeEventListener('storage', handler)
    }
  }, [])
  return list
}
