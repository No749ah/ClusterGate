'use client'

import { useState, use } from 'react'
import Link from 'next/link'
import { ArrowLeft, Users, FolderOpen, Plus, Trash2, Pencil, Loader2, Shield, GitPullRequest } from 'lucide-react'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Organization, OrgMembership, Team, OrgRole, User } from '@/types'
import { formatRelativeTime } from '@/lib/utils'
import { api } from '@/lib/api'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

export default function OrganizationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const confirm = useConfirm()
  const queryClient = useQueryClient()

  // Add member state
  const [showAddMember, setShowAddMember] = useState(false)
  const [addMemberUserId, setAddMemberUserId] = useState('')
  const [addMemberRole, setAddMemberRole] = useState<OrgRole>('MEMBER')

  // Team form state
  const [showTeamForm, setShowTeamForm] = useState(false)
  const [editingTeam, setEditingTeam] = useState<Team | null>(null)
  const [teamName, setTeamName] = useState('')
  const [teamDescription, setTeamDescription] = useState('')

  const { data: orgData, isLoading } = useQuery({
    queryKey: ['organization', id],
    queryFn: () => api.organizations.getById(id),
  })

  const { data: teamsData, isLoading: teamsLoading } = useQuery({
    queryKey: ['organization-teams', id],
    queryFn: () => api.organizations.getTeams(id),
  })

  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.users.list(1, 100),
  })

  const org = orgData?.data
  const teams = teamsData?.data ?? []
  const members = org?.memberships ?? []
  const allUsers = usersData?.data ?? []
  const existingUserIds = new Set(members.map((m) => m.userId))

  // Mutations
  const updateOrgMutation = useMutation({
    mutationFn: (data: Partial<{ name: string; description: string | null; isActive: boolean; changeRequestsEnabled: boolean }>) =>
      api.organizations.update(id, data as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization', id] })
      toast.success('Organization updated')
    },
    onError: (err: any) => toast.error(err.message || 'Failed to update organization'),
  })

  const addMemberMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      api.organizations.addMember(id, userId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization', id] })
      toast.success('Member added')
      setShowAddMember(false)
      setAddMemberUserId('')
      setAddMemberRole('MEMBER')
    },
    onError: (err: any) => toast.error(err.message || 'Failed to add member'),
  })

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      api.organizations.updateMemberRole(id, userId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization', id] })
      toast.success('Role updated')
    },
    onError: (err: any) => toast.error(err.message || 'Failed to update role'),
  })

  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) => api.organizations.removeMember(id, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization', id] })
      toast.success('Member removed')
    },
    onError: (err: any) => toast.error(err.message || 'Failed to remove member'),
  })

  const createTeamMutation = useMutation({
    mutationFn: (data: { name: string; description?: string }) =>
      api.organizations.createTeam(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-teams', id] })
      toast.success('Team created')
      resetTeamForm()
    },
    onError: (err: any) => toast.error(err.message || 'Failed to create team'),
  })

  const updateTeamMutation = useMutation({
    mutationFn: ({ teamId, data }: { teamId: string; data: { name?: string; description?: string | null } }) =>
      api.organizations.updateTeam(id, teamId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-teams', id] })
      toast.success('Team updated')
      resetTeamForm()
    },
    onError: (err: any) => toast.error(err.message || 'Failed to update team'),
  })

  const deleteTeamMutation = useMutation({
    mutationFn: (teamId: string) => api.organizations.deleteTeam(id, teamId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-teams', id] })
      toast.success('Team deleted')
    },
    onError: (err: any) => toast.error(err.message || 'Failed to delete team'),
  })

  const resetTeamForm = () => {
    setShowTeamForm(false)
    setEditingTeam(null)
    setTeamName('')
    setTeamDescription('')
  }

  const handleEditTeam = (team: Team) => {
    setEditingTeam(team)
    setTeamName(team.name)
    setTeamDescription(team.description || '')
    setShowTeamForm(true)
  }

  const handleTeamSubmit = () => {
    if (!teamName.trim()) return
    if (editingTeam) {
      updateTeamMutation.mutate({
        teamId: editingTeam.id,
        data: { name: teamName, description: teamDescription || null },
      })
    } else {
      createTeamMutation.mutate({
        name: teamName,
        description: teamDescription || undefined,
      })
    }
  }

  const handleDeleteTeam = async (team: Team) => {
    const confirmed = await confirm({
      title: 'Delete Team',
      description: `Delete "${team.name}"? This will remove all team memberships.`,
      confirmLabel: 'Delete',
      variant: 'destructive',
    })
    if (confirmed) deleteTeamMutation.mutate(team.id)
  }

  const handleRemoveMember = async (membership: OrgMembership) => {
    const userName = membership.user?.name || membership.user?.email || 'this member'
    const confirmed = await confirm({
      title: 'Remove Member',
      description: `Remove ${userName} from this organization?`,
      confirmLabel: 'Remove',
      variant: 'destructive',
    })
    if (confirmed) removeMemberMutation.mutate(membership.userId)
  }

  const getRoleBadgeVariant = (role: OrgRole) => {
    switch (role) {
      case 'OWNER': return 'default' as const
      case 'ADMIN': return 'secondary' as const
      case 'MEMBER': return 'outline' as const
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (!org) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
        <p className="text-lg font-medium text-foreground">Organization not found</p>
        <Button className="mt-4" asChild><Link href="/organizations">Back to Organizations</Link></Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="sm" asChild className="mt-0.5">
            <Link href="/organizations"><ArrowLeft className="w-4 h-4" /></Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{org.name}</h1>
              <Badge variant={org.isActive ? 'default' : 'secondary'}>
                {org.isActive ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">/{org.slug}</p>
            {org.description && (
              <p className="text-sm text-muted-foreground mt-1">{org.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => updateOrgMutation.mutate({ isActive: !org.isActive })}
            disabled={updateOrgMutation.isPending}
          >
            {org.isActive ? 'Deactivate' : 'Activate'}
          </Button>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <Users className="w-4 h-4" /> Members
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{org._count?.memberships ?? members.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <FolderOpen className="w-4 h-4" /> Teams
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{org._count?.teams ?? teams.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <GitPullRequest className="w-4 h-4" /> Change Requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{org.changeRequestsEnabled ? 'Enabled' : 'Disabled'}</p>
              <button
                onClick={() => updateOrgMutation.mutate({ changeRequestsEnabled: !org.changeRequestsEnabled } as any)}
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
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="members">
        <TabsList>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="teams">Teams</TabsTrigger>
        </TabsList>

        {/* Members Tab */}
        <TabsContent value="members" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Organization Members</h3>
            <Button size="sm" onClick={() => setShowAddMember(true)}>
              <Plus className="w-4 h-4 mr-2" /> Add Member
            </Button>
          </div>

          {/* Add Member Form */}
          {showAddMember && (
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <h4 className="text-sm font-semibold">Add Member</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Select value={addMemberUserId} onValueChange={setAddMemberUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select user" />
                  </SelectTrigger>
                  <SelectContent>
                    {allUsers
                      .filter((u: User) => !existingUserIds.has(u.id))
                      .map((u: User) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name} ({u.email})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Select value={addMemberRole} onValueChange={(v) => setAddMemberRole(v as OrgRole)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OWNER">Owner</SelectItem>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                    <SelectItem value="MEMBER">Member</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      if (!addMemberUserId) return
                      addMemberMutation.mutate({ userId: addMemberUserId, role: addMemberRole })
                    }}
                    disabled={!addMemberUserId || addMemberMutation.isPending}
                  >
                    {addMemberMutation.isPending && <Loader2 className="w-3 h-3 mr-2 animate-spin" />}
                    Add
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setShowAddMember(false); setAddMemberUserId('') }}>
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Members List */}
          {members.length === 0 ? (
            <div className="rounded-lg border border-border bg-card flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Users className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm font-medium">No members yet</p>
              <p className="text-xs mt-1">Add members to this organization.</p>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Name</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">Email</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Role</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">Joined</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.id} className="border-b border-border/50 last:border-0">
                      <td className="px-4 py-2.5 font-medium">{m.user?.name || '—'}</td>
                      <td className="px-4 py-2.5 text-muted-foreground hidden sm:table-cell">{m.user?.email || '—'}</td>
                      <td className="px-4 py-2.5">
                        <Select
                          value={m.role}
                          onValueChange={(role) => updateRoleMutation.mutate({ userId: m.userId, role })}
                        >
                          <SelectTrigger className="h-7 w-28 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="OWNER">Owner</SelectItem>
                            <SelectItem value="ADMIN">Admin</SelectItem>
                            <SelectItem value="MEMBER">Member</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground hidden sm:table-cell">
                        {formatRelativeTime(m.createdAt)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveMember(m)}
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* Teams Tab */}
        <TabsContent value="teams" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Teams</h3>
            <Button size="sm" onClick={() => { resetTeamForm(); setShowTeamForm(true) }}>
              <Plus className="w-4 h-4 mr-2" /> Create Team
            </Button>
          </div>

          {/* Team Form */}
          {showTeamForm && (
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <h4 className="text-sm font-semibold">{editingTeam ? 'Edit' : 'Create'} Team</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Team name"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  className="px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <input
                  type="text"
                  placeholder="Description (optional)"
                  value={teamDescription}
                  onChange={(e) => setTeamDescription(e.target.value)}
                  className="px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleTeamSubmit}
                  disabled={createTeamMutation.isPending || updateTeamMutation.isPending}
                >
                  {(createTeamMutation.isPending || updateTeamMutation.isPending) && (
                    <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                  )}
                  {editingTeam ? 'Update' : 'Create'}
                </Button>
                <Button size="sm" variant="ghost" onClick={resetTeamForm}>Cancel</Button>
              </div>
            </div>
          )}

          {/* Teams List */}
          {teamsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : teams.length === 0 ? (
            <div className="rounded-lg border border-border bg-card flex flex-col items-center justify-center py-12 text-muted-foreground">
              <FolderOpen className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm font-medium">No teams yet</p>
              <p className="text-xs mt-1">Create a team to organize members.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {teams.map((team) => (
                <div key={team.id} className="rounded-lg border border-border bg-card p-5 hover:border-primary/30 transition-colors">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-base font-semibold">{team.name}</p>
                      {team.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{team.description}</p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => handleEditTeam(team)} className="h-7 w-7 p-0">
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteTeam(team)}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground mt-3 pt-3 border-t border-border/50">
                    <div className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" />
                      <span>{team._count?.members ?? team.members?.length ?? 0} members</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5" />
                      <span>{team._count?.routeGroups ?? 0} groups</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Created {formatRelativeTime(team.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
