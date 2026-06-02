'use client'

import { useEffect, useState } from 'react'

/**
 * A page-size selection that persists in localStorage so the user's preferred
 * row count carries across pages and sessions. Falls back to the default until
 * the value is read on mount (which happens before paint via useEffect's
 * first run; the initial render briefly uses the default).
 */
export function usePageSize(key: string, defaultSize = 20): [number, (n: number) => void] {
  const [size, setSize] = useState(defaultSize)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(`cg-pagesize-${key}`)
      const n = stored ? parseInt(stored, 10) : NaN
      if (!Number.isNaN(n) && n > 0) setSize(n)
    } catch { /* localStorage unavailable */ }
  }, [key])

  const update = (n: number) => {
    setSize(n)
    try { localStorage.setItem(`cg-pagesize-${key}`, String(n)) } catch { /* ignore */ }
  }
  return [size, update]
}

export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]
