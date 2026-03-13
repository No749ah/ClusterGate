import axios, { AxiosError, AxiosRequestConfig } from 'axios'
import https from 'https'
import { Request, Response } from 'express'
import { createHmac, timingSafeEqual } from 'crypto'
import { validateWebhookSignature, isSafeRegex } from '../lib/security'
import { Route, RouteTarget, TransformRule } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { logger } from '../lib/logger'
import { AppError } from '../lib/errors'
import { checkRateLimit } from '../lib/rateLimitStore'
import { proxyRequestsTotal, proxyRequestDuration } from '../lib/metrics'
import { notifyRouteError } from './notificationService'
import { checkCircuitBreaker, recordSuccess, recordFailure } from './circuitBreakerService'
import { selectTarget, markTargetUnhealthy, markTargetHealthy } from './loadBalancerService'
import { applyRequestTransforms, applyResponseTransforms } from './transformService'
import { lookupIp } from './geoipService'
import { sanitizeText } from './sanitizerService'
import { v4 as uuid } from 'uuid'

// Extended route type with relations loaded by proxyHandler
type RouteWithRelations = Route & {
  targets?: RouteTarget[]
  transformRules?: TransformRule[]
}

// Headers to never forward to target — 'upgrade' removed to support WebSocket
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'host',
])

