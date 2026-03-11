import {
  Route,
  RouteFormData,
  RouteFilters,
  LogFilters,
  AuditLogFilters,
  User,
  RequestLog,
  RouteVersion,
  RouteStats,
  TestResult,
  HealthCheck,
  AuditLog,
  ApiKey,
  Notification,
  ApiResponse,
  PaginatedResponse,
} from '@/types'

const API_URL = process.env.NEXT_PUBLIC_API_URL || ''

class ApiClient {
  private baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`

    const response = await fetch(url, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })

    if (response.status === 401) {
      // Redirect to login, but not if already on login/setup pages
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.href = '/login'
      }
      throw new Error('Unauthorized')
    }

    // Safely parse response — handle non-JSON responses (e.g. HTML error pages)
    let data: any
    try {
      data = await response.json()
    } catch {
      const error = new Error(`Request failed with status ${response.status}`)
      ;(error as any).status = response.status
      throw error
    }

    if (!response.ok) {
      const error = new Error(data.error?.message || 'Request failed')
      ;(error as any).code = data.error?.code
      ;(error as any).details = data.error?.details
      ;(error as any).status = response.status
      throw error
    }

    return data
  }

  private async get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'GET' })
  }

  private async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    })
  }

  private async put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    })
  }

  private async delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' })
  }

  // ============================================================================
  // Auth
  // ============================================================================

  auth = {
    login: (email: string, password: string) =>
      this.post<ApiResponse<{ user: User }>>('/api/auth/login', { email, password }),

    logout: () =>
      this.post<ApiResponse<null>>('/api/auth/logout'),

    getMe: () =>
      this.get<ApiResponse<User>>('/api/auth/me'),

    changePassword: (currentPassword: string, newPassword: string) =>
      this.post<ApiResponse<null>>('/api/auth/change-password', { currentPassword, newPassword }),

    setupStatus: () =>
      this.get<ApiResponse<{ isSetupComplete: boolean }>>('/api/auth/setup-status'),

    setup: (data: { email: string; password: string; name: string }) =>
      this.post<ApiResponse<{ user: User }>>('/api/auth/setup', data),

    validateInvite: (token: string) =>
      this.get<ApiResponse<{ email: string; role: string }>>(`/api/auth/invite/${token}`),

    acceptInvite: (data: { token: string; name: string; password: string }) =>
      this.post<ApiResponse<{ user: User }>>('/api/auth/accept-invite', data),
  }

  // ============================================================================
  // Routes
  // ============================================================================

  routes = {
    list: (filters: RouteFilters = {}) => {
      const params = new URLSearchParams()
      if (filters.search) params.set('search', filters.search)
      if (filters.status) params.set('status', filters.status)
      if (filters.isActive !== undefined) params.set('isActive', String(filters.isActive))
      if (filters.tags?.length) params.set('tags', filters.tags.join(','))
      if (filters.page) params.set('page', String(filters.page))
      if (filters.pageSize) params.set('pageSize', String(filters.pageSize))
      if (filters.sortBy) params.set('sortBy', filters.sortBy)
      if (filters.sortDir) params.set('sortDir', filters.sortDir)
      const qs = params.toString()
      return this.get<PaginatedResponse<Route>>(`/api/routes${qs ? `?${qs}` : ''}`)
    },

    getById: (id: string) =>
      this.get<ApiResponse<Route>>(`/api/routes/${id}`),

    create: (data: RouteFormData) =>
      this.post<ApiResponse<Route>>('/api/routes', data),

    update: (id: string, data: Partial<RouteFormData>) =>
      this.put<ApiResponse<Route>>(`/api/routes/${id}`, data),

    delete: (id: string) =>
      this.delete<ApiResponse<null>>(`/api/routes/${id}`),

    publish: (id: string) =>
      this.post<ApiResponse<Route>>(`/api/routes/${id}/publish`),

    deactivate: (id: string) =>
      this.post<ApiResponse<Route>>(`/api/routes/${id}/deactivate`),

    duplicate: (id: string) =>
      this.post<ApiResponse<Route>>(`/api/routes/${id}/duplicate`),

    test: (id: string, params: { method?: string; path?: string; headers?: Record<string, string>; body?: string }) =>
      this.post<ApiResponse<TestResult>>(`/api/routes/${id}/test`, params),

    health: (id: string) =>
      this.get<ApiResponse<HealthCheck>>(`/api/routes/${id}/health`),

    getVersions: (id: string) =>
      this.get<ApiResponse<RouteVersion[]>>(`/api/routes/${id}/versions`),

    restoreVersion: (id: string, versionId: string) =>
      this.post<ApiResponse<Route>>(`/api/routes/${id}/versions/${versionId}/restore`),

    getLogs: (id: string, filters: LogFilters = {}) => {
      const params = new URLSearchParams()
      if (filters.method) params.set('method', filters.method)
      if (filters.statusType) params.set('statusType', filters.statusType)
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom)
      if (filters.dateTo) params.set('dateTo', filters.dateTo)
      if (filters.page) params.set('page', String(filters.page))
      if (filters.pageSize) params.set('pageSize', String(filters.pageSize))
      const qs = params.toString()
      return this.get<PaginatedResponse<RequestLog>>(`/api/routes/${id}/logs${qs ? `?${qs}` : ''}`)
    },

    getStats: (id: string) =>
      this.get<ApiResponse<RouteStats>>(`/api/routes/${id}/stats`),

    getUptime: (id: string, days = 7) =>
      this.get<ApiResponse<{ uptimePercent: number; totalChecks: number; healthyChecks: number } | null>>(`/api/routes/${id}/uptime?days=${days}`),

    export: () =>
      this.get<{ success: boolean; data: Partial<Route>[]; exportedAt: string }>('/api/routes/export'),

    import: (routes: unknown[]) =>
      this.post<ApiResponse<{ created: number; errors: string[] }>>('/api/routes/import', { routes }),

    checkPath: (path: string, excludeId?: string) => {
      const params = new URLSearchParams({ path })
      if (excludeId) params.set('excludeId', excludeId)
      return this.get<ApiResponse<{ available: boolean; existingRoute: { id: string; name: string } | null }>>(
        `/api/routes/check-path?${params.toString()}`
      )
    },
  }

  // ============================================================================
  // Logs
  // ============================================================================

  logs = {
    getAll: (filters: LogFilters = {}) => {
      const params = new URLSearchParams()
      if (filters.routeId) params.set('routeId', filters.routeId)
      if (filters.method) params.set('method', filters.method)
      if (filters.statusType) params.set('statusType', filters.statusType)
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom)
      if (filters.dateTo) params.set('dateTo', filters.dateTo)
      if (filters.page) params.set('page', String(filters.page))
      if (filters.pageSize) params.set('pageSize', String(filters.pageSize))
      const qs = params.toString()
      return this.get<PaginatedResponse<RequestLog>>(`/api/logs${qs ? `?${qs}` : ''}`)
    },

    getErrors: (routeId?: string, limit = 10) => {
      const params = new URLSearchParams()
      if (routeId) params.set('routeId', routeId)
      params.set('limit', String(limit))
      return this.get<ApiResponse<RequestLog[]>>(`/api/logs/errors?${params.toString()}`)
    },

    getDaily: (routeId?: string, days = 7) => {
      const params = new URLSearchParams()
      if (routeId) params.set('routeId', routeId)
      params.set('days', String(days))
      return this.get<ApiResponse<{ date: string; total: number; errors: number }[]>>(
        `/api/logs/daily?${params.toString()}`
      )
    },

    cleanup: () =>
      this.delete<ApiResponse<null>>('/api/logs/cleanup'),
  }

  // ============================================================================
  // Users
  // ============================================================================

  users = {
    list: (page = 1, pageSize = 20) =>
      this.get<PaginatedResponse<User>>(`/api/users?page=${page}&pageSize=${pageSize}`),

    create: (data: { email: string; password: string; name: string; role: string }) =>
      this.post<ApiResponse<User>>('/api/users', data),

    update: (id: string, data: { name?: string; role?: string; isActive?: boolean }) =>
      this.put<ApiResponse<User>>(`/api/users/${id}`, data),

    delete: (id: string) =>
      this.delete<ApiResponse<null>>(`/api/users/${id}`),

    resetPassword: (id: string, newPassword: string) =>
      this.post<ApiResponse<null>>(`/api/users/${id}/reset-password`, { newPassword }),

    invite: (email: string, role: string) =>
      this.post<ApiResponse<{ id: string; email: string; role: string; token: string; expiresAt: string }>>('/api/users/invite', { email, role }),

    getInvites: () =>
      this.get<ApiResponse<{ id: string; email: string; role: string; expiresAt: string; createdAt: string; createdBy: { id: string; name: string } | null }[]>>('/api/users/invites'),

    revokeInvite: (id: string) =>
      this.delete<ApiResponse<null>>(`/api/users/invites/${id}`),
  }

  // ============================================================================
  // Health
  // ============================================================================

  health = {
    status: () =>
      this.get<{
        status: string
        uptime: number
        database: { status: string; latency: number }
        memory: { heapUsed: number; heapTotal: number; rss: number }
      }>('/api/health/status'),
  }

  // ============================================================================
  // Audit Logs
  // ============================================================================

  audit = {
    list: (filters: AuditLogFilters = {}) => {
      const params = new URLSearchParams()
      if (filters.userId) params.set('userId', filters.userId)
      if (filters.action) params.set('action', filters.action)
      if (filters.resource) params.set('resource', filters.resource)
      if (filters.resourceId) params.set('resourceId', filters.resourceId)
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom)
      if (filters.dateTo) params.set('dateTo', filters.dateTo)
      if (filters.page) params.set('page', String(filters.page))
      if (filters.pageSize) params.set('pageSize', String(filters.pageSize))
      const qs = params.toString()
      return this.get<PaginatedResponse<AuditLog>>(`/api/audit${qs ? `?${qs}` : ''}`)
    },
  }

  // ============================================================================
  // API Keys
  // ============================================================================

  apiKeys = {
    list: (routeId: string) =>
      this.get<ApiResponse<ApiKey[]>>(`/api/routes/${routeId}/api-keys`),

    create: (routeId: string, data: { name: string; expiresAt?: string }) =>
      this.post<ApiResponse<ApiKey & { key: string }>>(`/api/routes/${routeId}/api-keys`, data),

    revoke: (routeId: string, keyId: string) =>
      this.post<ApiResponse<null>>(`/api/routes/${routeId}/api-keys/${keyId}/revoke`),

    delete: (routeId: string, keyId: string) =>
      this.delete<ApiResponse<null>>(`/api/routes/${routeId}/api-keys/${keyId}`),
  }

  // ============================================================================
  // System
  // ============================================================================

  system = {
    version: () =>
      this.get<ApiResponse<{ version: string }>>('/api/system/version'),

    updateCheck: () =>
      this.get<ApiResponse<{
        currentVersion: string
        backend: { image: string; currentTag: string; latestTag: string | null; updateAvailable: boolean; checkedAt: string }
        frontend: { image: string; currentTag: string; latestTag: string | null; updateAvailable: boolean; checkedAt: string }
        updateAvailable: boolean
        releaseUrl: string | null
        checkedAt: string
      }>>('/api/system/update-check'),

    update: () =>
      this.post<{ success: boolean; data: { success: boolean; message: string; environment: string; instructions: string[] } }>('/api/system/update'),

    config: () =>
      this.get<ApiResponse<{
        logRetentionDays: number
        proxyTimeout: number
        rateLimitWindowMs: number
        rateLimitMax: number
        authRateLimitMax: number
        metricsEnabled: boolean
        logLevel: string
        jwtExpiresIn: string
        nodeEnv: string
      }>>('/api/system/config'),

    stats: () =>
      this.get<ApiResponse<{
        counts: { users: number; routes: number; activeRoutes: number; requestLogs: number; auditLogs: number; apiKeys: number; healthChecks: number }
        database: { size: string | null; oldestLog: string | null }
        system: { uptime: number; version: string; nodeVersion: string; platform: string; memory: { heapUsed: number; heapTotal: number; rss: number } }
      }>>('/api/system/stats'),

    triggerHealthChecks: () =>
      this.post<ApiResponse<{ message: string }>>('/api/system/health-check'),

    cleanupLogs: (days?: number) =>
      this.post<ApiResponse<{ deleted: number; retentionDays: number }>>('/api/system/cleanup-logs', days ? { days } : undefined),

    cleanupHealthChecks: (days?: number) =>
      this.post<ApiResponse<{ deleted: number; retentionDays: number }>>('/api/system/cleanup-health-checks', days ? { days } : undefined),

    cleanupAuditLogs: (days?: number) =>
      this.post<ApiResponse<{ deleted: number; retentionDays: number }>>('/api/system/cleanup-audit-logs', days ? { days } : undefined),

    exportAuditLogs: () =>
      this.get<{ success: boolean; data: any[]; exportedAt: string; count: number }>('/api/system/audit-export'),

    forceLogoutAll: () =>
      this.post<ApiResponse<{ affectedUsers: number; message: string }>>('/api/system/force-logout-all'),
  }

  // ============================================================================
  // Notifications
  // ============================================================================

  notifications = {
    list: (unreadOnly = false) =>
      this.get<ApiResponse<Notification[]>>(`/api/notifications${unreadOnly ? '?unreadOnly=true' : ''}`),

    unreadCount: () =>
      this.get<ApiResponse<{ count: number }>>('/api/notifications/count'),

    markAsRead: (id: string) =>
      this.post<ApiResponse<null>>(`/api/notifications/${id}/read`),

    markAllAsRead: () =>
      this.post<ApiResponse<null>>('/api/notifications/read-all'),
  }
}

export const api = new ApiClient(API_URL)
