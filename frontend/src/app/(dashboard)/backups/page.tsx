'use client'

import { useState } from 'react'
import { Download, Trash2, RotateCcw, Plus, HardDrive, Loader2 } from 'lucide-react'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { useBackups, useCreateBackup, useRestoreBackup, useDeleteBackup } from '@/hooks/useBackups'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatRelativeTime } from '@/lib/utils'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export default function BackupsPage() {
  const confirm = useConfirm()
  const { data, isLoading } = useBackups()
  const createBackup = useCreateBackup()
  const restoreBackup = useRestoreBackup()
  const deleteBackup = useDeleteBackup()
  const [restoringFile, setRestoringFile] = useState<string | null>(null)

  const backups = data?.data ?? []

  const handleCreate = async () => {
    try {
      const result = await createBackup.mutateAsync()
      toast.success(`Backup created: ${result.data.filename}`)
    } catch (err: any) {
      toast.error(err.message || 'Failed to create backup')
    }
  }

  const handleRestore = async (filename: string) => {
    const confirmed = await confirm({
      title: 'Restore Database',
      description: `This will replace the current database with the backup "${filename}". This action cannot be undone. Are you sure?`,
      confirmLabel: 'Restore',
      variant: 'destructive',
    })
    if (!confirmed) return

    setRestoringFile(filename)
    try {
      await restoreBackup.mutateAsync(filename)
      toast.success(`Database restored from ${filename}`)
    } catch (err: any) {
      toast.error(err.message || 'Failed to restore backup')
    } finally {
      setRestoringFile(null)
    }
  }

  const handleDelete = async (filename: string) => {
    const confirmed = await confirm({
      title: 'Delete Backup',
      description: `Are you sure you want to delete "${filename}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'destructive',
    })
    if (!confirmed) return

    try {
      await deleteBackup.mutateAsync(filename)
      toast.success('Backup deleted')
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete backup')
    }
  }

  const handleDownload = (filename: string) => {
    const url = api.backups.downloadUrl(filename)
    window.open(url, '_blank')
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Database Backups</h1>
          <p className="text-muted-foreground mt-1">
            Create, restore, and manage database backups
          </p>
        </div>
        <Button onClick={handleCreate} disabled={createBackup.isPending}>
          {createBackup.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Plus className="w-4 h-4 mr-2" />
          )}
          {createBackup.isPending ? 'Creating...' : 'Create Backup'}
        </Button>
      </div>

      {/* Backups Table */}
      <div className="rounded-lg border border-border bg-card">
        {isLoading ? (
          <div className="p-6 space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-5 w-5 rounded" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-8 w-24" />
              </div>
            ))}
          </div>
        ) : backups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <HardDrive className="w-10 h-10 mb-3 opacity-40" />
            <p className="text-sm font-medium">No backups yet</p>
            <p className="text-xs mt-1">Create your first database backup to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <th className="text-left px-4 py-3">Filename</th>
                  <th className="text-left px-4 py-3">Size</th>
                  <th className="text-left px-4 py-3">Created</th>
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {backups.map((backup) => (
                  <tr key={backup.filename} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <HardDrive className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <span className="text-sm font-mono">{backup.filename}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {formatBytes(backup.size)}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {formatRelativeTime(backup.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDownload(backup.filename)}
                          title="Download"
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRestore(backup.filename)}
                          disabled={restoringFile === backup.filename}
                          title="Restore"
                        >
                          {restoringFile === backup.filename ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <RotateCcw className="w-4 h-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(backup.filename)}
                          disabled={deleteBackup.isPending}
                          title="Delete"
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
