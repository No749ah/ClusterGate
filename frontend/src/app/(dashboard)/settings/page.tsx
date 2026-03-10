'use client'

import { useState } from 'react'
import { Eye, EyeOff, Download, Upload, Loader2, User, Lock, Info } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { useAuth, useChangePassword } from '@/hooks/useAuth'
import { useRoutes } from '@/hooks/useRoutes'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { formatDate } from '@/lib/utils'

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password required'),
    newPassword: z.string().min(8, 'Min 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  })

type PasswordForm = z.infer<typeof passwordSchema>

const ROLE_CONFIG = {
  ADMIN: { label: 'Administrator', variant: 'purple' as const },
  OPERATOR: { label: 'Operator', variant: 'info' as const },
  VIEWER: { label: 'Viewer', variant: 'secondary' as const },
}

export default function SettingsPage() {
  const { user } = useAuth()
  const changePassword = useChangePassword()
  const { data: routesData } = useRoutes({ pageSize: 1 })
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
  })

  const onPasswordSubmit = async (data: PasswordForm) => {
    await changePassword.mutateAsync({
      currentPassword: data.currentPassword,
      newPassword: data.newPassword,
    })
    reset()
  }

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const result = await api.routes.export()
      const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `clustergate-routes-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Routes exported successfully')
    } catch {
      toast.error('Failed to export routes')
    } finally {
      setIsExporting(false)
    }
  }

  const roleConfig = user ? ROLE_CONFIG[user.role] : null

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your account and system settings</p>
      </div>

      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-4 h-4" /> My Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/20 text-primary text-2xl font-bold">
              {user?.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-lg font-semibold text-foreground">{user?.name}</p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
              {roleConfig && <Badge variant={roleConfig.variant} className="mt-1">{roleConfig.label}</Badge>}
            </div>
          </div>
          <Separator />
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Member since</p>
              <p className="font-medium">{formatDate(user?.createdAt)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Last login</p>
              <p className="font-medium">{formatDate(user?.lastLoginAt)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="w-4 h-4" /> Change Password
          </CardTitle>
          <CardDescription>
            Password must be at least 8 characters with uppercase, lowercase, number, and special character.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onPasswordSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Current Password</label>
              <div className="relative">
                <Input
                  {...register('currentPassword')}
                  type={showCurrent ? 'text' : 'password'}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowCurrent(!showCurrent)}
                >
                  {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.currentPassword && <p className="text-xs text-destructive">{errors.currentPassword.message}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">New Password</label>
              <div className="relative">
                <Input
                  {...register('newPassword')}
                  type={showNew ? 'text' : 'password'}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowNew(!showNew)}
                >
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.newPassword && <p className="text-xs text-destructive">{errors.newPassword.message}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Confirm New Password</label>
              <Input {...register('confirmPassword')} type="password" placeholder="••••••••" />
              {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>}
            </div>

            <Button type="submit" disabled={isSubmitting || changePassword.isPending}>
              {isSubmitting || changePassword.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Changing...</>
              ) : (
                'Change Password'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Data Management */}
      {user?.role === 'ADMIN' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="w-4 h-4" /> Data Management
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg border border-border/50">
              <div>
                <p className="text-sm font-medium">Export Routes</p>
                <p className="text-xs text-muted-foreground">
                  Download all {routesData?.total ?? 0} routes as JSON
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={handleExport} disabled={isExporting}>
                {isExporting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
                Export
              </Button>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border border-border/50">
              <div>
                <p className="text-sm font-medium">Import Routes</p>
                <p className="text-xs text-muted-foreground">
                  Upload a JSON file to import routes
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={isImporting}
                onClick={() => {
                  const input = document.createElement('input')
                  input.type = 'file'
                  input.accept = '.json'
                  input.onchange = async (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0]
                    if (!file) return
                    setIsImporting(true)
                    try {
                      const text = await file.text()
                      const parsed = JSON.parse(text)
                      const routes = parsed.data ?? parsed.routes ?? parsed
                      if (!Array.isArray(routes)) throw new Error('Invalid format')
                      const result = await api.routes.import(routes)
                      toast.success(`Imported ${result.data.created} routes${result.data.errors.length > 0 ? ` (${result.data.errors.length} errors)` : ''}`)
                    } catch (err: any) {
                      toast.error(err.message || 'Failed to import routes')
                    } finally {
                      setIsImporting(false)
                    }
                  }
                  input.click()
                }}
              >
                {isImporting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
                Import
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* System Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="w-4 h-4" /> System
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground">Application</p>
              <p className="font-medium">ClusterGate</p>
            </div>
            <div>
              <p className="text-muted-foreground">Version</p>
              <p className="font-medium">v1.0.0</p>
            </div>
            <div>
              <p className="text-muted-foreground">API</p>
              <p className="font-medium font-mono text-xs">
                {process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
