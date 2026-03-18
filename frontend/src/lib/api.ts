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
  RouteTarget,
  TransformRule,
  RouteGroup,
  Organization,
  Team,
  Incident,
  ChangeRequest,
  CRPolicy,
  Achievement,
  TrafficMapData,
  SanitizerConfig,
  ApiResponse,
  PaginatedResponse,
} from '@/types'

const API_URL = process.env.NEXT_PUBLIC_API_URL || ''

class ApiClient {
  private baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  private getCsrfToken(): string | null {
    if (typeof document === 'undefined') return null
    const match = document.cookie.match(/(?:^|;\s*)cg_csrf=([^;]+)/)
    return match ? match[1] : null
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`
    const csrfToken = this.getCsrfToken()

    const response = await fetch(url, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
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

    // 2FA
    twoFactorVerify: (tempToken: string, code: string) =>
      this.post<ApiResponse<{ user: User }>>('/api/auth/2fa/verify', { tempToken, code }),

    twoFactorSetup: () =>
      this.post<ApiResponse<{ uri: string; secret: string }>>('/api/auth/2fa/setup'),

    twoFactorEnable: (token: string) =>
      this.post<ApiResponse<{ recoveryCodes: string[] }>>('/api/auth/2fa/enable', { token }),

    twoFactorDisable: (password: string) =>
      this.post<ApiResponse<null>>('/api/auth/2fa/disable', { password }),
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
      if (filters.organizationId) params.set('organizationId', filters.organizationId)
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

    test: (id: string, params: { method?: string; path?: string; headers?: Record<string, string>; body?: string; skipAuth?: boolean }) =>
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

    bulkPublish: (ids: string[]) =>
      this.post<ApiResponse<{ count: number }>>('/api/routes/bulk/publish', { ids }),

    bulkDeactivate: (ids: string[]) =>
      this.post<ApiResponse<{ count: number }>>('/api/routes/bulk/deactivate', { ids }),

    bulkDelete: (ids: string[]) =>
      this.post<ApiResponse<{ count: number }>>('/api/routes/bulk/delete', { ids }),
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

    restore: (id: string) =>
      this.post<ApiResponse<User>>(`/api/users/${id}/restore`),

    disable2FA: (id: string) =>
      this.post<ApiResponse<User>>(`/api/users/${id}/disable-2fa`),

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

    releaseNotes: (tag?: string) =>
      this.get<ApiResponse<{ tag: string; name: string; body: string; publishedAt: string; htmlUrl: string } | null>>(
        `/api/system/release-notes${tag ? `?tag=${encodeURIComponent(tag)}` : ''}`
      ),

    updateStatus: () =>
      this.get<ApiResponse<{
        currentVersion: string
        backend: { image: string; currentTag: string; latestTag: string | null; updateAvailable: boolean; checkedAt: string }
        frontend: { image: string; currentTag: string; latestTag: string | null; updateAvailable: boolean; checkedAt: string }
        updateAvailable: boolean
        releaseUrl: string | null
        checkedAt: string
      } | null>>('/api/system/update-status'),

    updateCheck: () =>
      this.get<ApiResponse<{
        currentVersion: string
        backend: { image: string; currentTag: string; latestTag: string | null; updateAvailable: boolean; checkedAt: string }
        frontend: { image: string; currentTag: string; latestTag: string | null; updateAvailable: boolean; checkedAt: string }
        updateAvailable: boolean
        releaseUrl: string | null
        checkedAt: string
      }>>('/api/system/update-check'),

    update: (onEvent: (event: any) => void): Promise<void> => {
      const csrf = this.getCsrfToken()
      return new Promise((resolve, reject) => {
        fetch(`${this.baseUrl}/api/system/update`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
          },
        }).then(response => {
          if (!response.ok || !response.body) {
            reject(new Error(`Update failed with status ${response.status}`))
            return
          }
          const reader = response.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ''

          const read = (): Promise<void> => reader.read().then(({ done, value }) => {
            if (done) { resolve(); return }
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try { onEvent(JSON.parse(line.slice(6))) } catch {}
              }
            }
            return read()
          })
          read().catch(reject)
        }).catch(reject)
      })
    },

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
  // Analytics
  // ============================================================================

  analytics = {
    overview: (routeId?: string, days?: number) => {
      const params = new URLSearchParams()
      if (routeId) params.set('routeId', routeId)
      if (days) params.set('days', String(days))
      const qs = params.toString()
      return this.get<ApiResponse<{
        totalRequests: number
        avgResponseTime: number
        errorRate: number
        p50: number
        p95: number
        p99: number
      }>>(`/api/analytics/overview${qs ? `?${qs}` : ''}`)
    },

    latencyTrend: (routeId?: string, days?: number, granularity?: 'hour' | 'day') => {
      const params = new URLSearchParams()
      if (routeId) params.set('routeId', routeId)
      if (days) params.set('days', String(days))
      if (granularity) params.set('granularity', granularity)
      const qs = params.toString()
      return this.get<ApiResponse<{
        timestamp: string
        p50: number
        p95: number
        p99: number
        count: number
      }[]>>(`/api/analytics/latency-trend${qs ? `?${qs}` : ''}`)
    },

    errorTrend: (routeId?: string, days?: number) => {
      const params = new URLSearchParams()
      if (routeId) params.set('routeId', routeId)
      if (days) params.set('days', String(days))
      const qs = params.toString()
      return this.get<ApiResponse<{
        timestamp: string
        total: number
        errors: number
        errorRate: number
      }[]>>(`/api/analytics/error-trend${qs ? `?${qs}` : ''}`)
    },

    heatmap: (routeId?: string, days?: number) => {
      const params = new URLSearchParams()
      if (routeId) params.set('routeId', routeId)
      if (days) params.set('days', String(days))
      const qs = params.toString()
      return this.get<ApiResponse<{
        dayOfWeek: number
        hour: number
        count: number
      }[]>>(`/api/analytics/heatmap${qs ? `?${qs}` : ''}`)
    },

    slowest: (limit?: number) => {
      const params = new URLSearchParams()
      if (limit) params.set('limit', String(limit))
      const qs = params.toString()
      return this.get<ApiResponse<{
        routeId: string
        routeName: string
        publicPath: string
        avgDuration: number
        p95Duration: number
        requestCount: number
      }[]>>(`/api/analytics/slowest${qs ? `?${qs}` : ''}`)
    },

    statusDistribution: (routeId?: string, days?: number) => {
      const params = new URLSearchParams()
      if (routeId) params.set('routeId', routeId)
      if (days) params.set('days', String(days))
      const qs = params.toString()
      return this.get<ApiResponse<{
        bucket: string
        count: number
      }[]>>(`/api/analytics/status-distribution${qs ? `?${qs}` : ''}`)
    },

    dashboardSummary: (days?: number) => {
      const params = new URLSearchParams()
      if (days) params.set('days', String(days))
      const qs = params.toString()
      return this.get<ApiResponse<{
        totalRequests: number
        avgResponseTime: number
        errorRate: number
        previousTotalRequests: number
        previousAvgResponseTime: number
        previousErrorRate: number
      }>>(`/api/analytics/dashboard-summary${qs ? `?${qs}` : ''}`)
    },
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

  // ============================================================================
  // Backups
  // ============================================================================

  backups = {
    list: () =>
      this.get<ApiResponse<{ filename: string; size: number; createdAt: string }[]>>('/api/backups'),

    create: () =>
      this.post<ApiResponse<{ filename: string; size: number; createdAt: string }>>('/api/backups'),

    restore: (filename: string) =>
      this.post<ApiResponse<null>>(`/api/backups/${encodeURIComponent(filename)}/restore`),

    delete: (filename: string) =>
      this.delete<ApiResponse<null>>(`/api/backups/${encodeURIComponent(filename)}`),

    downloadUrl: (filename: string) =>
      `${this.baseUrl}/api/backups/${encodeURIComponent(filename)}/download`,
  }

  // ============================================================================
  // Route Targets (Load Balancing)
  // ============================================================================

  targets = {
    list: (routeId: string) =>
      this.get<ApiResponse<RouteTarget[]>>(`/api/routes/${routeId}/targets`),

    create: (routeId: string, data: { url: string; weight?: number; priority?: number }) =>
      this.post<ApiResponse<RouteTarget>>(`/api/routes/${routeId}/targets`, data),

    update: (routeId: string, targetId: string, data: { url?: string; weight?: number; priority?: number; isHealthy?: boolean }) =>
      this.put<ApiResponse<RouteTarget>>(`/api/routes/${routeId}/targets/${targetId}`, data),

    delete: (routeId: string, targetId: string) =>
      this.delete<ApiResponse<null>>(`/api/routes/${routeId}/targets/${targetId}`),
  }

  // ============================================================================
  // Transform Rules
  // ============================================================================

  transforms = {
    list: (routeId: string) =>
      this.get<ApiResponse<TransformRule[]>>(`/api/routes/${routeId}/transforms`),

    create: (routeId: string, data: { phase: string; type: string; name: string; config: Record<string, any>; order?: number; isActive?: boolean; condition?: Record<string, any> | null }) =>
      this.post<ApiResponse<TransformRule>>(`/api/routes/${routeId}/transforms`, data),

    update: (routeId: string, ruleId: string, data: Partial<{ phase: string; type: string; name: string; config: Record<string, any>; order: number; isActive: boolean; condition: Record<string, any> | null }>) =>
      this.put<ApiResponse<TransformRule>>(`/api/routes/${routeId}/transforms/${ruleId}`, data),

    delete: (routeId: string, ruleId: string) =>
      this.delete<ApiResponse<null>>(`/api/routes/${routeId}/transforms/${ruleId}`),
  }

  // ============================================================================
  // Route Groups
  // ============================================================================

  routeGroups = {
    list: (filters?: { teamId?: string; search?: string }) => {
      const params = new URLSearchParams()
      if (filters?.teamId) params.set('teamId', filters.teamId)
      if (filters?.search) params.set('search', filters.search)
      const qs = params.toString()
      return this.get<ApiResponse<RouteGroup[]>>(`/api/route-groups${qs ? `?${qs}` : ''}`)
    },

    getById: (id: string) =>
      this.get<ApiResponse<RouteGroup>>(`/api/route-groups/${id}`),

    create: (data: { name: string; pathPrefix: string; description?: string; teamId?: string; [key: string]: any }) =>
      this.post<ApiResponse<RouteGroup>>('/api/route-groups', data),

    update: (id: string, data: Partial<RouteGroup>) =>
      this.put<ApiResponse<RouteGroup>>(`/api/route-groups/${id}`, data),

    delete: (id: string) =>
      this.delete<ApiResponse<null>>(`/api/route-groups/${id}`),

    assignRoute: (groupId: string, routeId: string) =>
      this.post<ApiResponse<Route>>(`/api/route-groups/${groupId}/routes/${routeId}`),

    removeRoute: (groupId: string, routeId: string) =>
      this.delete<ApiResponse<Route>>(`/api/route-groups/${groupId}/routes/${routeId}`),
  }

  // ============================================================================
  // Organizations
  // ============================================================================

  organizations = {
    list: () =>
      this.get<ApiResponse<Organization[]>>('/api/organizations'),

    getById: (id: string) =>
      this.get<ApiResponse<Organization>>(`/api/organizations/${id}`),

    create: (data: { name: string; slug: string; description?: string }) =>
      this.post<ApiResponse<Organization>>('/api/organizations', data),

    update: (id: string, data: Partial<{ name: string; description: string | null; isActive: boolean }>) =>
      this.put<ApiResponse<Organization>>(`/api/organizations/${id}`, data),

    delete: (id: string) =>
      this.delete<ApiResponse<null>>(`/api/organizations/${id}`),

    addMember: (orgId: string, userId: string, role?: string) =>
      this.post<ApiResponse<any>>(`/api/organizations/${orgId}/members`, { userId, role }),

    updateMemberRole: (orgId: string, userId: string, role: string) =>
      this.put<ApiResponse<any>>(`/api/organizations/${orgId}/members/${userId}`, { role }),

    removeMember: (orgId: string, userId: string) =>
      this.delete<ApiResponse<null>>(`/api/organizations/${orgId}/members/${userId}`),

    // Teams
    getTeams: (orgId: string) =>
      this.get<ApiResponse<Team[]>>(`/api/organizations/${orgId}/teams`),

    getTeam: (orgId: string, teamId: string) =>
      this.get<ApiResponse<Team>>(`/api/organizations/${orgId}/teams/${teamId}`),

    createTeam: (orgId: string, data: { name: string; description?: string }) =>
      this.post<ApiResponse<Team>>(`/api/organizations/${orgId}/teams`, data),

    updateTeam: (orgId: string, teamId: string, data: { name?: string; description?: string | null }) =>
      this.put<ApiResponse<Team>>(`/api/organizations/${orgId}/teams/${teamId}`, data),

    deleteTeam: (orgId: string, teamId: string) =>
      this.delete<ApiResponse<null>>(`/api/organizations/${orgId}/teams/${teamId}`),

    addTeamMember: (orgId: string, teamId: string, userId: string) =>
      this.post<ApiResponse<any>>(`/api/organizations/${orgId}/teams/${teamId}/members`, { userId }),

    removeTeamMember: (orgId: string, teamId: string, userId: string) =>
      this.delete<ApiResponse<null>>(`/api/organizations/${orgId}/teams/${teamId}/members/${userId}`),
  }

  // ============================================================================
  // Incidents
  // ============================================================================

  incidents = {
    list: (filters?: { status?: string; routeId?: string; page?: number; pageSize?: number }) => {
      const params = new URLSearchParams()
      if (filters?.status) params.set('status', filters.status)
      if (filters?.routeId) params.set('routeId', filters.routeId)
      if (filters?.page) params.set('page', String(filters.page))
      if (filters?.pageSize) params.set('pageSize', String(filters.pageSize))
      const qs = params.toString()
      return this.get<PaginatedResponse<Incident>>(`/api/incidents${qs ? `?${qs}` : ''}`)
    },

    getById: (id: string) =>
      this.get<ApiResponse<Incident>>(`/api/incidents/${id}`),

    create: (data: { title: string; description?: string; severity?: string; routeId?: string }) =>
      this.post<ApiResponse<Incident>>('/api/incidents', data),

    updateStatus: (id: string, status: string) =>
      this.request<ApiResponse<Incident>>(`/api/incidents/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),

