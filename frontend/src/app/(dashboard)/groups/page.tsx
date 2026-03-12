'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { FolderOpen, Plus, Trash2, Pencil, Loader2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { useAuth } from '@/hooks/useAuth'
import { RouteGroup } from '@/types'
import Link from 'next/link'

export default function RouteGroupsPage() {
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'OPERATOR'
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editingGroup, setEditingGroup] = useState<RouteGroup | null>(null)

  // Form state
  const [formName, setFormName] = useState('')
  const [formPrefix, setFormPrefix] = useState('/r/')
  const [formDescription, setFormDescription] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['route-groups', search],
    queryFn: () => api.routeGroups.list({ search: search || undefined }),
  })

  const createMutation = useMutation({
    mutationFn: (data: { name: string; pathPrefix: string; description?: string }) =>
      api.routeGroups.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['route-groups'] })
      toast.success('Route group created')
      resetForm()
    },
    onError: (err: any) => toast.error(err.message || 'Failed to create group'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<RouteGroup> }) =>
      api.routeGroups.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['route-groups'] })
      toast.success('Route group updated')
      resetForm()
    },
    onError: (err: any) => toast.error(err.message || 'Failed to update group'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.routeGroups.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['route-groups'] })
      toast.success('Route group deleted')
    },
    onError: (err: any) => toast.error(err.message || 'Failed to delete group'),
  })

  const groups = data?.data ?? []

  const resetForm = () => {
    setShowCreate(false)
    setEditingGroup(null)
    setFormName('')
    setFormPrefix('/r/')
    setFormDescription('')
  }

  const handleEdit = (group: RouteGroup) => {
    setEditingGroup(group)
    setFormName(group.name)
    setFormPrefix(group.pathPrefix)
    setFormDescription(group.description || '')
    setShowCreate(true)
  }

  const handleSubmit = () => {
    if (!formName.trim() || !formPrefix.trim()) return
    if (editingGroup) {
      updateMutation.mutate({
        id: editingGroup.id,
        data: { name: formName, pathPrefix: formPrefix, description: formDescription || undefined } as any,
      })
    } else {
      createMutation.mutate({
        name: formName,
        pathPrefix: formPrefix,
        description: formDescription || undefined,
      })
    }
  }

  const handleDelete = async (group: RouteGroup) => {
    const confirmed = await confirm({
      title: 'Delete Route Group',
      description: `Delete "${group.name}"? Routes in this group will be unlinked but not deleted.`,
      confirmLabel: 'Delete',
      variant: 'destructive',
    })
    if (confirmed) deleteMutation.mutate(group.id)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Route Groups</h1>
          <p className="text-muted-foreground mt-1">Organize routes with shared prefixes and inherited defaults</p>
        </div>
        {isAdmin && (
          <Button onClick={() => { resetForm(); setShowCreate(true) }}>
            <Plus className="w-4 h-4 mr-2" /> New Group
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search groups..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      {/* Create/Edit Form */}
      {showCreate && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h3 className="text-sm font-semibold">{editingGroup ? 'Edit' : 'Create'} Route Group</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              type="text"
              placeholder="Group name"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              className="px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <input
              type="text"
              placeholder="Path prefix (e.g. /r/payments)"
              value={formPrefix}
              onChange={(e) => setFormPrefix(e.target.value)}
              className="px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <input
              type="text"
              placeholder="Description (optional)"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              className="px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-3 h-3 mr-2 animate-spin" />}
              {editingGroup ? 'Update' : 'Create'}
            </Button>
            <Button size="sm" variant="ghost" onClick={resetForm}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Groups Table */}
      <div className="rounded-lg border border-border bg-card">
        {isLoading ? (
          <div className="p-6 space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-5 w-5 rounded" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <FolderOpen className="w-10 h-10 mb-3 opacity-40" />
            <p className="text-sm font-medium">No route groups</p>
            <p className="text-xs mt-1">Create a route group to organize related routes.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <th className="text-left px-4 py-3">Name</th>
                  <th className="text-left px-4 py-3">Path Prefix</th>
                  <th className="text-left px-4 py-3">Team</th>
                  <th className="text-left px-4 py-3">Routes</th>
                  <th className="text-left px-4 py-3">Status</th>
                  {isAdmin && <th className="text-right px-4 py-3">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {groups.map((group) => (
                  <tr key={group.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/groups/${group.id}`} className="text-sm font-medium hover:text-primary transition-colors">
                        {group.name}
                      </Link>
                      {group.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{group.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <code className="text-xs bg-muted px-2 py-0.5 rounded">{group.pathPrefix}</code>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {group.team?.name || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {group._count?.routes ?? 0}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${group.isActive ? 'bg-emerald-500/10 text-emerald-500' : 'bg-zinc-500/10 text-zinc-400'}`}>
                        {group.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => handleEdit(group)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(group)}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    )}
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
