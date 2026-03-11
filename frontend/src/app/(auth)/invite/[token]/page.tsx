'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, Loader2, Lock, User, Mail, ShieldCheck } from 'lucide-react'
import { LogoLarge } from '@/components/common/Logo'
import { toast } from 'sonner'
import { api } from '@/lib/api'

const acceptSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
})

type AcceptForm = z.infer<typeof acceptSchema>

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrator',
  OPERATOR: 'Operator',
  VIEWER: 'Viewer',
}

export default function InvitePage({ params }: { params: { token: string } }) {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [inviteData, setInviteData] = useState<{ email: string; role: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.auth.validateInvite(params.token)
      .then((res) => {
        setInviteData(res.data)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message || 'Invalid or expired invite link')
        setLoading(false)
      })
  }, [params.token])

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AcceptForm>({
    resolver: zodResolver(acceptSchema),
  })

  const onSubmit = async (data: AcceptForm) => {
    try {
      await api.auth.acceptInvite({
        token: params.token,
        name: data.name,
        password: data.password,
      })
      toast.success('Account created! Welcome to ClusterGate.')
      router.push('/dashboard')
      router.refresh()
    } catch (err: any) {
      toast.error(err.message || 'Failed to create account')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="fixed inset-0 bg-gradient-to-br from-primary/5 via-background to-background pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-4">
            <LogoLarge size={80} />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">ClusterGate</h1>
          <p className="mt-2 text-muted-foreground text-sm">
            You've been invited to join
          </p>
        </div>

        <div className="bg-card border border-border/50 rounded-2xl p-8 shadow-2xl shadow-black/20">
          {loading ? (
            <div className="flex flex-col items-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
              <p className="text-sm text-muted-foreground">Validating invite...</p>
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <ShieldCheck className="w-12 h-12 text-destructive mx-auto mb-4 opacity-50" />
              <p className="text-foreground font-medium mb-2">Invalid Invite</p>
              <p className="text-sm text-muted-foreground mb-6">{error}</p>
              <button
                onClick={() => router.push('/login')}
                className="text-sm text-primary hover:underline"
              >
                Go to login
              </button>
            </div>
          ) : inviteData ? (
            <>
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-foreground">Create your account</h2>
                <div className="mt-3 p-3 rounded-lg bg-primary/5 border border-primary/10">
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="w-4 h-4 text-primary" />
                    <span className="text-foreground font-medium">{inviteData.email}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm mt-1">
                    <ShieldCheck className="w-4 h-4 text-primary" />
                    <span className="text-muted-foreground">
                      Role: <span className="text-foreground font-medium">{ROLE_LABELS[inviteData.role] ?? inviteData.role}</span>
                    </span>
                  </div>
                </div>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground" htmlFor="name">
                    Full name
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      id="name"
                      type="text"
                      placeholder="Jane Smith"
                      className={`w-full h-10 pl-10 pr-4 rounded-md border bg-background text-sm outline-none transition-colors
                        focus:ring-2 focus:ring-primary/30 focus:border-primary
                        ${errors.name ? 'border-destructive focus:ring-destructive/30' : 'border-input'}`}
                      {...register('name')}
                    />
                  </div>
                  {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground" htmlFor="password">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Min 8 characters"
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
                  {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
                  <p className="text-[11px] text-muted-foreground">
                    Must contain uppercase, lowercase, number, and special character
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground" htmlFor="confirmPassword">
                    Confirm password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      id="confirmPassword"
                      type="password"
                      placeholder="Re-enter password"
                      className={`w-full h-10 pl-10 pr-4 rounded-md border bg-background text-sm outline-none transition-colors
                        focus:ring-2 focus:ring-primary/30 focus:border-primary
                        ${errors.confirmPassword ? 'border-destructive focus:ring-destructive/30' : 'border-input'}`}
                      {...register('confirmPassword')}
                    />
                  </div>
                  {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>}
                </div>

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
                      Creating account...
                    </>
                  ) : (
                    'Create Account'
                  )}
                </button>
              </form>
            </>
          ) : null}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Already have an account?{' '}
          <button onClick={() => router.push('/login')} className="text-primary hover:underline">
            Sign in
          </button>
        </p>
      </div>
    </div>
  )
}
