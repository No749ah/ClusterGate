import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'

export function useApiKeys(routeId: string) {
  return useQuery({
    queryKey: ['apiKeys', routeId],
    queryFn: () => api.apiKeys.list(routeId),
    enabled: !!routeId,
  })
}

export function useCreateApiKey(routeId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: { name: string; expiresAt?: string }) =>
      api.apiKeys.create(routeId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apiKeys', routeId] })
      toast.success('API key created')
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to create API key')
    },
  })
}

export function useRevokeApiKey(routeId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (keyId: string) => api.apiKeys.revoke(routeId, keyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apiKeys', routeId] })
      toast.success('API key revoked')
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to revoke API key')
    },
  })
}

export function useDeleteApiKey(routeId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (keyId: string) => api.apiKeys.delete(routeId, keyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apiKeys', routeId] })
      toast.success('API key deleted')
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to delete API key')
    },
  })
}