export async function proxyRequest(route: RouteWithRelations | Route, req: Request, res: Response): Promise<void> {
  const start = Date.now()
  const requestId = uuid()
  const routeExt = route as RouteWithRelations

  // ---- Circuit Breaker check ----
  if (route.circuitBreakerEnabled) {
    const cbResult = await checkCircuitBreaker(route)
    if (!cbResult.allowed) {
      res.setHeader('X-CircuitBreaker-State', cbResult.state)
      throw AppError.serviceUnavailable('Circuit breaker is OPEN — requests are temporarily blocked')
    }
    res.setHeader('X-CircuitBreaker-State', cbResult.state)
  }

  // Validate IP allowlist
  if (route.ipAllowlist.length > 0) {
    const clientIp = req.ip || req.socket.remoteAddress || ''
    if (!isIpAllowed(clientIp, route.ipAllowlist)) {
      throw AppError.forbidden('Your IP address is not allowed to access this route')
    }
  }

  // Rate limit check
  if ((route as any).rateLimitEnabled && (route as any).rateLimitMax > 0) {
    const rateLimitIp = req.ip || req.socket.remoteAddress || ''
    const result = checkRateLimit(route.id, rateLimitIp, (route as any).rateLimitMax, (route as any).rateLimitWindow)
    if (!result.allowed) {
      res.setHeader('X-RateLimit-Limit', String((route as any).rateLimitMax))
      res.setHeader('X-RateLimit-Remaining', '0')
      res.setHeader('X-RateLimit-Reset', String(result.resetAt))
      res.setHeader('Retry-After', String(Math.ceil((result.resetAt - Date.now()) / 1000)))
      throw AppError.tooManyRequests('Rate limit exceeded')
    }
    res.setHeader('X-RateLimit-Limit', String((route as any).rateLimitMax))
    res.setHeader('X-RateLimit-Remaining', String(result.remaining))
    res.setHeader('X-RateLimit-Reset', String(result.resetAt))
  }

  // Enforce ClusterGate-level authentication
  if ((route as any).requireAuth && (route as any).authType !== 'NONE') {
    validateRouteAuth(route, req)
  }

  // Validate webhook secret (timing-safe comparison)
  if (route.webhookSecret) {
    const signature = req.get('X-Hub-Signature-256') || req.get('X-Webhook-Signature')
    if (!signature) {
      throw AppError.unauthorized('Missing webhook signature')
    }
    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
    if (!validateWebhookSignature(body, route.webhookSecret, signature)) {
      throw AppError.unauthorized('Invalid webhook signature')
    }
  }

  // Build target path — strip publicPath prefix, keep only the suffix
  let targetPath = req.path
  const basePath = route.publicPath.endsWith('/*')
    ? route.publicPath.slice(0, -2)
    : route.publicPath
  if (basePath !== '/' && targetPath.startsWith(basePath)) {
    targetPath = targetPath.slice(basePath.length) || '/'
  }

  // Apply path rewrite rules (on the suffix) — skip unsafe patterns
  const rewriteRules = (route.rewriteRules as unknown as Array<{ from: string; to: string }>) || []
  for (const rule of rewriteRules) {
    if (!isSafeRegex(rule.from)) {
      logger.warn('Skipping unsafe rewrite regex', { routeId: route.id, pattern: rule.from })
      continue
    }
    const regex = new RegExp(rule.from)
    if (regex.test(targetPath)) {
      targetPath = targetPath.replace(regex, rule.to)
      break
    }
  }

  // stripPrefix: forward to targetUrl root only (no path appended)
  if (route.stripPrefix) {
    targetPath = '/'
  }

  // ---- Load Balancing: select target URL ----
  let selectedTargetUrl = route.targetUrl
  let selectedTargetId: string | null = null
  const targets = routeExt.targets
  if (targets && targets.length > 0) {
    const selected = await selectTarget(route.id, route.lbStrategy, targets)
    if (!selected) {
      throw AppError.serviceUnavailable('No healthy targets available')
    }
    selectedTargetUrl = selected.url
    selectedTargetId = selected.targetId
  }

  // Build full target URL
  const targetBase = selectedTargetUrl.replace(/\/$/, '')
  const fullTargetUrl = `${targetBase}${targetPath}`

  // Build query string
  let queryParams = { ...(req.query as Record<string, string>) }
  const queryString = Object.keys(queryParams).length
    ? `?${new URLSearchParams(queryParams).toString()}`
    : ''

  const finalUrl = `${fullTargetUrl}${queryString}`

  // Build request headers
  const forwardHeaders: Record<string, string> = {}

  for (const [key, value] of Object.entries(req.headers)) {
    const lowerKey = key.toLowerCase()
    if (!HOP_BY_HOP_HEADERS.has(lowerKey) && typeof value === 'string') {
      forwardHeaders[key] = value
    }
  }

  // Add configured headers
  const addHeaders = (route.addHeaders as unknown as Record<string, string>) || {}
  for (const [key, value] of Object.entries(addHeaders)) {
    forwardHeaders[key] = value
  }

  // Remove configured headers
  for (const header of route.removeHeaders) {
    delete forwardHeaders[header.toLowerCase()]
    delete forwardHeaders[header]
  }

  // Set proxy identification headers
  forwardHeaders['X-Forwarded-For'] = req.ip || ''
  forwardHeaders['X-Forwarded-Proto'] = req.protocol
  forwardHeaders['X-Forwarded-Host'] = req.hostname
  forwardHeaders['X-ClusterGate-Route-ID'] = route.id
  forwardHeaders['X-Request-ID'] = requestId

  // Get request body
  let requestBody: any = undefined
  if (req.body && ['POST', 'PUT', 'PATCH'].includes(req.method)) {
    requestBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
  }

  // ---- Apply request transforms ----
  const transformRules = routeExt.transformRules
  if (transformRules && transformRules.length > 0) {
    const transformed = applyRequestTransforms(transformRules, forwardHeaders, queryParams, requestBody ? JSON.parse(typeof requestBody === 'string' ? requestBody : '{}') : undefined)
    Object.assign(forwardHeaders, transformed.headers)
    queryParams = transformed.queryParams
    if (transformed.body !== undefined) {
      requestBody = typeof transformed.body === 'string' ? transformed.body : JSON.stringify(transformed.body)
    }
  }

  // Rebuild URL with potentially transformed query params
  const transformedQs = Object.keys(queryParams).length
    ? `?${new URLSearchParams(queryParams).toString()}`
    : ''
  const resolvedUrl = `${fullTargetUrl.split('?')[0]}${transformedQs}`

  const axiosConfig: AxiosRequestConfig = {
    method: req.method as AxiosRequestConfig['method'],
    url: resolvedUrl,
    headers: forwardHeaders,
    data: requestBody,
    timeout: route.timeout,
    responseType: 'arraybuffer',
    validateStatus: () => true, // Don't throw on any HTTP status
    maxRedirects: 0, // Disable redirect following to prevent SSRF via open redirectors
    decompress: true,
    httpsAgent: new https.Agent({ rejectUnauthorized: (route as any).sslVerify !== false }),
  }

  let responseStatus: number | undefined
  let responseBody: string | undefined
  let duration: number | undefined
  let error: string | undefined

  try {
    let lastError: Error | null = null
    let response: any = null

    // Retry logic
    const maxAttempts = 1 + (route.retryCount || 0)
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        await sleep(route.retryDelay || 1000)
      }

      try {
        response = await axios(axiosConfig)
        lastError = null
        break
      } catch (err) {
        lastError = err as Error
        const axiosErr = err as AxiosError
        // Only retry on network errors, not HTTP errors
        if (axiosErr.response) {
          response = axiosErr.response
          lastError = null
          break
        }
      }
    }

    if (lastError || !response) {
      throw lastError || new Error('No response received')
    }

    duration = Date.now() - start
    responseStatus = response.status

    // Forward response headers (excluding hop-by-hop)
    const respHeaders: Record<string, string> = {}
    for (const [key, value] of Object.entries(response.headers as Record<string, string>)) {
      const lowerKey = key.toLowerCase()
      if (!HOP_BY_HOP_HEADERS.has(lowerKey) && lowerKey !== 'content-encoding') {
        respHeaders[key] = value
      }
    }

    let responseBuffer = Buffer.from(response.data)

    // ---- Apply response transforms ----
    if (transformRules && transformRules.length > 0) {
      const transformed = applyResponseTransforms(transformRules, responseStatus ?? 502, respHeaders, responseBuffer)
      responseStatus = transformed.statusCode
      responseBuffer = transformed.body
      Object.keys(respHeaders).forEach((k) => delete respHeaders[k])
      Object.assign(respHeaders, transformed.headers)
    }

    // Set response headers
    for (const [key, value] of Object.entries(respHeaders)) {
      res.setHeader(key, value)
    }

    res.setHeader('X-Request-ID', requestId)
    res.setHeader('X-ClusterGate-Duration', String(duration))

    responseBody = responseBuffer.toString('utf8').slice(0, 10000) // Cap logged body

    proxyRequestsTotal.inc({
      route_id: route.id,
      method: req.method,
      status: String(responseStatus),
    })
    proxyRequestDuration.observe({ route_id: route.id }, duration / 1000)

    // Circuit breaker: record success
    if (route.circuitBreakerEnabled) {
      recordSuccess(route.id).catch(() => {})
    }

    // Load balancer: mark target healthy on success
    if (selectedTargetId) {
      markTargetHealthy(selectedTargetId).catch(() => {})
    }

    // Log request
    logRequest({
      routeId: route.id,
      requestId,
      method: req.method,
      path: req.path,
      queryParams: req.query as Record<string, string>,
      requestHeaders: sanitizeHeaders(forwardHeaders),
      requestBody: (typeof requestBody === 'string' ? requestBody : '')?.slice(0, 5000),
      responseStatus,
      responseHeaders: sanitizeHeaders(respHeaders),
      responseBody: responseBody?.slice(0, 5000),
      duration,
      targetUrl: resolvedUrl,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    })

    res.status(responseStatus || 502).send(responseBuffer)
  } catch (err) {
    duration = Date.now() - start
    error = (err as Error).message

    logger.error('Proxy request failed', {
      routeId: route.id,
      targetUrl: resolvedUrl,
      error: error,
      duration,
    })

    // Circuit breaker: record failure
    if (route.circuitBreakerEnabled) {
      recordFailure(route.id).catch(() => {})
    }

    // Load balancer: mark target unhealthy on failure
    if (selectedTargetId) {
      markTargetUnhealthy(selectedTargetId, error || 'Proxy error').catch(() => {})
    }

    // Notify admins about proxy error
    notifyRouteError(route.id, route.name, error || 'Unknown error')

    proxyRequestsTotal.inc({
      route_id: route.id,
      method: req.method,
      status: 'error',
    })

    logRequest({
      routeId: route.id,
      requestId,
      method: req.method,
      path: req.path,
      queryParams: req.query as Record<string, string>,
      requestHeaders: sanitizeHeaders(forwardHeaders),
      requestBody: (typeof requestBody === 'string' ? requestBody : '')?.slice(0, 5000),
      responseStatus,
      responseHeaders: {},
      duration,
      targetUrl: resolvedUrl,
      error: error,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    })

    throw AppError.serviceUnavailable(
      `Proxy error: ${error || 'Target service unavailable'}`
    )
  }
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) {
    // Compare against itself to keep constant time, then return false
    timingSafeEqual(bufA, bufA)
    return false
  }
  return timingSafeEqual(bufA, bufB)
}