    addEvent: (id: string, data: { type: string; title: string; description?: string; metadata?: Record<string, any> }) =>
      this.post<ApiResponse<any>>(`/api/incidents/${id}/events`, data),

    dismiss: (id: string) =>
      this.request<ApiResponse<Incident>>(`/api/incidents/${id}/dismiss`, {
        method: 'PATCH',
      }),

    delete: (id: string) =>
      this.request<ApiResponse<null>>(`/api/incidents/${id}`, {
        method: 'DELETE',
      }),
  }

  // ============================================================================
  // Change Requests
  // ============================================================================

  changeRequests = {
    list: (filters?: { status?: string; routeId?: string; page?: number; pageSize?: number }) => {
      const params = new URLSearchParams()
      if (filters?.status) params.set('status', filters.status)
      if (filters?.routeId) params.set('routeId', filters.routeId)
      if (filters?.page) params.set('page', String(filters.page))
      if (filters?.pageSize) params.set('pageSize', String(filters.pageSize))
      const qs = params.toString()
      return this.get<PaginatedResponse<ChangeRequest>>(`/api/change-requests${qs ? `?${qs}` : ''}`)
    },

    getById: (id: string) =>
      this.get<ApiResponse<ChangeRequest>>(`/api/change-requests/${id}`),

    pendingCount: () =>
      this.get<ApiResponse<{ count: number }>>('/api/change-requests/pending-count'),

    checkRequired: (routeId: string) =>
      this.get<ApiResponse<{ required: boolean }>>(`/api/change-requests/check/${routeId}`),

    getPolicy: (routeId: string) =>
      this.get<ApiResponse<CRPolicy>>(`/api/change-requests/policy/${routeId}`),

    create: (data: { routeId?: string; type: string; title: string; description?: string; payload: Record<string, any>; diff?: Record<string, any> }) =>
      this.post<ApiResponse<ChangeRequest>>('/api/change-requests', data),

    approve: (id: string, comment?: string) =>
      this.post<ApiResponse<ChangeRequest>>(`/api/change-requests/${id}/approve`, { comment }),

    reject: (id: string, comment?: string) =>
      this.post<ApiResponse<ChangeRequest>>(`/api/change-requests/${id}/reject`, { comment }),
  }

  // ============================================================================
  // Achievements
  // ============================================================================

  achievements = {
    list: () =>
      this.get<ApiResponse<Achievement[]>>('/api/achievements'),

    count: () =>
      this.get<ApiResponse<{ count: number; total: number }>>('/api/achievements/count'),

    triggerParty: () =>
      this.post<ApiResponse<null>>('/api/achievements/party'),
  }

  // ============================================================================
  // Traffic Map
  // ============================================================================

  traffic = {
    map: (hours = 24) =>
      this.get<ApiResponse<TrafficMapData>>(`/api/traffic/map?hours=${hours}`),

    liveUrl: () => `${this.baseUrl}/api/traffic/live`,
  }

  // ============================================================================
  // Sanitizer
  // ============================================================================

  sanitizer = {
    getConfig: () =>
      this.get<ApiResponse<SanitizerConfig>>('/api/traffic/sanitizer'),

    updateConfig: (data: Partial<SanitizerConfig>) =>
      this.put<ApiResponse<SanitizerConfig>>('/api/traffic/sanitizer', data),

    test: (text: string) =>
      this.post<ApiResponse<{ original: string; sanitized: string }>>('/api/traffic/sanitizer/test', { text }),
  }
}

export const api = new ApiClient(API_URL)
