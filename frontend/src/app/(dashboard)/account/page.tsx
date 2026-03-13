'use client'

import { useState, useEffect } from 'react'
import { Eye, EyeOff, Loader2, User, Lock, Info, Shield, ShieldCheck, ShieldOff, Copy, KeyRound, Trophy, AlertCircle } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { useQuery } from '@tanstack/react-query'
import { useAuth, useChangePassword } from '@/hooks/useAuth'
import { api } from '@/lib/api'
import { Achievement } from '@/types'
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

const rarityColors: Record<string, string> = {
  common: 'border-zinc-500/30 bg-zinc-500/5',
  rare: 'border-blue-500/30 bg-blue-500/5',
  epic: 'border-purple-500/30 bg-purple-500/5',
  legendary: 'border-amber-500/30 bg-amber-500/5',
}

const rarityTextColors: Record<string, string> = {
  common: 'text-zinc-400',
  rare: 'text-blue-400',
  epic: 'text-purple-400',
  legendary: 'text-amber-400',
}

function AchievementsCard() {
  const { data } = useQuery({
    queryKey: ['achievements'],
    queryFn: () => api.achievements.list(),
  })

  const achievements = data?.data || []
  const unlocked = achievements.filter((a) => a.unlocked).length
  const total = achievements.length

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="w-4 h-4" /> Achievements
        </CardTitle>
        <CardDescription>
          {unlocked} / {total} unlocked
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {achievements.map((a) => (
            <div
              key={a.key}
              className={`rounded-lg border p-3 transition-all ${
                a.unlocked
                  ? `${rarityColors[a.rarity]} opacity-100`
                  : 'border-border bg-muted/10 opacity-40 grayscale'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-xl">{a.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{a.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{a.description}</p>
                </div>
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className={`text-xs font-medium capitalize ${rarityTextColors[a.rarity]}`}>{a.rarity}</span>
                {a.unlocked && a.unlockedAt && (
                  <span className="text-xs text-muted-foreground">
                    {new Date(a.unlockedAt).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export default function AccountPage() {
  const { user } = useAuth()
  const changePassword = useChangePassword()
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)

  // 2FA state
  const [twoFactorStep, setTwoFactorStep] = useState<'idle' | 'setup' | 'verify' | 'recovery'>('idle')
  const [twoFactorUri, setTwoFactorUri] = useState('')
  const [twoFactorSecret, setTwoFactorSecret] = useState('')
  const [twoFactorCode, setTwoFactorCode] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const [isSettingUp2FA, setIsSettingUp2FA] = useState(false)
  const [isEnabling2FA, setIsEnabling2FA] = useState(false)
  const [isDisabling2FA, setIsDisabling2FA] = useState(false)
  const [disablePassword, setDisablePassword] = useState('')

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

  const roleConfig = user ? ROLE_CONFIG[user.role] : null

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Account</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your profile and security</p>
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

      {/* Two-Factor Authentication */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" /> Two-Factor Authentication
          </CardTitle>
          <CardDescription>
            Add an extra layer of security to your account using a TOTP authenticator app.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {user?.twoFactorEnabled ? (
            // 2FA is enabled — show status and disable option
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10">
                <ShieldCheck className="w-5 h-5 text-emerald-500 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-emerald-500">Two-factor authentication is enabled</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Your account is protected with TOTP verification.</p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Confirm Password to Disable</label>
                <Input
                  type="password"
                  placeholder="Enter your password"
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                />
              </div>

              <Button
                variant="destructive"
                size="sm"
                disabled={isDisabling2FA || !disablePassword}
                onClick={async () => {
                  setIsDisabling2FA(true)
                  try {
                    await api.auth.twoFactorDisable(disablePassword)
                    toast.success('Two-factor authentication has been disabled.')
                    setDisablePassword('')
                    // Refresh user data
                    window.location.reload()
                  } catch (err: any) {
                    toast.error(err.message || 'Failed to disable 2FA')
                  } finally {
                    setIsDisabling2FA(false)
                  }
                }}
              >
                {isDisabling2FA ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Disabling...</>
                ) : (
                  <><ShieldOff className="w-4 h-4 mr-2" /> Disable Two-Factor Authentication</>
                )}
              </Button>
            </div>
          ) : twoFactorStep === 'idle' ? (
            // 2FA not enabled — show enable button
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-lg border border-border/50">
                <Shield className="w-5 h-5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-sm font-medium">Two-factor authentication is not enabled</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Protect your account by requiring a verification code at login.</p>
                </div>
              </div>

              <Button
                size="sm"
                disabled={isSettingUp2FA}
                onClick={async () => {
                  setIsSettingUp2FA(true)
                  try {
                    const res = await api.auth.twoFactorSetup()
                    setTwoFactorUri(res.data.uri)
                    setTwoFactorSecret(res.data.secret)
                    setTwoFactorStep('setup')
                  } catch (err: any) {
                    toast.error(err.message || 'Failed to start 2FA setup')
                  } finally {
                    setIsSettingUp2FA(false)
                  }
                }}
              >
                {isSettingUp2FA ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Setting up...</>
                ) : (
                  <><ShieldCheck className="w-4 h-4 mr-2" /> Enable Two-Factor Authentication</>
                )}
              </Button>
            </div>
          ) : twoFactorStep === 'setup' ? (
            // Show QR code / secret and verification input
            <div className="space-y-5">
              <div className="space-y-3">
                <p className="text-sm font-medium">1. Scan this QR code with your authenticator app</p>
                <div className="flex justify-center p-4 bg-white rounded-lg border border-border/50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(twoFactorUri)}`}
                    alt="2FA QR Code"
                    width={200}
                    height={200}
                    className="rounded"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Or enter this secret manually</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs font-mono bg-muted/50 border border-border/50 rounded px-3 py-2 break-all select-all">
                    {twoFactorSecret}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(twoFactorSecret)
                      toast.success('Secret copied to clipboard')
                    }}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <p className="text-sm font-medium">2. Enter the 6-digit code from your app to verify</p>
                <Input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  className="font-mono tracking-widest text-center"
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, ''))}
                />
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setTwoFactorStep('idle')
                    setTwoFactorUri('')
                    setTwoFactorSecret('')
                    setTwoFactorCode('')
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={isEnabling2FA || twoFactorCode.length < 6}
                  onClick={async () => {
                    setIsEnabling2FA(true)
                    try {
                      const res = await api.auth.twoFactorEnable(twoFactorCode)
                      setRecoveryCodes(res.data.recoveryCodes)
                      setTwoFactorStep('recovery')
                      toast.success('Two-factor authentication enabled!')
                    } catch (err: any) {
                      toast.error(err.message || 'Invalid verification code')
                      setTwoFactorCode('')
                    } finally {
                      setIsEnabling2FA(false)
                    }
                  }}
                >
                  {isEnabling2FA ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Verifying...</>
                  ) : (
                    'Verify & Enable'
                  )}
                </Button>
              </div>
            </div>
          ) : twoFactorStep === 'recovery' ? (
            // Show recovery codes
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 rounded-lg border border-amber-500/30 bg-amber-500/10">
                <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
                <p className="text-sm text-amber-500 font-medium">
                  Save these recovery codes in a safe place. They can only be shown once.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {recoveryCodes.map((code, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 px-3 py-1.5 rounded border border-border/50 bg-muted/30"
                  >
                    <KeyRound className="w-3 h-3 text-muted-foreground shrink-0" />
                    <code className="text-xs font-mono select-all">{code}</code>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(recoveryCodes.join('\n'))
                    toast.success('Recovery codes copied to clipboard')
                  }}
                >
                  <Copy className="w-4 h-4 mr-2" /> Copy All
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setTwoFactorStep('idle')
                    setRecoveryCodes([])
                    setTwoFactorCode('')
                    setTwoFactorUri('')
                    setTwoFactorSecret('')
                    // Refresh user data to reflect 2FA enabled state
                    window.location.reload()
                  }}
                >
                  Done
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Achievements */}
      <AchievementsCard />
    </div>
  )
}