function validateRouteAuth(route: Route, req: Request): void {
  const authType = (route as any).authType as string
  const authValue = (route as any).authValue as string | null

  if (!authValue) {
    throw AppError.internal('Route requires authentication but no auth value is configured')
  }

  switch (authType) {
    case 'API_KEY': {
      const apiKey = req.get('X-API-Key') || req.query.api_key as string
      if (!apiKey) {
        throw AppError.unauthorized('API key required — provide via X-API-Key header or api_key query parameter')
      }
      if (!safeEqual(apiKey, authValue)) {
        throw AppError.unauthorized('Invalid API key')
      }
      break
    }
    case 'BASIC': {
      const authHeader = req.get('Authorization')
      if (!authHeader || !authHeader.startsWith('Basic ')) {
        throw AppError.unauthorized('Basic authentication required')
      }
      const credentials = authHeader.slice(6) // strip "Basic "
      if (!safeEqual(credentials, authValue)) {
        throw AppError.unauthorized('Invalid credentials')
      }
      break
    }
    case 'BEARER': {
      const authHeader = req.get('Authorization')
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw AppError.unauthorized('Bearer token required')
      }
      const token = authHeader.slice(7) // strip "Bearer "
      if (!safeEqual(token, authValue)) {
        throw AppError.unauthorized('Invalid bearer token')
      }
      break
    }
    default:
      throw AppError.internal(`Unknown auth type: ${authType}`)
  }
}

