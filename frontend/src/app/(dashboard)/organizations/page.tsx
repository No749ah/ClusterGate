'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { Building2, Plus, Trash2, Pencil, Loader2, Users, FolderOpen, GitPullRequest } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Organization } from '@/types'
import Link from 'next/link'

export default function OrganizationsPage() {
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null)

  // Form state
  const [formName, setFormName] = useState('')
  const [formSlug, setFormSlug] = useState('')
  const [formDescription, setFormDescription] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['organizations'],
    queryFn: () => api.organizations.list(),
  })

  const createMutation = useMutation({
    mutationFn: (data: { name: string; slug: string; description?: string }) =>
      api.organizations.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] })
      toast.success('Organization created')
      resetForm()
    },
    onError: (err: any) => toast.error(err.message || 'Failed to create organization'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Organization> }) =>
      api.organizations.update(id, data as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] })
      toast.success('Organization updated')
      resetForm()
    },
    onError: (err: any) => toast.error(err.message || 'Failed to update organization'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.organizations.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] })
      toast.success('Organization deleted')
    },
    onError: (err: any) => toast.error(err.message || 'Failed to delete organization'),
  })

  const orgs = data?.data ?? []

  const resetForm = () => {
    setShowCreate(false)
    setEditingOrg(null)
    setFormName('')
    setFormSlug('')
    setFormDescription('')
  }

  const handleEdit = (org: Organization) => {
    setEditingOrg(org)
    setFormName(org.name)
    setFormSlug(org.slug)
    setFormDescription(org.description || '')
    setShowCreate(true)
  }

  const handleSubmit = () => {
    if (!formName.trim() || !formSlug.trim()) return
    if (editingOrg) {
      updateMutation.mutate({
        id: editingOrg.id,
        data: { name: formName, description: formDescription || null } as any,
      })
    } else {
      createMutation.mutate({
        name: formName,
        slug: formSlug,
        description: formDescription || undefined,
      })
    }
  }

  const handleDelete = async (org: Organization) => {
    const confirmed = await confirm({
      title: 'Delete Organization',
      description: `Delete "${org.name}"? This will remove all teams and memberships.`,
      confirmLabel: 'Delete',
      variant: 'destructive',
    })
    if (confirmed) deleteMutation.mutate(org.id)
  }

  // Auto-generate slug from name
  const handleNameChange = (name: string) => {
    setFormName(name)
    if (!editingOrg) {
      setFormSlug(name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Organizations</h1>
          <p className="text-muted-foreground mt-1">Manage multi-tenant organizations and teams</p>
        </div>
        <Button onClick={() => { resetForm(); setShowCreate(true) }}>
          <Plus className="w-4 h-4 mr-2" /> New Organization
        </Button>
      </div>

      {/* Create/Edit Form */}
      {showCreate && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h3 className="text-sm font-semibold">{editingOrg ? 'Edit' : 'Create'} Organization</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              type="text"
              placeholder="Organization name"
              value={formName}
              onChange={(e) => handleNameChange(e.target.value)}
              className="px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <input
              type="text"
              placeholder="Slug (e.g. my-org)"
              value={formSlug}
              onChange={(e) => setFormSlug(e.target.value)}
              disabled={!!editingOrg}
              className="px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
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
              {editingOrg ? 'Update' : 'Create'}
            </Button>
            <Button size="sm" variant="ghost" onClick={resetForm}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Organizations Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-5">
              <Skeleton className="h-5 w-32 mb-2" />
              <Skeleton className="h-3 w-48 mb-4" />
              <div className="flex gap-4">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-16" />
              </div>
            </div>
          ))}
        </div>
      ) : orgs.length === 0 ? (
        <div className="rounded-lg border border-border bg-card flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Building2 className="w-10 h-10 mb-3 opacity-40" />
          <p className="text-sm font-medium">No organizations</p>
          <p className="text-xs mt-1">Create an organization to manage teams and routes.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {orgs.map((org) => (
            <div key={org.id} className="rounded-lg border border-border bg-card p-5 hover:border-primary/30 transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <Link href={`/organizations/${org.id}`} className="text-base font-semibold hover:text-primary transition-colors">
                    {org.name}
                  </Link>
                  <p className="text-xs text-muted-foreground mt-0.5">/{org.slug}</p>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(org)} className="h-7 w-7 p-0">
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(org)}
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              {org.description && (
                <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{org.description}</p>
              )}
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  <span>{org._count?.memberships ?? 0} members</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>{org._count?.teams ?? 0} teams</span>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <GitPullRequest className="w-3.5 h-3.5" />
                  <span>Change Requests</span>
                </div>
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    updateMutation.mutate({
                      id: org.id,
                      data: { changeRequestsEnabled: !org.changeRequestsEnabled } as any,
                    })
                  }}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    org.changeRequestsEnabled ? 'bg-primary' : 'bg-muted'
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                      org.changeRequestsEnabled ? 'translate-x-4' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
