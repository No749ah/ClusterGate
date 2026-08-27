'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

/**
 * Origin used when building copyable route URLs (copy buttons, cURL snippets).
 * Admins can configure an external base URL (Settings → Public proxy URL) for
 * setups where /r/ routes are served under a different domain than the
 * dashboard; otherwise this falls back to the dashboard's own origin.
 */
export function useProxyOrigin(): string {
  const { data } = useQuery({
    queryKey: ['public-base-url'],
    queryFn: () => api.routes.getPublicBaseUrl(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })
  const configured = data?.data?.publicBaseUrl
  if (configured) return configured
  return typeof window !== 'undefined' ? window.location.origin : ''
}
