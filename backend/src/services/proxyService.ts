import axios, { AxiosError, AxiosRequestConfig } from 'axios'
import { Request, Response } from 'express'
import { createHmac } from 'crypto'
import { Route } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { logger } from '../lib/logger'
import { AppError } from '../lib/errors'
import { proxyRequestsTotal, proxyRequestDuration } from '../lib/metrics'
import { v4 as uuid } from 'uuid'

// Headers to never forward to target
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'host',
])

export async function proxyRequest(route: Route, req: Request, res: Response): Promise<void> {
  const start = Date.now()
  const requestId = uuid()

  // Validate IP allowlist
  if (route.ipAllowlist.length > 0) {
    const clientIp = req.ip || req.socket.remoteAddress || ''
    if (!isIpAllowed(clientIp, route.ipAllowlist)) {
      throw AppError.forbidden('Your IP address is not allowed to access this route')
    }
  }

  // Validate webhook secret
  if (route.webhookSecret) {
    const signature = req.get('X-Hub-Signature-256') || req.get('X-Webhook-Signature')
    if (!signature) {
      throw AppError.unauthorized('Missing webhook signature')
    }
    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
    const expected = `sha256=${createHmac('sha256', route.webhookSecret).update(body).digest('hex')}`
    if (signature !== expected) {
      throw AppError.unauthorized('Invalid webhook signature')
    }
  }

  // Build target URL
  let targetPath = req.path

  // Apply path rewrite rules
  const rewriteRules = (route.rewriteRules as unknown as Array<{ from: string; to: string }>) || []
  for (const rule of rewriteRules) {
    const regex = new RegExp(rule.from)
    if (regex.test(targetPath)) {
      targetPath = targetPath.replace(regex, rule.to)
      break
    }
  }

  // Strip prefix if configured
  if (route.stripPrefix && targetPath.startsWith(route.publicPath)) {
    targetPath = targetPath.slice(route.publicPath.length) || '/'
  }

  // Build full target URL
  const targetBase = route.targetUrl.replace(/\/$/, '')
  const fullTargetUrl = `${targetBase}${targetPath}`

  // Build query string
  const queryString = Object.keys(req.query).length
    ? `?${new URLSearchParams(req.query as Record<string, string>).toString()}`
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
  let requestBody: string | undefined
  if (req.body && ['POST', 'PUT', 'PATCH'].includes(req.method)) {
    requestBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
  }

  const axiosConfig: AxiosRequestConfig = {
    method: req.method as AxiosRequestConfig['method'],
    url: finalUrl,
    headers: forwardHeaders,
    data: requestBody,
    timeout: route.timeout,
    responseType: 'arraybuffer',
    validateStatus: () => true, // Don't throw on any HTTP status
    maxRedirects: 5,
    decompress: true,
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
    for (const [key, value] of Object.entries(response.headers as Record<string, string>)) {
      const lowerKey = key.toLowerCase()
      if (!HOP_BY_HOP_HEADERS.has(lowerKey) && lowerKey !== 'content-encoding') {
        res.setHeader(key, value)
      }
    }

    res.setHeader('X-Request-ID', requestId)
    res.setHeader('X-ClusterGate-Duration', String(duration))

    const responseBuffer = Buffer.from(response.data)
    responseBody = responseBuffer.toString('utf8').slice(0, 10000) // Cap logged body

    proxyRequestsTotal.inc({
      route_id: route.id,
      method: req.method,
      status: String(responseStatus),
    })
    proxyRequestDuration.observe({ route_id: route.id }, duration / 1000)

    // Log request
    logRequest({
      routeId: route.id,
      requestId,
      method: req.method,
      path: req.path,
      queryParams: req.query as Record<string, unknown>,
      requestHeaders: sanitizeHeaders(forwardHeaders),
      requestBody: requestBody?.slice(0, 5000),
      responseStatus,
      responseHeaders: sanitizeHeaders(response.headers as Record<string, string>),
      responseBody: responseBody?.slice(0, 5000),
      duration,
      targetUrl: finalUrl,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    })

    res.status(responseStatus).send(responseBuffer)
  } catch (err) {
    duration = Date.now() - start
    error = (err as Error).message

    logger.error('Proxy request failed', {
      routeId: route.id,
      targetUrl: finalUrl,
      error: error,
      duration,
    })

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
      queryParams: req.query as Record<string, unknown>,
      requestHeaders: sanitizeHeaders(forwardHeaders),
      requestBody: requestBody?.slice(0, 5000),
      responseStatus,
      responseHeaders: {},
      duration,
      targetUrl: finalUrl,
      error: error,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    })

    throw AppError.serviceUnavailable(
      `Proxy error: ${error || 'Target service unavailable'}`
    )
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
  queryParams: Record<string, unknown>
  requestHeaders: Record<string, string>
  requestBody?: string
  responseStatus?: number
  responseHeaders: Record<string, unknown>
  responseBody?: string
  duration?: number
  targetUrl: string
  error?: string
  ip?: string
  userAgent?: string
}) {
  try {
    await prisma.requestLog.create({
      data: {
        routeId: data.routeId,
        requestId: data.requestId,
        method: data.method,
        path: data.path,
        queryParams: data.queryParams,
        requestHeaders: data.requestHeaders,
        requestBody: data.requestBody,
        responseStatus: data.responseStatus,
        responseHeaders: data.responseHeaders,
        responseBody: data.responseBody,
        duration: data.duration,
        targetUrl: data.targetUrl,
        error: data.error,
        ip: data.ip,
        userAgent: data.userAgent,
      },
    })
  } catch (err) {
    logger.warn('Failed to log proxy request', { error: (err as Error).message })
  }
}