function isIpAllowed(clientIp: string, allowlist: string[]): boolean {
  // Simple exact match and CIDR support (basic)
  const ip = clientIp.replace(/^::ffff:/, '') // IPv4-mapped IPv6

  for (const entry of allowlist) {
    if (entry === ip) return true
    if (entry.includes('/')) {
      // Basic CIDR check
      try {
        if (ipInCidr(ip, entry)) return true
      } catch {}
    }
  }
  return false
}

function ipInCidr(ip: string, cidr: string): boolean {
  const [range, bits] = cidr.split('/')
  const mask = ~(2 ** (32 - parseInt(bits)) - 1)
  const ipNum = ipToNum(ip)
  const rangeNum = ipToNum(range)
  return (ipNum & mask) === (rangeNum & mask)
}

function ipToNum(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0
}

function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const sensitive = ['authorization', 'cookie', 'x-auth-token', 'x-api-key']
  const sanitized = { ...headers }
  for (const key of Object.keys(sanitized)) {
    if (sensitive.includes(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]'
    }
  }
  return sanitized
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function logRequest(data: {
  routeId: string
  requestId: string
  method: string
  path: string
  queryParams: Record<string, string>
  requestHeaders: Record<string, string>
  requestBody?: string
  responseStatus?: number
  responseHeaders: Record<string, string>
  responseBody?: string
  duration?: number
  targetUrl: string
  error?: string
  ip?: string
  userAgent?: string
}) {
  try {
    // GeoIP lookup
    const geo = lookupIp(data.ip)

    await prisma.requestLog.create({
      data: {
        routeId: data.routeId,
        requestId: data.requestId,
        method: data.method,
        path: data.path,
        queryParams: data.queryParams,
        requestHeaders: data.requestHeaders,
        requestBody: sanitizeText(data.requestBody) ?? data.requestBody,
        responseStatus: data.responseStatus,
        responseHeaders: data.responseHeaders,
        responseBody: sanitizeText(data.responseBody) ?? data.responseBody,
        duration: data.duration,
        targetUrl: data.targetUrl,
        error: data.error,
        ip: data.ip,
        userAgent: data.userAgent,
        geoCountry: geo.country,
        geoCity: geo.city,
        geoLatitude: geo.latitude,
        geoLongitude: geo.longitude,
      },
    })
  } catch (err) {
    logger.warn('Failed to log proxy request', { error: (err as Error).message })
  }
}
