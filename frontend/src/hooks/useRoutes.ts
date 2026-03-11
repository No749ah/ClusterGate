import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { RouteFilters, RouteFormData } from '@/types'

export function useRoutes(filters: RouteFilters = {}) {
  return useQuery({
    queryKey: ['routes', filters],
    queryFn: () => api.routes.list(filters),
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
  })
}

export function useRoute(id: string) {
  return useQuery({
    queryKey: ['routes', id],
    queryFn: () => api.routes.getById(id),
    enabled: !!id,
    staleTime: 60 * 1000,
  })
}

export function useCreateRoute() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: RouteFormData) => api.routes.create(data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['routes'] })
      toast.success(`Route "${res.data.name}" created successfully`)
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to create route')
    },
  })
}

export function useUpdateRoute(id: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: Partial<RouteFormData>) => api.routes.update(id, data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['routes'] })
      queryClient.setQueryData(['routes', id], { success: true, data: res.data })
      toast.success('Route updated successfully')
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to update route')
    },
  })
}

export function useDeleteRoute() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.routes.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routes'] })
      toast.success('Route deleted successfully')
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to delete route')
    },
  })
}

export function usePublishRoute() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.routes.publish(id),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['routes'] })
      toast.success(`Route "${res.data.name}" published`)
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to publish route')
    },
  })
}

export function useDeactivateRoute() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.routes.deactivate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routes'] })
      toast.success('Route deactivated')
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to deactivate route')
    },
  })
}

export function useDuplicateRoute() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.routes.duplicate(id),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['routes'] })
      toast.success(`Route duplicated as "${res.data.name}"`)
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to duplicate route')
    },
  })
}

export function useTestRoute(id: string) {
  return useMutation({
    mutationFn: (params: { method?: string; path?: string; headers?: Record<string, string>; body?: string }) =>
      api.routes.test(id, params),
    onError: (err: any) => {
      toast.error(err.message || 'Test request failed')
    },
  })
}

export function useRouteHealth(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.routes.health(id),
    onSuccess: () => {
      // Refetch route to update the health indicator
      queryClient.invalidateQueries({ queryKey: ['route', id] })
    },
    onError: (err: any) => {
      toast.error(err.message || 'Health check failed')
    },
  })
}

export function useRouteVersions(id: string) {
  return useQuery({
    queryKey: ['routes', id, 'versions'],
    queryFn: () => api.routes.getVersions(id),
    enabled: !!id,
    staleTime: 60 * 1000,
  })
}

export function useRestoreRouteVersion(routeId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (versionId: string) => api.routes.restoreVersion(routeId, versionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routes', routeId] })
      toast.success('Route version restored')
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to restore version')
    },
  })
}

export function useRouteUptime(id: string) {
  return useQuery({
    queryKey: ['route-uptime', id],
    queryFn: () => api.routes.getUptime(id),
    staleTime: 5 * 60 * 1000,
  })
}

export function useRouteStats(id: string) {
  return useQuery({
    queryKey: ['routes', id, 'stats'],
    queryFn: () => api.routes.getStats(id),
    enabled: !!id,
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  })
}
