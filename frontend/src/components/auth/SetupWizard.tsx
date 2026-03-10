'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff, Loader2, ShieldCheck, User, Mail, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const setupSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Please enter a valid email address'),
  password: z.string()
    .min(8, 'Must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain an uppercase letter')
    .regex(/[a-z]/, 'Must contain a lowercase letter')
    .regex(/[0-9]/, 'Must contain a number')
    .regex(/[^A-Za-z0-9]/, 'Must contain a special character'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

type SetupForm = z.infer<typeof setupSchema>

export function SetupWizard({ open }: { open: boolean }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [showPassword, setShowPassword] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SetupForm>({
    resolver: zodResolver(setupSchema),
  })

  const onSubmit = async (data: SetupForm) => {
    try {
      await api.auth.setup({
        email: data.email,
        password: data.password,
        name: data.name,
      })
      queryClient.invalidateQueries({ queryKey: ['auth'] })
      toast.success('Admin account created! Welcome to ClusterGate.')
      router.push('/dashboard')
      router.refresh()
    } catch (err: any) {
      toast.error(err.message || 'Setup failed. Please try again.')
    }
  }

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-md [&>button]:hidden" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="flex items-center justify-center mb-2">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/15">
              <ShieldCheck className="w-6 h-6 text-primary" />
            </div>
          </div>
          <DialogTitle className="text-center text-xl">Welcome to ClusterGate</DialogTitle>
          <DialogDescription className="text-center">
            Create your administrator account to get started.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="setup-name">
              Full name
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                id="setup-name"
                type="text"
                placeholder="Admin"
                className={`w-full h-10 pl-10 pr-4 rounded-md border bg-background text-sm outline-none transition-colors
                  focus:ring-2 focus:ring-primary/30 focus:border-primary
                  ${errors.name ? 'border-destructive focus:ring-destructive/30' : 'border-input'}`}
                {...register('name')}
              />
            </div>
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="setup-email">
              Email address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                id="setup-email"
                type="email"
                placeholder="admin@example.com"
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
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="setup-password">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                id="setup-password"
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

          {/* Confirm Password */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="setup-confirm">
              Confirm password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                id="setup-confirm"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                className={`w-full h-10 pl-10 pr-4 rounded-md border bg-background text-sm outline-none transition-colors
                  focus:ring-2 focus:ring-primary/30 focus:border-primary
                  ${errors.confirmPassword ? 'border-destructive focus:ring-destructive/30' : 'border-input'}`}
                {...register('confirmPassword')}
              />
            </div>
            {errors.confirmPassword && (
              <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
            )}
          </div>

          <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
            This account will have full administrator privileges. You can create additional users after setup.
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
                Creating account...
              </>
            ) : (
              'Create Admin Account'
            )}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
