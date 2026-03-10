'use client'

import { useState } from 'react'
import { Plus, Edit, Trash2, KeyRound, Shield, Eye, UserCheck } from 'lucide-react'
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

const userSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Valid email required'),
  password: z.string().min(8, 'Min 8 characters').optional(),
  role: z.enum(['ADMIN', 'OPERATOR', 'VIEWER']),
})

type UserForm = z.infer<typeof userSchema>

export default function UsersPage() {
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null)
  const [newPassword, setNewPassword] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.users.list(),
  })

  const createMutation = useMutation({
    mutationFn: (data: { email: string; password: string; name: string; role: string }) =>
      api.users.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('User created')
      setDialogOpen(false)
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

  const users = data?.data ?? []

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Users</h1>
          <p className="text-sm text-muted-foreground mt-1">{users.length} users</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" /> New User
        </Button>
      </div>

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
                          onClick={() => {
                            if (confirm(`Remove user ${user.name}?`)) {
                              deleteMutation.mutate(user.id)
                            }
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

      {/* Create User Dialog */}
      <UserDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSubmit={(data) => createMutation.mutate({ ...data, password: data.password! })}
        isSubmitting={createMutation.isPending}
        requirePassword
      />

      {/* Edit User Dialog */}
      {editUser && (
        <UserDialog
          open={!!editUser}
          onClose={() => setEditUser(null)}
          defaultValues={editUser}
          onSubmit={(data) => updateMutation.mutate({ id: editUser.id, data })}
          isSubmitting={updateMutation.isPending}
          title={`Edit: ${editUser.name}`}
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

function UserDialog({
  open,
  onClose,
  defaultValues,
  onSubmit,
  isSubmitting,
  title = 'Create New User',
  requirePassword = false,
}: {
  open: boolean
  onClose: () => void
  defaultValues?: Partial<User>
  onSubmit: (data: any) => void
  isSubmitting: boolean
  title?: string
  requirePassword?: boolean
}) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<UserForm>({
    resolver: zodResolver(requirePassword ? userSchema.required({ password: true }) : userSchema),
    defaultValues: {
      name: defaultValues?.name ?? '',
      email: defaultValues?.email ?? '',
      role: defaultValues?.role ?? 'VIEWER',
    },
  })

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Name</label>
            <Input {...register('name')} placeholder="Jane Smith" />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Email</label>
            <Input {...register('email')} placeholder="jane@example.com" type="email" disabled={!!defaultValues} />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>
          {requirePassword && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Password</label>
              <Input {...register('password')} type="password" placeholder="Min 8 characters" />
              {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
            </div>
          )}
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
