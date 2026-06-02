'use client'

import { useState } from 'react'
import { Archive, RotateCcw, Trash2, AlertCircle, Building2 } from 'lucide-react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { formatRelativeTime } from '@/lib/utils'

export default function ArchivedRoutesPage() {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const [busy, setBusy] = useState<string | null>(null)
  const { data, isLoading } = useQuery({
    queryKey: ['routes', 'archived'],
    queryFn: () => api.routes.listArchived(),
    refetchOnWindowFocus: false,
  })
  const archived = data?.data ?? []

  const restore = useMutation({
    mutationFn: (id: string) => api.routes.restore(id),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['routes'] })
      toast.success(res.message || 'Route restored')
    },
    onError: (err: any) => toast.error(err.message || 'Failed to restore route'),
  })

  const purge = useMutation({
    mutationFn: (id: string) => api.routes.permanentDelete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['routes'] })
      toast.success('Route permanently deleted')
    },
    onError: (err: any) => toast.error(err.message || 'Failed to permanently delete'),
  })

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-20 -mx-4 px-4 md:-mx-6 md:px-6 -mt-4 md:-mt-6 pt-4 md:pt-6 pb-3 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border/40">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Archive className="w-5 h-5 text-muted-foreground shrink-0" />
          Archived Routes
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Restore or permanently delete soft-deleted routes. Visible to organization admins (and ADMINs for unscoped routes).
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : archived.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Archive className="w-10 h-10 mx-auto opacity-50 mb-3" />
          <p className="text-sm font-medium text-foreground">No archived routes</p>
          <p className="text-xs mt-1">Deleted routes show up here so they can be restored.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border/50 bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b border-border/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Route</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Target</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Organization</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Archived</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {archived.map((r: any) => (
                <tr key={r.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{r.name}</p>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">{r.publicPath}</p>
                  </td>
                  <td className="px-4 py-3 max-w-[240px]">
                    <span className="text-xs text-muted-foreground font-mono truncate block" title={r.targetUrl}>{r.targetUrl}</span>
                  </td>
                  <td className="px-4 py-3">
                    {r.organization ? (
                      <Badge variant="outline" className="inline-flex items-center gap-1 text-[10px]">
                        <Building2 className="w-3 h-3" />
                        {r.organization.name}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">No org · admins only</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {r.deletedAt ? formatRelativeTime(r.deletedAt) : '—'}
                    {r.updatedBy?.name && <p className="text-[11px]">by {r.updatedBy.name}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy === r.id || restore.isPending}
                        onClick={async () => {
                          setBusy(r.id)
                          try { await restore.mutateAsync(r.id) } finally { setBusy(null) }
                        }}
                      >
                        <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Restore
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-500 hover:text-red-500 hover:bg-red-500/10"
                        disabled={busy === r.id || purge.isPending}
                        onClick={async () => {
                          const ok = await confirm({
                            title: 'Permanently delete?',
                            description: `"${r.name}" will be removed forever. This can't be undone — there's no second archive after this.`,
                            confirmLabel: 'Permanently delete',
                            variant: 'destructive',
                            requireText: r.name,
                          })
                          if (!ok) return
                          setBusy(r.id)
                          try { await purge.mutateAsync(r.id) } finally { setBusy(null) }
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete forever
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-3 border-t border-border/50 flex items-center gap-2 text-xs text-muted-foreground">
            <AlertCircle className="w-3.5 h-3.5" />
            Restored routes come back inactive as a draft so they can't take production traffic immediately.
          </div>
        </div>
      )}
    </div>
  )
}
