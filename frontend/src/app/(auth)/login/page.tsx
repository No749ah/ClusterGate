'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter, useSearchParams } from 'next/navigation'
import { Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck, ArrowLeft, KeyRound } from 'lucide-react'
import { LogoLarge } from '@/components/common/Logo'
import { SetupWizard } from '@/components/auth/SetupWizard'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})

type LoginForm = z.infer<typeof loginSchema>

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  )
}

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const [showPassword, setShowPassword] = useState(false)
  const [showSetup, setShowSetup] = useState(false)
  const [checkingSetup, setCheckingSetup] = useState(true)

  // 2FA state
  const [twoFactorPending, setTwoFactorPending] = useState(false)
  const [tempToken, setTempToken] = useState('')
  const [twoFactorCode, setTwoFactorCode] = useState('')
  const [isVerifying2FA, setIsVerifying2FA] = useState(false)
  const [useRecoveryCode, setUseRecoveryCode] = useState(false)
  const codeInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let retries = 0
    const checkSetup = () => {
      api.auth.setupStatus().then((res) => {
        if (!res.data.isSetupComplete) {
          setShowSetup(true)
        }
        setCheckingSetup(false)
      }).catch(() => {
        // Retry up to 3 times (backend might still be starting)
        if (retries < 3) {
          retries++
          setTimeout(checkSetup, 1500)
        } else {
          setCheckingSetup(false)
        }
      })
    }
    checkSetup()
  }, [])

  // Focus code input when 2FA screen appears
  useEffect(() => {
    if (twoFactorPending && codeInputRef.current) {
      codeInputRef.current.focus()
    }
  }, [twoFactorPending, useRecoveryCode])

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async (data: LoginForm) => {
    try {
      const result = await api.auth.login(data.email, data.password)

      if ((result.data as any).requiresTwoFactor) {
        setTempToken((result.data as any).tempToken)
        setTwoFactorPending(true)
        setTwoFactorCode('')
        return
      }

      await queryClient.invalidateQueries({ queryKey: ['auth'] })
      toast.success('Welcome back!')
      const redirect = searchParams.get('redirect')
      router.push(redirect || '/dashboard')
    } catch (err: any) {
      toast.error(err.message || 'Login failed. Please check your credentials.')
    }
  }

  const onVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!twoFactorCode.trim()) return

    setIsVerifying2FA(true)
    try {
      await api.auth.twoFactorVerify(tempToken, twoFactorCode.trim())
      await queryClient.invalidateQueries({ queryKey: ['auth'] })
      toast.success('Welcome back!')
      const redirect = searchParams.get('redirect')
      router.push(redirect || '/dashboard')
    } catch (err: any) {
      toast.error(err.message || 'Invalid verification code')
      setTwoFactorCode('')
    } finally {
      setIsVerifying2FA(false)
    }
  }

  const handleBackToLogin = () => {
    setTwoFactorPending(false)
    setTempToken('')
    setTwoFactorCode('')
    setUseRecoveryCode(false)
  }

  if (checkingSetup) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <SetupWizard open={showSetup} />
      {/* Background gradient */}
      <div className="fixed inset-0 bg-gradient-to-br from-primary/5 via-background to-background pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Logo & Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-4">
            <LogoLarge size={80} />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">ClusterGate</h1>
          <p className="mt-2 text-muted-foreground text-sm">
            Kubernetes Routing Gateway
          </p>
        </div>

        {/* Login / 2FA Card */}
        <div className="bg-card border border-border/50 rounded-2xl p-8 shadow-2xl shadow-black/20">
          {twoFactorPending ? (
            <>
              <div className="mb-6">
                <button
                  type="button"
                  onClick={handleBackToLogin}
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to login
                </button>
                <div className="flex items-center gap-2 mb-2">
                  <ShieldCheck className="w-5 h-5 text-primary" />
                  <h2 className="text-xl font-semibold text-foreground">Two-Factor Authentication</h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  {useRecoveryCode
                    ? 'Enter one of your recovery codes to sign in.'
                    : 'Enter the 6-digit code from your authenticator app.'}
                </p>
              </div>

              <form onSubmit={onVerify2FA} className="space-y-5">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground" htmlFor="twoFactorCode">
                    {useRecoveryCode ? 'Recovery Code' : 'Verification Code'}
                  </label>
                  <div className="relative">
                    {useRecoveryCode ? (
                      <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    )}
                    <input
                      ref={codeInputRef}
                      id="twoFactorCode"
                      type="text"
                      autoComplete="one-time-code"
                      inputMode={useRecoveryCode ? 'text' : 'numeric'}
                      placeholder={useRecoveryCode ? 'e.g. a1b2c3d4' : '000000'}
                      maxLength={useRecoveryCode ? 20 : 6}
                      className="w-full h-10 pl-10 pr-4 rounded-md border border-input bg-background text-sm outline-none transition-colors
                        focus:ring-2 focus:ring-primary/30 focus:border-primary
                        font-mono tracking-widest text-center"
                      value={twoFactorCode}
                      onChange={(e) => setTwoFactorCode(e.target.value)}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isVerifying2FA || !twoFactorCode.trim()}
                  className="w-full h-10 rounded-md bg-primary text-primary-foreground text-sm font-medium
                    hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/30
                    disabled:opacity-50 disabled:cursor-not-allowed
                    flex items-center justify-center gap-2 transition-colors"
                >
                  {isVerifying2FA ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    'Verify'
                  )}
                </button>
              </form>

              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setUseRecoveryCode(!useRecoveryCode)
                    setTwoFactorCode('')
                  }}
                  className="text-sm text-primary hover:underline"
                >
                  {useRecoveryCode ? 'Use authenticator code' : 'Use recovery code'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-foreground">Sign in</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Enter your credentials to access the control panel
                </p>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                {/* Email */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground" htmlFor="email">
                    Email address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      className={`w-full h-10 pl-10 pr-4 rounded-md border bg-background text-sm outline-none transition-colors
                        focus:ring-2 focus:ring-primary/30 focus:border-primary
                        ${errors.email ? 'border-destructive focus:ring-destructive/30' : 'border-input'}`}
                      {...register('email')}
                    />
                  </div>
                  {errors.email && (
                    <p className="text-xs text-destructive">{errors.email.message}</p>
                  )}
                </div>

                {/* Password */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground" htmlFor="password">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      className={`w-full h-10 pl-10 pr-10 rounded-md border bg-background text-sm outline-none transition-colors
                        focus:ring-2 focus:ring-primary/30 focus:border-primary
                        ${errors.password ? 'border-destructive focus:ring-destructive/30' : 'border-input'}`}
                      {...register('password')}
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="text-xs text-destructive">{errors.password.message}</p>
                  )}
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-10 rounded-md bg-primary text-primary-foreground text-sm font-medium
                    hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/30
                    disabled:opacity-50 disabled:cursor-not-allowed
                    flex items-center justify-center gap-2 transition-colors"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    'Sign in'
                  )}
                </button>
              </form>
            </>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground mt-6">
          ClusterGate — Kubernetes Routing Gateway Platform
        </p>
      </div>
    </div>
  )
}
