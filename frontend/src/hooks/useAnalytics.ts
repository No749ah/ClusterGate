import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function useAnalyticsOverview(routeId?: string, days = 7) {
  return useQuery({
    queryKey: ['analytics', 'overview', routeId, days],
    queryFn: () => api.analytics.overview(routeId, days),
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    placeholderData: keepPreviousData,
  })
}

export function useLatencyTrend(routeId?: string, days = 7, granularity?: 'hour' | 'day') {
  return useQuery({
    queryKey: ['analytics', 'latency-trend', routeId, days, granularity],
    queryFn: () => api.analytics.latencyTrend(routeId, days, granularity),
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    placeholderData: keepPreviousData,
  })
}

export function useErrorTrend(routeId?: string, days = 7) {
  return useQuery({
    queryKey: ['analytics', 'error-trend', routeId, days],
    queryFn: () => api.analytics.errorTrend(routeId, days),
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    placeholderData: keepPreviousData,
  })
}

export function useTrafficHeatmap(routeId?: string, days = 28) {
  return useQuery({
    queryKey: ['analytics', 'heatmap', routeId, days],
    queryFn: () => api.analytics.heatmap(routeId, days),
    staleTime: 60 * 1000,
    refetchInterval: 120 * 1000,
    placeholderData: keepPreviousData,
  })
}

export function useSlowestRoutes(limit = 10) {
  return useQuery({
    queryKey: ['analytics', 'slowest', limit],
    queryFn: () => api.analytics.slowest(limit),
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    placeholderData: keepPreviousData,
  })
}

export function useStatusDistribution(routeId?: string, days = 7) {
  return useQuery({
    queryKey: ['analytics', 'status-distribution', routeId, days],
    queryFn: () => api.analytics.statusDistribution(routeId, days),
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    placeholderData: keepPreviousData,
  })
}
