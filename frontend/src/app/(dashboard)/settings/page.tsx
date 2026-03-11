'use client'

import { useState, useEffect } from 'react'
import { Eye, EyeOff, Download, Upload, Loader2, User, Lock, Info, RefreshCw, ArrowUpCircle, CheckCircle2, AlertCircle, Shield, Wrench, Database, Activity, LogOut, ExternalLink } from 'lucide-react'
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
import { useConfirm } from '@/components/ui/confirm-dialog'
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

function formatMB(mb: number): string {
  if (mb < 1024) return `${mb} MB`
  return `${(mb / 1024).toFixed(1)} GB`
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h ${mins}m`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}

export default function SettingsPage() {
  const { user } = useAuth()
  const confirm = useConfirm()
  const changePassword = useChangePassword()
  const { data: routesData } = useRoutes({ pageSize: 1 })
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [currentVersion, setCurrentVersion] = useState('...')
  const [updateInfo, setUpdateInfo] = useState<{
    currentVersion: string
    backend: { image: string; currentTag: string; latestTag: string | null; updateAvailable: boolean }
    frontend: { image: string; currentTag: string; latestTag: string | null; updateAvailable: boolean }
    updateAvailable: boolean
    releaseUrl: string | null
    checkedAt: string
  } | null>(null)
  const [updateProgress, setUpdateProgress] = useState<{
    step: number
    totalSteps: number
    label: string
    status: 'running' | 'done' | 'error'
  } | null>(null)
  const [updateSteps, setUpdateSteps] = useState<{ step: number; label: string; status: 'running' | 'done' | 'error' }[]>([])
  const [updateComplete, setUpdateComplete] = useState<{ success: boolean; message: string; environment: string } | null>(null)

  // System stats & config state
  const [stats, setStats] = useState<{
    counts: { users: number; routes: number; activeRoutes: number; requestLogs: number; auditLogs: number; apiKeys: number; healthChecks: number }
    database: { size: string | null; oldestLog: string | null }
    system: { uptime: number; version: string; nodeVersion: string; platform: string; memory: { heapUsed: number; heapTotal: number; rss: number } }
  } | null>(null)
  const [config, setConfig] = useState<{
    logRetentionDays: number
    proxyTimeout: number
    rateLimitWindowMs: number
    rateLimitMax: number
    authRateLimitMax: number
    metricsEnabled: boolean
    logLevel: string
    jwtExpiresIn: string
    nodeEnv: string
  } | null>(null)
  const [loadingStats, setLoadingStats] = useState(false)
  const [loadingConfig, setLoadingConfig] = useState(false)

  // Maintenance action states
  const [triggeringHealthChecks, setTriggeringHealthChecks] = useState(false)
  const [cleaningLogs, setCleaningLogs] = useState(false)
  const [cleaningHealthChecks, setCleaningHealthChecks] = useState(false)
  const [cleaningAuditLogs, setCleaningAuditLogs] = useState(false)
  const [exportingAuditLogs, setExportingAuditLogs] = useState(false)
  const [forcingLogout, setForcingLogout] = useState(false)

  const isAdmin = user?.role === 'ADMIN'

  useEffect(() => {
    api.system.version().then((res) => {
      setCurrentVersion(res.data.version)
    }).catch(() => {})
  }, [])

  // Fetch stats and config for admins
  useEffect(() => {
    if (!isAdmin) return
    fetchStats()
    fetchConfig()
  }, [isAdmin])

  const fetchStats = async () => {
    setLoadingStats(true)
    try {
      const res = await api.system.stats()
      setStats(res.data)
    } catch {
      // silently fail
    } finally {
      setLoadingStats(false)
    }
  }

  const fetchConfig = async () => {
    setLoadingConfig(true)
    try {
      const res = await api.system.config()
      setConfig(res.data)
    } catch {
      // silently fail
    } finally {
      setLoadingConfig(false)
    }
  }

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

  const handleCheckUpdate = async () => {
    setIsCheckingUpdate(true)
    try {
      const result = await api.system.updateCheck()
      setUpdateInfo(result.data)
      if (result.data.updateAvailable) {
        toast.info('A new version is available!')
      } else {
        toast.success('You are running the latest version.')
      }
    } catch {
      toast.error('Failed to check for updates')
    } finally {
      setIsCheckingUpdate(false)
    }
  }

  const handleUpdate = async () => {
    setIsUpdating(true)
    setUpdateSteps([])
    setUpdateComplete(null)
    setUpdateProgress(null)
    try {
      await api.system.update((event: any) => {
        if (event.type === 'progress') {
          const { step, totalSteps, label, status } = event
          setUpdateProgress({ step, totalSteps, label, status })
          setUpdateSteps(prev => {
            const existing = prev.findIndex(s => s.step === step)
            const entry = { step, label, status }
            if (existing >= 0) {
              const updated = [...prev]
              updated[existing] = entry
              return updated
            }
            return [...prev, entry]
          })
        } else if (event.type === 'complete') {
          setUpdateComplete({ success: event.success, message: event.message, environment: event.environment })
          if (event.success) toast.success(event.message)
          else toast.error(event.message)
        } else if (event.type === 'error') {
          setUpdateComplete({ success: false, message: event.message, environment: '' })
          toast.error(event.message)
        }
      })
    } catch {
      toast.error('Update connection lost — the backend may be restarting')
      setUpdateComplete({ success: true, message: 'Connection lost — backend is likely restarting with the new version.', environment: 'kubernetes' })
    } finally {
      setIsUpdating(false)
    }
  }

  const handleTriggerHealthChecks = async () => {
    setTriggeringHealthChecks(true)
    try {
      const res = await api.system.triggerHealthChecks()
      toast.success(res.data.message || 'Health checks triggered')
    } catch {
      toast.error('Failed to trigger health checks')
    } finally {
      setTriggeringHealthChecks(false)
    }
  }

  const handleCleanupLogs = async () => {
    setCleaningLogs(true)
    try {
      const res = await api.system.cleanupLogs()
      toast.success(`Deleted ${res.data.deleted} request logs (retention: ${res.data.retentionDays} days)`)
      fetchStats()
    } catch {
      toast.error('Failed to cleanup request logs')
    } finally {
      setCleaningLogs(false)
    }
  }

  const handleCleanupHealthChecks = async () => {
    setCleaningHealthChecks(true)
    try {
      const res = await api.system.cleanupHealthChecks()
      toast.success(`Deleted ${res.data.deleted} health check records (retention: ${res.data.retentionDays} days)`)
      fetchStats()
    } catch {
      toast.error('Failed to cleanup health check records')
    } finally {
      setCleaningHealthChecks(false)
    }
  }

  const handleCleanupAuditLogs = async () => {
    setCleaningAuditLogs(true)
    try {
      const res = await api.system.cleanupAuditLogs()
      toast.success(`Deleted ${res.data.deleted} audit logs (retention: ${res.data.retentionDays} days)`)
      fetchStats()
    } catch {
      toast.error('Failed to cleanup audit logs')
    } finally {
      setCleaningAuditLogs(false)
    }
  }

  const handleExportAuditLogs = async () => {
    setExportingAuditLogs(true)
    try {
      const result = await api.system.exportAuditLogs()
      const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `clustergate-audit-logs-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(`Exported ${result.count} audit log entries`)
    } catch {
      toast.error('Failed to export audit logs')
    } finally {
      setExportingAuditLogs(false)
    }
  }

  const handleForceLogoutAll = async () => {
    const confirmed = await confirm({
      title: 'Force Logout All Users',
      description: 'This will invalidate all active sessions. Every user (including you) will need to log in again. Are you sure?',
      confirmLabel: 'Force Logout All',
      variant: 'destructive',
    })
    if (!confirmed) return

    setForcingLogout(true)
    try {
      const res = await api.system.forceLogoutAll()
      toast.success(`${res.data.affectedUsers} user(s) logged out. ${res.data.message}`)
    } catch {
      toast.error('Failed to force logout users')
    } finally {
      setForcingLogout(false)
    }
  }

  const roleConfig = user ? ROLE_CONFIG[user.role] : null

  return (
    <div className="max-w-2xl mx-auto space-y-6">
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

      {/* ============================================================ */}
      {/* ADMIN-ONLY SECTIONS */}
      {/* ============================================================ */}

      {isAdmin && (
        <>
          {/* System Overview */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Activity className="w-4 h-4" /> System Overview
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={fetchStats} disabled={loadingStats}>
                  {loadingStats ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {stats ? (
                <>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-muted-foreground">Version</p>
                      <p className="font-medium">v{stats.system.version}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Node.js</p>
                      <p className="font-medium">{stats.system.nodeVersion}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Platform</p>
                      <p className="font-medium">{stats.system.platform}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Uptime</p>
                      <p className="font-medium">{formatUptime(stats.system.uptime)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Memory (Heap)</p>
                      <p className="font-medium">{formatMB(stats.system.memory.heapUsed)} / {formatMB(stats.system.memory.heapTotal)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Memory (RSS)</p>
                      <p className="font-medium">{formatMB(stats.system.memory.rss)}</p>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <p className="text-sm font-medium mb-2">Record Counts</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="flex justify-between p-2 rounded border border-border/50">
                        <span className="text-muted-foreground">Users</span>
                        <span className="font-medium">{stats.counts.users}</span>
                      </div>
                      <div className="flex justify-between p-2 rounded border border-border/50">
                        <span className="text-muted-foreground">Routes</span>
                        <span className="font-medium">{stats.counts.routes} ({stats.counts.activeRoutes} active)</span>
                      </div>
                      <div className="flex justify-between p-2 rounded border border-border/50">
                        <span className="text-muted-foreground">Request Logs</span>
                        <span className="font-medium">{stats.counts.requestLogs.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between p-2 rounded border border-border/50">
                        <span className="text-muted-foreground">Audit Logs</span>
                        <span className="font-medium">{stats.counts.auditLogs.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between p-2 rounded border border-border/50">
                        <span className="text-muted-foreground">API Keys</span>
                        <span className="font-medium">{stats.counts.apiKeys}</span>
                      </div>
                      <div className="flex justify-between p-2 rounded border border-border/50">
                        <span className="text-muted-foreground">Health Checks</span>
                        <span className="font-medium">{stats.counts.healthChecks.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  {stats.database.size && (
                    <>
                      <Separator />
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-muted-foreground">Database Size</p>
                          <p className="font-medium">{stats.database.size}</p>
                        </div>
                        {stats.database.oldestLog && (
                          <div>
                            <p className="text-muted-foreground">Oldest Log</p>
                            <p className="font-medium">{formatDate(stats.database.oldestLog)}</p>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="flex items-center justify-center py-4">
                  {loadingStats ? (
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  ) : (
                    <p className="text-sm text-muted-foreground">Failed to load system stats</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Runtime Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="w-4 h-4" /> Runtime Configuration
              </CardTitle>
              <CardDescription>
                Configuration is managed via environment variables. Values shown are read-only.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {config ? (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">Log Retention</p>
                    <p className="font-medium">{config.logRetentionDays} days</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Proxy Timeout</p>
                    <p className="font-medium">{(config.proxyTimeout / 1000).toFixed(0)}s</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Rate Limit</p>
                    <p className="font-medium">{config.rateLimitMax} req / {(config.rateLimitWindowMs / 1000 / 60).toFixed(0)} min</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Auth Rate Limit</p>
                    <p className="font-medium">{config.authRateLimitMax} req / window</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">JWT Expiry</p>
                    <p className="font-medium">{config.jwtExpiresIn}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Log Level</p>
                    <p className="font-medium">{config.logLevel}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Metrics</p>
                    <p className="font-medium">{config.metricsEnabled ? 'Enabled' : 'Disabled'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Environment</p>
                    <Badge variant="secondary">{config.nodeEnv}</Badge>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center py-4">
                  {loadingConfig ? (
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  ) : (
                    <p className="text-sm text-muted-foreground">Failed to load configuration</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Maintenance Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wrench className="w-4 h-4" /> Maintenance Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg border border-border/50">
                <div>
                  <p className="text-sm font-medium">Trigger Health Checks</p>
                  <p className="text-xs text-muted-foreground">Run health checks on all active routes now</p>
                </div>
                <Button variant="outline" size="sm" onClick={handleTriggerHealthChecks} disabled={triggeringHealthChecks}>
                  {triggeringHealthChecks ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Activity className="w-4 h-4 mr-2" />}
                  Run
                </Button>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border border-border/50">
                <div>
                  <p className="text-sm font-medium">Cleanup Request Logs</p>
                  <p className="text-xs text-muted-foreground">
                    Remove logs older than {config?.logRetentionDays ?? 90} days
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={handleCleanupLogs} disabled={cleaningLogs}>
                  {cleaningLogs ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Database className="w-4 h-4 mr-2" />}
                  Cleanup
                </Button>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border border-border/50">
                <div>
                  <p className="text-sm font-medium">Cleanup Health Check Records</p>
                  <p className="text-xs text-muted-foreground">Remove health check records older than 30 days</p>
                </div>
                <Button variant="outline" size="sm" onClick={handleCleanupHealthChecks} disabled={cleaningHealthChecks}>
                  {cleaningHealthChecks ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Database className="w-4 h-4 mr-2" />}
                  Cleanup
                </Button>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border border-border/50">
                <div>
                  <p className="text-sm font-medium">Cleanup Audit Logs</p>
                  <p className="text-xs text-muted-foreground">Remove audit logs older than 365 days</p>
                </div>
                <Button variant="outline" size="sm" onClick={handleCleanupAuditLogs} disabled={cleaningAuditLogs}>
                  {cleaningAuditLogs ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Database className="w-4 h-4 mr-2" />}
                  Cleanup
                </Button>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border border-border/50">
                <div>
                  <p className="text-sm font-medium">Export Audit Logs</p>
                  <p className="text-xs text-muted-foreground">Download all audit logs as JSON</p>
                </div>
                <Button variant="outline" size="sm" onClick={handleExportAuditLogs} disabled={exportingAuditLogs}>
                  {exportingAuditLogs ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
                  Export
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Security Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-4 h-4" /> Security Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg border border-destructive/30 bg-destructive/5">
                <div>
                  <p className="text-sm font-medium">Force Logout All Users</p>
                  <p className="text-xs text-muted-foreground">Invalidate all active sessions immediately</p>
                </div>
                <Button variant="destructive" size="sm" onClick={handleForceLogoutAll} disabled={forcingLogout}>
                  {forcingLogout ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <LogOut className="w-4 h-4 mr-2" />}
                  Force Logout
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Data Management */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="w-4 h-4" /> Data Management
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
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

          {/* Software Updates */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowUpCircle className="w-4 h-4" /> Software Updates
              </CardTitle>
              <CardDescription>
                Check GHCR for newer ClusterGate images
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Version Overview */}
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="p-2.5 rounded-lg border border-border/50 text-center">
                  <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Current</p>
                  <p className="font-mono font-bold text-base mt-0.5">v{updateInfo?.currentVersion || currentVersion}</p>
                </div>
                <div className="p-2.5 rounded-lg border border-border/50 text-center">
                  <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Backend Latest</p>
                  <p className={`font-mono font-bold text-base mt-0.5 ${updateInfo?.backend.updateAvailable ? 'text-amber-500' : ''}`}>
                    {updateInfo?.backend.latestTag ? `v${updateInfo.backend.latestTag.replace(/^v/, '')}` : '—'}
                  </p>
                </div>
                <div className="p-2.5 rounded-lg border border-border/50 text-center">
                  <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Frontend Latest</p>
                  <p className={`font-mono font-bold text-base mt-0.5 ${updateInfo?.frontend.updateAvailable ? 'text-amber-500' : ''}`}>
                    {updateInfo?.frontend.latestTag ? `v${updateInfo.frontend.latestTag.replace(/^v/, '')}` : '—'}
                  </p>
                </div>
              </div>

              {/* Status + Check Button */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {updateInfo ? (
                    updateInfo.updateAvailable ? (
                      <><ArrowUpCircle className="w-4 h-4 text-amber-500" /><span className="text-sm font-medium text-amber-500">Update available</span></>
                    ) : (
                      <><CheckCircle2 className="w-4 h-4 text-emerald-500" /><span className="text-sm font-medium text-emerald-500">Up to date</span></>
                    )
                  ) : (
                    <span className="text-sm text-muted-foreground">Not checked yet</span>
                  )}
                </div>
                <Button variant="outline" size="sm" onClick={handleCheckUpdate} disabled={isCheckingUpdate}>
                  {isCheckingUpdate ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                  Check for Updates
                </Button>
              </div>

              {updateInfo?.checkedAt && (
                <p className="text-[10px] text-muted-foreground">
                  Last checked: {new Date(updateInfo.checkedAt).toLocaleString()}
                </p>
              )}

              {/* Update Actions */}
              {updateInfo?.updateAvailable && (
                <div className="space-y-3 pt-1">
                  <Separator />

                  {/* GitHub Release Link */}
                  {updateInfo.releaseUrl && (
                    <a
                      href={updateInfo.releaseUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-primary hover:underline"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      View changelog on GitHub
                    </a>
                  )}

                  {/* Get Update Instructions */}
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={handleUpdate}
                    disabled={isUpdating}
                  >
                    {isUpdating ? (
                      <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Checking...</>
                    ) : (
                      <><ArrowUpCircle className="w-4 h-4 mr-2" /> Update</>
                    )}
                  </Button>

                  {/* Update Progress */}
                  {(updateSteps.length > 0 || updateComplete) && (
                    <div className="rounded-lg border border-border/50 p-4 space-y-3">
                      {/* Progress bar */}
                      {updateProgress && (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">{updateProgress.label}</span>
                            <span className="text-muted-foreground font-mono">
                              {updateProgress.step}/{updateProgress.totalSteps}
                            </span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                updateProgress.status === 'error' ? 'bg-red-500' :
                                updateProgress.status === 'done' && updateProgress.step === updateProgress.totalSteps ? 'bg-green-500' :
                                'bg-primary'
                              }`}
                              style={{ width: `${(updateProgress.step / updateProgress.totalSteps) * 100}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Step log */}
                      <div className="space-y-1">
                        {updateSteps.map((s) => (
                          <div key={s.step} className="flex items-center gap-2 text-xs">
                            {s.status === 'done' ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                            ) : s.status === 'error' ? (
                              <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                            ) : (
                              <Loader2 className="w-3.5 h-3.5 text-primary animate-spin shrink-0" />
                            )}
                            <span className={s.status === 'error' ? 'text-red-400' : 'text-muted-foreground'}>
                              {s.label}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Final result */}
                      {updateComplete && (
                        <div className={`rounded-md p-2.5 text-xs ${updateComplete.success ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                          {updateComplete.message}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* System Info (non-admin) */}
      {!isAdmin && (
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
                <p className="font-medium">v{currentVersion}</p>
              </div>
              <div>
                <p className="text-muted-foreground">API</p>
                <p className="font-medium font-mono text-xs">
                  {process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? window.location.origin : '')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
