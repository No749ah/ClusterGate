'use client'

import { useState } from 'react'
import { Download, Trash2, RotateCcw, Plus, HardDrive, Loader2, AlertTriangle, Pencil, Tag, StickyNote, X } from 'lucide-react'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { useBackups, useCreateBackup, useRestoreBackup, useDeleteBackup } from '@/hooks/useBackups'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
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
  const queryClient = useQueryClient()
  const { data, isLoading } = useBackups()
  const createBackup = useCreateBackup()
  const restoreBackup = useRestoreBackup()
  const deleteBackup = useDeleteBackup()
  const [restoringFile, setRestoringFile] = useState<string | null>(null)

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false)
  const [createNote, setCreateNote] = useState('')
  const [createTagInput, setCreateTagInput] = useState('')
  const [createTags, setCreateTags] = useState<string[]>([])

  // Edit dialog state
  const [editBackup, setEditBackup] = useState<{ filename: string; tags: string[]; note: string | null } | null>(null)
  const [editNote, setEditNote] = useState('')
  const [editTagInput, setEditTagInput] = useState('')
  const [editTags, setEditTags] = useState<string[]>([])

  // Restore confirmation state
  const [restoreDialog, setRestoreDialog] = useState<string | null>(null)
  const [restoreInput, setRestoreInput] = useState('')
  const [restoreChecks, setRestoreChecks] = useState({ dataLoss: false, noUndo: false, createBackup: false })

  const backups = data?.data ?? []

  const updateMutation = useMutation({
    mutationFn: ({ filename, data }: { filename: string; data: { tags?: string[]; note?: string | null } }) =>
      api.backups.update(filename, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backups'] })
      toast.success('Backup updated')
      setEditBackup(null)
    },
    onError: (err: any) => toast.error(err.message || 'Failed to update backup'),
  })

  const addCreateTag = () => {
    const tag = createTagInput.trim()
    if (tag && !createTags.includes(tag)) {
      setCreateTags([...createTags, tag])
      setCreateTagInput('')
    }
  }

  const addEditTag = () => {
    const tag = editTagInput.trim()
    if (tag && !editTags.includes(tag)) {
      setEditTags([...editTags, tag])
      setEditTagInput('')
    }
  }

  const handleCreate = async () => {
    try {
      const options: { tags?: string[]; note?: string } = {}
      if (createTags.length > 0) options.tags = createTags
      if (createNote.trim()) options.note = createNote.trim()
      const result = await createBackup.mutateAsync(options)
      toast.success(`Backup created: ${result.data.filename}`)
      setCreateOpen(false)
      setCreateNote('')
      setCreateTags([])
      setCreateTagInput('')
    } catch (err: any) {
      toast.error(err.message || 'Failed to create backup')
    }
  }

  const openEdit = (backup: { filename: string; tags: string[]; note: string | null }) => {
    setEditBackup(backup)
    setEditTags([...backup.tags])
    setEditNote(backup.note ?? '')
    setEditTagInput('')
  }

  const openRestoreDialog = (filename: string) => {
    setRestoreDialog(filename)
    setRestoreInput('')
    setRestoreChecks({ dataLoss: false, noUndo: false, createBackup: false })
  }

  const canRestore = restoreDialog &&
    restoreInput === restoreDialog &&
    restoreChecks.dataLoss &&
    restoreChecks.noUndo &&
    restoreChecks.createBackup

  const handleRestore = async () => {
    if (!restoreDialog || !canRestore) return

    const filename = restoreDialog
    setRestoreDialog(null)
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
        <Button onClick={() => setCreateOpen(true)} disabled={createBackup.isPending}>
          <Plus className="w-4 h-4 mr-2" />
          Create Backup
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
                  <th className="text-left px-4 py-3">Backup</th>
                  <th className="text-left px-4 py-3">Size</th>
                  <th className="text-left px-4 py-3">Created</th>
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {backups.map((backup) => (
                  <tr key={backup.filename} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <HardDrive className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          <span className="text-sm font-mono">{backup.filename}</span>
                        </div>
                        {(backup.tags?.length > 0 || backup.note) && (
                          <div className="flex items-center gap-2 ml-6 flex-wrap">
                            {backup.tags?.map((tag) => (
                              <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">
                                <Tag className="w-2.5 h-2.5 mr-0.5" />{tag}
                              </Badge>
                            ))}
                            {backup.note && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1" title={backup.note}>
                                <StickyNote className="w-3 h-3" />
                                <span className="truncate max-w-[200px]">{backup.note}</span>
                              </span>
                            )}
                          </div>
                        )}
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
                        <Button variant="ghost" size="sm" onClick={() => openEdit(backup)} title="Edit tags & note">
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDownload(backup.filename)} title="Download">
                          <Download className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openRestoreDialog(backup.filename)}
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

      {/* Create Backup Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Backup</DialogTitle>
            <DialogDescription>
              Create a full database backup. Optionally add tags and a note.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Note (optional)</label>
              <Input
                value={createNote}
                onChange={(e) => setCreateNote(e.target.value)}
                placeholder="e.g. Before v1.7 migration"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Tags (optional)</label>
              <div className="flex gap-2">
                <Input
                  value={createTagInput}
                  onChange={(e) => setCreateTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCreateTag() } }}
                  placeholder="Add tag..."
                  className="flex-1"
                />
                <Button type="button" variant="outline" size="sm" onClick={addCreateTag} disabled={!createTagInput.trim()}>
                  Add
                </Button>
              </div>
              {createTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {createTags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="gap-1">
                      {tag}
                      <button onClick={() => setCreateTags(createTags.filter((t) => t !== tag))}>
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createBackup.isPending}>
              {createBackup.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              {createBackup.isPending ? 'Creating...' : 'Create Backup'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Backup Dialog */}
      <Dialog open={!!editBackup} onOpenChange={(v) => { if (!v) setEditBackup(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Backup</DialogTitle>
            <DialogDescription className="font-mono text-xs">{editBackup?.filename}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Note</label>
              <Input
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                placeholder="Add a note..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Tags</label>
              <div className="flex gap-2">
                <Input
                  value={editTagInput}
                  onChange={(e) => setEditTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEditTag() } }}
                  placeholder="Add tag..."
                  className="flex-1"
                />
                <Button type="button" variant="outline" size="sm" onClick={addEditTag} disabled={!editTagInput.trim()}>
                  Add
                </Button>
              </div>
              {editTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {editTags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="gap-1">
                      {tag}
                      <button onClick={() => setEditTags(editTags.filter((t) => t !== tag))}>
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditBackup(null)}>Cancel</Button>
            <Button
              onClick={() => editBackup && updateMutation.mutate({
                filename: editBackup.filename,
                data: { tags: editTags, note: editNote.trim() || null },
              })}
              disabled={updateMutation.isPending}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore Confirmation Dialog */}
      <Dialog open={!!restoreDialog} onOpenChange={(v) => { if (!v) setRestoreDialog(null) }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-destructive/10 mb-3">
              <AlertTriangle className="w-6 h-6 text-destructive" />
            </div>
            <DialogTitle>Restore Database</DialogTitle>
            <DialogDescription>
              This is a destructive operation. The entire current database will be replaced with the backup data.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={restoreChecks.dataLoss}
                  onChange={(e) => setRestoreChecks((p) => ({ ...p, dataLoss: e.target.checked }))}
                  className="mt-0.5 rounded border-border"
                />
                <span className="text-sm">
                  I understand that <strong>all current data will be permanently replaced</strong> with the backup data.
                </span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={restoreChecks.noUndo}
                  onChange={(e) => setRestoreChecks((p) => ({ ...p, noUndo: e.target.checked }))}
                  className="mt-0.5 rounded border-border"
                />
                <span className="text-sm">
                  I understand that this action <strong>cannot be undone</strong>. Any data created after the backup was made will be lost.
                </span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={restoreChecks.createBackup}
                  onChange={(e) => setRestoreChecks((p) => ({ ...p, createBackup: e.target.checked }))}
                  className="mt-0.5 rounded border-border"
                />
                <span className="text-sm">
                  I have <strong>created a backup of the current state</strong> or I accept losing the current data.
                </span>
              </label>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Type the filename to confirm: <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{restoreDialog}</code>
              </p>
              <Input
                value={restoreInput}
                onChange={(e) => setRestoreInput(e.target.value)}
                placeholder="Enter the backup filename"
                className="font-mono text-sm"
                autoFocus
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setRestoreDialog(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleRestore} disabled={!canRestore}>
              <RotateCcw className="w-4 h-4 mr-2" />
              Restore Database
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
