import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { LogFilters } from '@/types'

export function useLogs(filters: LogFilters = {}) {
  return useQuery({
    queryKey: ['logs', filters],
    queryFn: () => api.logs.getAll(filters),
    staleTime: 15 * 1000,
    refetchInterval: 15 * 1000,
    placeholderData: keepPreviousData,
  })
}

export function useRecentErrors(routeId?: string, limit = 10) {
  return useQuery({
    queryKey: ['logs', 'errors', routeId, limit],
    queryFn: () => api.logs.getErrors(routeId, limit),
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  })
}

export function useDailyStats(routeId?: string, days = 7) {
  return useQuery({
    queryKey: ['logs', 'daily', routeId, days],
    queryFn: () => api.logs.getDaily(routeId, days),
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  })
}
