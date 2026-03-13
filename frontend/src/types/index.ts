// =============================================================================
// ClusterGate - TypeScript Types
// =============================================================================

export type Role = 'ADMIN' | 'OPERATOR' | 'VIEWER'
export type RouteStatus = 'DRAFT' | 'PUBLISHED'
export type AuthType = 'NONE' | 'API_KEY' | 'BASIC' | 'BEARER'
export type HealthStatus = 'HEALTHY' | 'UNHEALTHY' | 'UNKNOWN'
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'
export type LBStrategy = 'ROUND_ROBIN' | 'WEIGHTED' | 'FAILOVER'
export type TransformPhase = 'REQUEST' | 'RESPONSE'
export type TransformType = 'SET_HEADER' | 'REMOVE_HEADER' | 'REWRITE_BODY_JSON' | 'SET_QUERY_PARAM' | 'REMOVE_QUERY_PARAM' | 'MAP_STATUS_CODE'
export type OrgRole = 'OWNER' | 'ADMIN' | 'MEMBER'
export type IncidentStatus = 'ACTIVE' | 'INVESTIGATING' | 'RESOLVED'
export type IncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type ChangeRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'APPLIED'

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

  // WebSocket
  wsEnabled: boolean

  // Circuit Breaker
  circuitBreakerEnabled: boolean
  cbFailureThreshold: number
  cbRecoveryTimeout: number
  cbState: string
  cbFailureCount: number
  cbLastFailureAt: string | null
  cbOpenedAt: string | null

  // Load Balancing
  lbStrategy: LBStrategy

  // Group & Org
  routeGroupId: string | null
  organizationId: string | null

  deletedAt: string | null
  createdAt: string
  updatedAt: string

  // Relations
  createdBy: { id: string; name: string; email: string } | null
  updatedBy: { id: string; name: string; email: string } | null
  organization?: { id: string; name: string; slug: string } | null
  routeGroup?: RouteGroup | null
  healthChecks?: HealthCheck[]
  apiKeys?: ApiKey[]
  targets?: RouteTarget[]
  transformRules?: TransformRule[]
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
  // WebSocket
  wsEnabled?: boolean
  // Circuit Breaker
  circuitBreakerEnabled?: boolean
  cbFailureThreshold?: number
  cbRecoveryTimeout?: number
  // Load Balancing
  lbStrategy?: LBStrategy
  // Group & Org
  routeGroupId?: string | null
  organizationId?: string | null
}

// Filter types
export interface RouteFilters {
  search?: string
  status?: RouteStatus
  isActive?: boolean
  tags?: string[]
  organizationId?: string
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

// ============================================================================
// Route Targets (Load Balancing)
// ============================================================================

export interface RouteTarget {
  id: string
  routeId: string
  url: string
  weight: number
  priority: number
  isHealthy: boolean
  lastError: string | null
  createdAt: string
  updatedAt: string
}

// ============================================================================
// Transform Rules
// ============================================================================

export interface TransformRule {
  id: string
  routeId: string
  phase: TransformPhase
  type: TransformType
  name: string
  config: Record<string, any>
  order: number
  isActive: boolean
  condition: Record<string, any> | null
  createdAt: string
  updatedAt: string
}

// ============================================================================
// Route Groups
// ============================================================================

export interface RouteGroup {
  id: string
  name: string
  description: string | null
  pathPrefix: string
  teamId: string | null
  team?: { id: string; name: string } | null
  isActive: boolean
  defaultTimeout: number | null
  defaultRetryCount: number | null
  defaultRateLimitEnabled: boolean | null
  defaultRateLimitMax: number | null
  defaultRateLimitWindow: number | null
  defaultAuthType: AuthType | null
  defaultCorsEnabled: boolean | null
  defaultCorsOrigins: string[]
  defaultIpAllowlist: string[]
  // Change request policy (null = inherit from org)
  changeRequestsEnabled: boolean | null
  crBypassRoles: OrgRole[]
  crApproverRoles: OrgRole[]
  routes?: { id: string; name: string; publicPath: string; status: RouteStatus; isActive: boolean }[]
  _count?: { routes: number }
  createdAt: string
  updatedAt: string
}

// ============================================================================
// Organizations & Teams
// ============================================================================

export interface Organization {
  id: string
  name: string
  slug: string
  description: string | null
  isActive: boolean
  changeRequestsEnabled: boolean
  crBypassRoles: OrgRole[]
  crApproverRoles: OrgRole[]
  memberships?: OrgMembership[]
  teams?: Team[]
  _count?: { memberships: number; teams: number; routes: number }
  createdAt: string
  updatedAt: string
}

export interface OrgMembership {
  id: string
  userId: string
  organizationId: string
  role: OrgRole
  user?: { id: string; name: string; email: string; role: Role }
  createdAt: string
  updatedAt: string
}

export interface Team {
  id: string
  organizationId: string
  name: string
  description: string | null
  members?: TeamMembership[]
  routeGroups?: RouteGroup[]
  _count?: { members: number; routeGroups: number }
  createdAt: string
  updatedAt: string
}

export interface TeamMembership {
  id: string
  userId: string
  teamId: string
  user?: { id: string; name: string; email: string }
  createdAt: string
}

// ============================================================================
// Incidents
// ============================================================================

export interface Incident {
  id: string
  title: string
  description: string | null
  status: IncidentStatus
  severity: IncidentSeverity
  routeId: string | null
  route?: { id: string; name: string; publicPath: string } | null
  startedAt: string
  resolvedAt: string | null
  createdAt: string
  updatedAt: string
  events?: IncidentEvent[]
  _count?: { events: number }
}

export interface IncidentEvent {
  id: string
  incidentId: string
  type: string
  title: string
  description: string | null
  metadata: Record<string, any>
  createdById: string | null
  createdAt: string
}

// ============================================================================
// Change Requests
// ============================================================================

export interface ChangeRequest {
  id: string
  routeId: string | null
  route?: { id: string; name: string; publicPath: string; targetUrl?: string } | null
  type: string
  status: ChangeRequestStatus
  title: string
  description: string | null
  payload: Record<string, any>
  diff: Record<string, any> | null
  requestedById: string
  requestedBy?: { id: string; name: string; email: string }
  reviewedById: string | null
  reviewedBy?: { id: string; name: string; email: string } | null
  reviewComment: string | null
  reviewedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CRPolicy {
  required: boolean
  bypassRoles: OrgRole[]
  approverRoles: OrgRole[]
  source: 'none' | 'organization' | 'group'
  canBypass: boolean
  canApprove: boolean
}

// ============================================================================
// Achievements
// ============================================================================

export interface Achievement {
  key: string
  title: string
  description: string
  icon: string
  rarity: 'common' | 'rare' | 'epic' | 'legendary'
  unlocked: boolean
  unlockedAt: string | null
}

// ============================================================================
// Traffic Map
// ============================================================================

export interface TrafficCountry {
  country: string
  lat: number
  lng: number
  count: number
  avgDuration: number
}

export interface TrafficCity {
  city: string
  country: string
  lat: number
  lng: number
  count: number
}

export interface TrafficMapData {
  countries: TrafficCountry[]
  cities: TrafficCity[]
  total: number
  hours: number
}

// ============================================================================
// Sanitizer
// ============================================================================

export interface SanitizerConfig {
  enabled: boolean
  maskEmails: boolean
  maskCreditCards: boolean
  maskSSNs: boolean
  maskPhoneNumbers: boolean
  maskIBANs: boolean
  customPatterns: { name: string; pattern: string; replacement: string }[]
}
