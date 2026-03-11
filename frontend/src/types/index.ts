// =============================================================================
// ClusterGate - TypeScript Types
// =============================================================================

export type Role = 'ADMIN' | 'OPERATOR' | 'VIEWER'
export type RouteStatus = 'DRAFT' | 'PUBLISHED'
export type AuthType = 'NONE' | 'API_KEY' | 'BASIC' | 'BEARER'
export type HealthStatus = 'HEALTHY' | 'UNHEALTHY' | 'UNKNOWN'
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'

export interface User {
  id: string
  email: string
  name: string
  role: Role
  isActive: boolean
  twoFactorEnabled: boolean
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
}

export interface RewriteRule {
  from: string
  to: string
}

export interface Route {
  id: string
  name: string
  description: string | null
  publicPath: string
  targetUrl: string
  methods: HttpMethod[]
  isActive: boolean
  status: RouteStatus
  tags: string[]
  version: number

  // Proxy settings
  timeout: number
  retryCount: number
  retryDelay: number
  stripPrefix: boolean
  sslVerify: boolean
  requestBodyLimit: string

  // Header rules
  addHeaders: Record<string, string>
  removeHeaders: string[]
  rewriteRules: RewriteRule[]

  // CORS
  corsEnabled: boolean
  corsOrigins: string[]

  // Security
  ipAllowlist: string[]
  requireAuth: boolean
  authType: AuthType
  authValue: string | null
  webhookSecret: string | null

  // Rate limiting
  rateLimitEnabled: boolean
  rateLimitMax: number
  rateLimitWindow: number

  // Maintenance
  maintenanceMode: boolean
  maintenanceMessage: string | null

  deletedAt: string | null
  createdAt: string
  updatedAt: string

  // Relations
  createdBy: { id: string; name: string; email: string } | null
  updatedBy: { id: string; name: string; email: string } | null
  healthChecks?: HealthCheck[]
  apiKeys?: ApiKey[]
  _count?: { requestLogs: number; versions?: number }
}

export interface RouteVersion {
  id: string
  routeId: string
  version: number
  snapshot: Route
  createdById: string | null
  createdBy: { id: string; name: string; email: string } | null
  createdAt: string
}

export interface RequestLog {
  id: string
  routeId: string | null
  route: { id: string; name: string } | null
  requestId: string
  method: string
  path: string
  queryParams: Record<string, unknown>
  requestHeaders: Record<string, string>
  requestBody: string | null
  responseStatus: number | null
  responseHeaders: Record<string, string>
  responseBody: string | null
  duration: number | null
  targetUrl: string
  error: string | null
  ip: string | null
  userAgent: string | null
  createdAt: string
}

export interface ApiKey {
  id: string
  routeId: string
  name: string
  isActive: boolean
  lastUsedAt: string | null
  expiresAt: string | null
  createdAt: string
}

export interface HealthCheck {
  id: string
  routeId: string
  status: HealthStatus
  lastCheckedAt: string
  responseTime: number | null
  error: string | null
  createdAt: string
}

export interface DailyStats {
  date: string
  total: number
  errors: number
}

export interface RouteStats {
  total: number
  errors: number
  successRate: number
  avgDuration: number
  p95Duration: number | null
  daily: DailyStats[]
}

// API Response types
export interface ApiResponse<T> {
  success: boolean
  data: T
  message?: string
}

export interface PaginatedResponse<T> {
  success: boolean
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface ApiError {
  code: string
  message: string
  details?: unknown
}

// Form types
export interface RouteFormData {
  name: string
  description?: string
  publicPath: string
  targetUrl: string
  methods: HttpMethod[]
  tags: string[]
  timeout: number
  retryCount: number
  retryDelay: number
  stripPrefix: boolean
  sslVerify: boolean
  requestBodyLimit: string
  addHeaders: Record<string, string>
  removeHeaders: string[]
  rewriteRules: RewriteRule[]
  corsEnabled: boolean
  corsOrigins: string[]
  ipAllowlist: string[]
  requireAuth: boolean
  authType: AuthType
  authValue?: string
  webhookSecret?: string
  rateLimitEnabled: boolean
  rateLimitMax: number
  rateLimitWindow: number
  maintenanceMode: boolean
  maintenanceMessage?: string
}

// Filter types
export interface RouteFilters {
  search?: string
  status?: RouteStatus
  isActive?: boolean
  tags?: string[]
  page?: number
  pageSize?: number
  sortBy?: string
  sortDir?: 'asc' | 'desc'
}

export interface LogFilters {
  routeId?: string
  method?: string
  statusType?: 'success' | 'error'
  dateFrom?: string
  dateTo?: string
  page?: number
  pageSize?: number
}

// Test result
export interface TestResult {
  status: number
  duration: number
  headers: Record<string, string>
  body?: string
  error?: string
}

// Audit log
export interface AuditLog {
  id: string
  userId: string | null
  user: { id: string; name: string; email: string } | null
  action: string
  resource: string
  resourceId: string | null
  details: Record<string, unknown>
  ip: string | null
  userAgent: string | null
  createdAt: string
}

export interface AuditLogFilters {
  userId?: string
  action?: string
  resource?: string
  resourceId?: string
  dateFrom?: string
  dateTo?: string
  page?: number
  pageSize?: number
}

// Notification
export interface Notification {
  id: string
  userId: string | null
  type: string
  title: string
  message: string
  isRead: boolean
  routeId: string | null
  route: { id: string; name: string } | null
  createdAt: string
}
