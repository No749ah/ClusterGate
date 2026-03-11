'use client'

import { useState } from 'react'
import { Plus, Edit, Trash2, KeyRound, Link2, Copy, Check, X, Mail, Clock } from 'lucide-react'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { formatRelativeTime, formatDate } from '@/lib/utils'
import { User, Role } from '@/types'

const ROLE_CONFIG: Record<Role, { label: string; variant: 'purple' | 'info' | 'secondary' }> = {
  ADMIN: { label: 'Admin', variant: 'purple' },
  OPERATOR: { label: 'Operator', variant: 'info' },
  VIEWER: { label: 'Viewer', variant: 'secondary' },
}

const inviteSchema = z.object({
  email: z.string().email('Valid email required'),
  role: z.enum(['ADMIN', 'OPERATOR', 'VIEWER']),
})

type InviteForm = z.infer<typeof inviteSchema>

export default function UsersPage() {
  const queryClient = useQueryClient()
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [copiedLink, setCopiedLink] = useState(false)

  const confirm = useConfirm()

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.users.list(),
    staleTime: 30 * 1000,
  })

  const { data: invitesData } = useQuery({
    queryKey: ['invites'],
    queryFn: () => api.users.getInvites(),
    staleTime: 30 * 1000,
  })

  const inviteMutation = useMutation({
    mutationFn: (data: { email: string; role: string }) =>
      api.users.invite(data.email, data.role),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['invites'] })
      const link = `${window.location.origin}/invite/${res.data.token}`
      setInviteLink(link)
      toast.success('Invite created')
    },
    onError: (err: any) => toast.error(err.message),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; role?: string } }) =>
      api.users.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('User updated')
      setEditUser(null)
    },
    onError: (err: any) => toast.error(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.users.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('User removed')
    },
    onError: (err: any) => toast.error(err.message),
  })

  const resetPasswordMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      api.users.resetPassword(id, password),
    onSuccess: () => {
      toast.success('Password reset successfully')
      setResetPasswordUser(null)
      setNewPassword('')
    },
    onError: (err: any) => toast.error(err.message),
  })

  const revokeInviteMutation = useMutation({
    mutationFn: (id: string) => api.users.revokeInvite(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invites'] })
      toast.success('Invite revoked')
    },
    onError: (err: any) => toast.error(err.message),
  })

  const users = data?.data ?? []
  const pendingInvites = invitesData?.data ?? []

  const handleCopyLink = () => {
    if (inviteLink) {
      navigator.clipboard.writeText(inviteLink)
      setCopiedLink(true)
      toast.success('Link copied to clipboard')
      setTimeout(() => setCopiedLink(false), 2000)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Users</h1>
          <p className="text-sm text-muted-foreground mt-1">{users.length} users</p>
        </div>
        <Button onClick={() => { setInviteDialogOpen(true); setInviteLink(null); setCopiedLink(false) }}>
          <Mail className="w-4 h-4 mr-2" /> Invite User
        </Button>
      </div>

      {/* Pending Invites */}
      {pendingInvites.length > 0 && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 space-y-2">
          <p className="text-sm font-medium text-foreground flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" />
            Pending Invites ({pendingInvites.length})
          </p>
          <div className="space-y-1">
            {pendingInvites.map((invite) => (
              <div key={invite.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-amber-500/5">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-foreground">{invite.email}</span>
                  <Badge variant={ROLE_CONFIG[invite.role as Role]?.variant ?? 'secondary'} className="text-[10px]">
                    {ROLE_CONFIG[invite.role as Role]?.label ?? invite.role}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground">
                    expires {formatRelativeTime(invite.expiresAt)}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => revokeInviteMutation.mutate(invite.id)}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="rounded-lg border border-border/50 bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 border-b border-border/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">User</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Role</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Last Login</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-6 w-full" /></td>
                  ))}
                </tr>
              ))
            ) : (
              users.map((user) => {
                const roleConfig = ROLE_CONFIG[user.role]
                return (
                  <tr key={user.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/20 text-primary text-xs font-semibold">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{user.name}</p>
                          <p className="text-xs text-muted-foreground">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={roleConfig.variant}>{roleConfig.label}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={user.isActive ? 'success' : 'secondary'}>
                        {user.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {formatRelativeTime(user.lastLoginAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setEditUser(user)}
                          title="Edit user"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setResetPasswordUser(user)}
                          title="Reset password"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-destructive hover:text-destructive"
                          onClick={async () => {
                            const ok = await confirm({
                              title: 'Remove User',
                              description: `Are you sure you want to remove "${user.name}"? This will deactivate their account.`,
                              confirmLabel: 'Remove',
                              variant: 'destructive',
                            })
                            if (ok) deleteMutation.mutate(user.id)
                          }}
                          title="Delete user"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Invite User Dialog */}
      <InviteDialog
        open={inviteDialogOpen}
        onClose={() => { setInviteDialogOpen(false); setInviteLink(null) }}
        onSubmit={(data) => inviteMutation.mutate(data)}
        isSubmitting={inviteMutation.isPending}
        inviteLink={inviteLink}
        copiedLink={copiedLink}
        onCopyLink={handleCopyLink}
      />

      {/* Edit User Dialog */}
      {editUser && (
        <EditUserDialog
          open={!!editUser}
          onClose={() => setEditUser(null)}
          user={editUser}
          onSubmit={(data) => updateMutation.mutate({ id: editUser.id, data })}
          isSubmitting={updateMutation.isPending}
        />
      )}

      {/* Reset Password Dialog */}
      {resetPasswordUser && (
        <Dialog open onOpenChange={() => setResetPasswordUser(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reset Password: {resetPasswordUser.name}</DialogTitle>
              <DialogDescription>Set a new password for this user.</DialogDescription>
            </DialogHeader>
            <Input
              type="password"
              placeholder="New password (min 8 chars)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setResetPasswordUser(null)}>Cancel</Button>
              <Button
                onClick={() => resetPasswordMutation.mutate({ id: resetPasswordUser.id, password: newPassword })}
                disabled={newPassword.length < 8 || resetPasswordMutation.isPending}
              >
                Reset Password
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

function InviteDialog({
  open,
  onClose,
  onSubmit,
  isSubmitting,
  inviteLink,
  copiedLink,
  onCopyLink,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (data: InviteForm) => void
  isSubmitting: boolean
  inviteLink: string | null
  copiedLink: boolean
  onCopyLink: () => void
}) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<InviteForm>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: '', role: 'VIEWER' },
  })

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-4 h-4" /> Invite User
          </DialogTitle>
          <DialogDescription>
            Send an invite link. The user will create their own account with a password.
          </DialogDescription>
        </DialogHeader>

        {inviteLink ? (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
              <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400 mb-2">
                Invite created!
              </p>
              <p className="text-xs text-muted-foreground mb-3">
                Share this link with the user. It expires in 72 hours.
              </p>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={inviteLink}
                  className="text-xs font-mono flex-1"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <Button size="sm" variant="outline" onClick={onCopyLink}>
                  {copiedLink ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Email</label>
              <Input {...register('email')} placeholder="user@example.com" type="email" />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Role</label>
              <Select value={watch('role')} onValueChange={(v) => setValue('role', v as Role)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                  <SelectItem value="OPERATOR">Operator</SelectItem>
                  <SelectItem value="VIEWER">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Creating...' : 'Create Invite'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function EditUserDialog({
  open,
  onClose,
  user,
  onSubmit,
  isSubmitting,
}: {
  open: boolean
  onClose: () => void
  user: User
  onSubmit: (data: { name?: string; role?: string }) => void
  isSubmitting: boolean
}) {
  const editSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    role: z.enum(['ADMIN', 'OPERATOR', 'VIEWER']),
  })

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(editSchema),
    defaultValues: { name: user.name, role: user.role },
  })

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit: {user.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Name</label>
            <Input {...register('name')} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Email</label>
            <Input value={user.email} disabled className="opacity-60" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Role</label>
            <Select value={watch('role')} onValueChange={(v) => setValue('role', v as Role)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ADMIN">Admin</SelectItem>
                <SelectItem value="OPERATOR">Operator</SelectItem>
                <SelectItem value="VIEWER">Viewer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
