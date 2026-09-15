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
    mutationFn: (data: { name: string; expiresAt?: string; scope?: 'READ' | 'FULL'; routeIds?: string[]; folderIds?: string[] }) =>
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

export function useSetApiKeyRoutes(routeId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ keyId, routeIds, folderIds }: { keyId: string; routeIds: string[]; folderIds?: string[] }) =>
      api.apiKeys.setRoutes(routeId, keyId, routeIds, folderIds ?? []),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apiKeys', routeId] })
      toast.success('Key routes updated')
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to update key routes')
    },
  })
}

export function useDetachApiKey(routeId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (keyId: string) => api.apiKeys.detachFromRoute(routeId, keyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apiKeys', routeId] })
      toast.success('Key removed from this route')
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to remove key from this route')
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
