'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Network, Loader2, Lock, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})

type LoginForm = z.infer<typeof loginSchema>

export default function LoginPage() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async (data: LoginForm) => {
    try {
      await api.auth.login(data.email, data.password)
      toast.success('Welcome back!')
      router.push('/dashboard')
      router.refresh()
    } catch (err: any) {
      toast.error(err.message || 'Login failed. Please check your credentials.')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      {/* Background gradient */}
      <div className="fixed inset-0 bg-gradient-to-br from-primary/5 via-background to-background pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Logo & Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 mb-4">
            <Network className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">ClusterGate</h1>
          <p className="mt-2 text-muted-foreground text-sm">
            Kubernetes Routing Gateway
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-card border border-border/50 rounded-2xl p-8 shadow-2xl shadow-black/20">
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
                  placeholder="admin@clustergate.local"
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
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground mt-6">
          ClusterGate v1.0.0 — Kubernetes Routing Gateway Platform
        </p>
      </div>
    </div>
  )
}
