'use client'

import { useState, useEffect, useCallback } from 'react'
import { ArrowUpCircle, X, ExternalLink } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/lib/api'
import Link from 'next/link'

const DISMISS_KEY = 'clustergate-update-dismissed'
const POLL_INTERVAL = 5 * 60 * 1000 // 5 minutes

export function UpdateBanner() {
  const { user } = useAuth()
  const [latestVersion, setLatestVersion] = useState<string | null>(null)
  const [currentVersion, setCurrentVersion] = useState<string | null>(null)
  const [releaseUrl, setReleaseUrl] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(true)

  const checkStatus = useCallback(async () => {
    if (user?.role !== 'ADMIN') return
    try {
      const res = await api.system.updateStatus()
      const data = res.data
      if (!data || !data.updateAvailable) {
        // No cached result yet or no update — clear banner
        if (latestVersion) {
          setLatestVersion(null)
          setDismissed(true)
        }
        return
      }
      const latest = data.backend.latestTag || data.frontend.latestTag
      const dismissedVersion = localStorage.getItem(DISMISS_KEY)
      if (dismissedVersion === latest) return
      setCurrentVersion(data.currentVersion)
      setLatestVersion(latest)
      setReleaseUrl(data.releaseUrl)
      setDismissed(false)
    } catch {
      // Silently ignore — banner just won't show
    }
  }, [user?.role, latestVersion])

  useEffect(() => {
    checkStatus()
    const interval = setInterval(checkStatus, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [checkStatus])

  if (dismissed || !latestVersion || user?.role !== 'ADMIN') return null

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, latestVersion)
    setDismissed(true)
  }

  return (
    <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2.5 flex items-center justify-between gap-4">
      <div className="flex items-center gap-2 min-w-0">
        <ArrowUpCircle className="w-4 h-4 text-amber-500 shrink-0" />
        <p className="text-sm text-amber-200 truncate">
          <span className="font-medium">Update available:</span>{' '}
          v{currentVersion} &rarr; v{latestVersion?.replace(/^v/, '')}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {releaseUrl && (
          <a
            href={releaseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="h-7 px-2.5 text-xs inline-flex items-center gap-1 rounded-md border border-amber-500/30 hover:bg-amber-500/10 text-amber-200 transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            Changelog
          </a>
        )}
        <Link
          href="/settings"
          className="h-7 px-2.5 text-xs inline-flex items-center gap-1 rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-medium transition-colors"
        >
          Update
        </Link>
        <button
          onClick={handleDismiss}
          className="text-amber-500/60 hover:text-amber-500 transition-colors"
          title="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
