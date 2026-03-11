import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { api } from '@/lib/api'

export function useAuth() {
  const { data, isLoading, error, isFetched } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => api.auth.getMe(),
    retry: false,
    staleTime: 10 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  })

  return {
    user: data?.data ?? null,
    isLoading: !isFetched && isLoading,
    isAuthenticated: !!data?.data,
    error,
  }
}

export function useLogin() {
  const router = useRouter()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      api.auth.login(email, password),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth'] })
      router.push('/dashboard')
    },
  })
}

export function useLogout() {
  const router = useRouter()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => api.auth.logout(),
    onSuccess: () => {
      queryClient.clear()
      router.push('/login')
    },
    onError: () => {
      queryClient.clear()
      router.push('/login')
    },
  })
}

export function useChangePassword() {
  const router = useRouter()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) =>
      api.auth.changePassword(currentPassword, newPassword),
    onSuccess: () => {
      toast.success('Password changed successfully. Please sign in again.')
      queryClient.clear()
      router.push('/login')
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to change password')
    },
  })
}
