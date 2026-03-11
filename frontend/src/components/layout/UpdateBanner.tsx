'use client'

import { useState, useEffect } from 'react'
import { ArrowUpCircle, X, Loader2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

const DISMISS_KEY = 'clustergate-update-dismissed'

export function UpdateBanner() {
  const { user } = useAuth()
  const [latestVersion, setLatestVersion] = useState<string | null>(null)
  const [currentVersion, setCurrentVersion] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false)

  useEffect(() => {
    if (user?.role !== 'ADMIN') return

    api.system.updateCheck().then((res) => {
      const data = res.data
      if (data.updateAvailable) {
        const latest = data.backend.latestTag || data.frontend.latestTag
        const dismissedVersion = localStorage.getItem(DISMISS_KEY)
        if (dismissedVersion === latest) return
        setCurrentVersion(data.currentVersion)
        setLatestVersion(latest)
        setDismissed(false)
      }
    }).catch(() => {})
  }, [user?.role])

  if (dismissed || !latestVersion || user?.role !== 'ADMIN') return null

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, latestVersion)
    setDismissed(true)
  }

  const handleUpdate = async () => {
    setIsUpdating(true)
    try {
      const result = await api.system.update()
      if (result.data.success) {
        toast.success(result.data.message)
        setDismissed(true)
      } else {
        toast.error(result.data.message)
      }
    } catch {
      toast.error('Failed to pull updates')
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2.5 flex items-center justify-between gap-4">
      <div className="flex items-center gap-2 min-w-0">
        <ArrowUpCircle className="w-4 h-4 text-amber-500 shrink-0" />
        <p className="text-sm text-amber-200 truncate">
          <span className="font-medium">Update available:</span>{' '}
          v{currentVersion} → {latestVersion}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs border-amber-500/30 hover:bg-amber-500/10"
          onClick={handleUpdate}
          disabled={isUpdating}
        >
          {isUpdating ? (
            <><Loader2 className="w-3 h-3 animate-spin mr-1" /> Updating...</>
          ) : (
            'Pull Update'
          )}
        </Button>
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
