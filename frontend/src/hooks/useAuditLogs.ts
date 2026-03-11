import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { AuditLogFilters } from '@/types'

export function useAuditLogs(filters: AuditLogFilters = {}) {
  return useQuery({
    queryKey: ['audit', filters],
    queryFn: () => api.audit.list(filters),
    staleTime: 30 * 1000,
    placeholderData: keepPreviousData,
  })
}
