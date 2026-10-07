import axios, { AxiosError, AxiosRequestConfig } from 'axios'
import https from 'https'
import http from 'http'
import { Request, Response } from 'express'
import { createHmac, timingSafeEqual } from 'crypto'
import { validateWebhookSignature, isSafeRegex, safeLookup, isTlsProtocolMismatch } from '../lib/security'
import { verifyApiKey } from './apiKeyService'
import { decryptSecret } from '../lib/crypto'
import { Route, RouteTarget, TransformRule, RequestSource } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { logger } from '../lib/logger'
import { AppError } from '../lib/errors'
import { checkRateLimit } from '../lib/rateLimitStore'
import { proxyRequestsTotal, proxyRequestDuration } from '../lib/metrics'
import { notifyRouteError } from './notificationService'
import { checkCircuitBreaker, recordSuccess, recordFailure } from './circuitBreakerService'
import { selectTarget, markTargetUnhealthy, markTargetHealthy } from './loadBalancerService'
import { achievementService } from './achievementService'
import { applyRequestTransforms, applyResponseTransforms } from './transformService'
import { lookupIp } from './geoipService'
import { sanitizeText } from './sanitizerService'
import { v4 as uuid } from 'uuid'
import { hardenProxyResponseHeaders, clearApiSecurityHeaders } from '../lib/proxySecurityHeaders'
import { stripClusterGateCookies } from '../lib/cookies'
import { StreamCapture, CaptureEndState } from '../lib/streamCapture'
import { config } from '../config'
import { Transform } from 'stream'
import { classifyRequestSource } from '../lib/requestSource'

// Max characters of a response body kept in the request log (buffered and streamed)
const LOGGED_BODY_LIMIT = config.LOG_BODY_LIMIT
const LOGGED_STREAM_BODY_LIMIT = config.LOG_STREAM_BODY_LIMIT
// Shown in the log while a streamed response is still being captured
const STREAMING_PLACEHOLDER = '[streaming…]'

// Extended route type with relations loaded by proxyHandler
type RouteWithRelations = Route & {
  targets?: RouteTarget[]
  transformRules?: TransformRule[]
}

/**
 * Rewrite a Location header on an upstream 3xx so the redirect target stays
 * under the public /r/<route>/... path instead of escaping to the upstream
 * host (which would break for users hitting the proxy via a different domain).
 *
 * - Relative paths (e.g. "/api/docs/") get prefixed with the route's basePath.
 * - Absolute URLs whose origin matches the upstream get the origin stripped
 *   and replaced with the basePath.
 * - Other absolute URLs (e.g. an OAuth provider hand-off) are left alone.
 */
function rewriteLocationHeader(location: string, basePath: string, upstreamUrl: string): string {
  if (!location) return location
  // Already prefixed — leave it
  if (location.startsWith(basePath + '/') || location === basePath) return location
  if (location.startsWith('/')) {
    return `${basePath}${location}`
  }
  try {
    const target = new URL(upstreamUrl)
    if (location.startsWith(target.origin)) {
      const tail = location.slice(target.origin.length) || '/'
      return `${basePath}${tail}`
    }
  } catch { /* upstreamUrl malformed — fall through */ }
  return location
}

function maybeRewriteLocation(
  headers: Record<string, string>,
  status: number | undefined,
  basePath: string,
  upstreamUrl: string,
  enabled: boolean,
): void {
  if (!enabled) return
  if (!status || status < 300 || status >= 400) return
  const key = Object.keys(headers).find((k) => k.toLowerCase() === 'location')
  if (!key) return
  headers[key] = rewriteLocationHeader(headers[key], basePath, upstreamUrl)
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
  // Body is re-serialized below, so the inbound length no longer applies.
  // Forwarding a stale value risks truncation / request smuggling; axios sets
  // the correct Content-Length from the outgoing data.
  'content-length',
])

export async function proxyRequest(
  route: RouteWithRelations | Route,
  req: Request,
  res: Response,
  overridePath?: string,
  opts: { source?: RequestSource } = {}
): Promise<void> {
  const start = Date.now()
  const requestId = uuid()
  const source = classifyRequestSource(req.get('user-agent'), opts.source)
  const routeExt = route as RouteWithRelations
  // Express's req.path is a getter-only property and cannot be mutated, so the
  // handler passes the full (/r-prefixed) public path explicitly for matching.
  const proxyPath = overridePath ?? req.path

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
    const result = await checkRateLimit(route.id, rateLimitIp, (route as any).rateLimitMax, (route as any).rateLimitWindow)
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

  // Enforce ClusterGate-level authentication. The header that carried a
  // managed API key is stripped from the forwarded request below.
  let consumedAuthHeader: string | null = null
  if ((route as any).requireAuth && (route as any).authType !== 'NONE') {
    consumedAuthHeader = await validateRouteAuth(route, req)
  }

  // ---- Acquire the request body: buffer when the route needs it (webhook
  // signature or transforms), otherwise keep the stream for unbuffered relay ----
  const needBufferedBody = !!route.webhookSecret || !!(routeExt.transformRules && routeExt.transformRules.length > 0)
  let rawBodyBuffer: Buffer | undefined
  let requestStream: any = undefined
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    if (Buffer.isBuffer(req.body)) {
      rawBodyBuffer = req.body.length > 0 ? req.body : undefined
    } else if (req.body !== undefined && !(typeof req.body === 'object' && Object.keys(req.body).length === 0)) {
      // Pre-parsed object/string (test/mock path)
      rawBodyBuffer = Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body))
    } else if (typeof (req as any).pipe === 'function') {
      // Unconsumed raw stream (streaming mode)
      if (needBufferedBody) {
        rawBodyBuffer = await readRawBody(req)
        if (rawBodyBuffer.length === 0) rawBodyBuffer = undefined
      } else {
        requestStream = req
      }
    }
  }

  // Validate webhook secret (timing-safe comparison)
  if (route.webhookSecret) {
    const signature = req.get('X-Hub-Signature-256') || req.get('X-Webhook-Signature')
    if (!signature) {
      throw AppError.unauthorized('Missing webhook signature')
    }
    const body = rawBodyBuffer ? rawBodyBuffer.toString('utf8') : ''
    const secret = decryptSecret(route.webhookSecret) || ''
    if (!validateWebhookSignature(body, secret, signature)) {
      throw AppError.unauthorized('Invalid webhook signature')
    }
  }

  // Build target path — strip publicPath prefix, keep only the suffix
  let targetPath = proxyPath
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
    if (!HOP_BY_HOP_HEADERS.has(lowerKey) && lowerKey !== consumedAuthHeader && typeof value === 'string') {
      forwardHeaders[key] = value
    }
  }

  // Never leak ClusterGate's own session/CSRF cookies to the upstream service
  if (forwardHeaders['cookie'] !== undefined) {
    const appCookies = stripClusterGateCookies(forwardHeaders['cookie'])
    if (appCookies) forwardHeaders['cookie'] = appCookies
    else delete forwardHeaders['cookie']
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

  // Upstream auth — inject the credential the target (e.g. n8n) requires
  const uType = (route as any).upstreamAuthType as string | undefined
  const uVal = (route as any).upstreamAuthValue as string | null
  if (uType && uType !== 'NONE' && uVal) {
    const v = decryptSecret(uVal) || ''
    if (uType === 'BEARER') forwardHeaders['Authorization'] = `Bearer ${v}`
    else if (uType === 'BASIC') forwardHeaders['Authorization'] = `Basic ${v}`
    else if (uType === 'API_KEY') forwardHeaders[(route as any).upstreamAuthHeader || 'X-API-Key'] = v
  }

  // Set proxy identification headers
  forwardHeaders['X-Forwarded-For'] = req.ip || ''
  forwardHeaders['X-Forwarded-Proto'] = req.protocol
  forwardHeaders['X-Forwarded-Host'] = req.hostname
  forwardHeaders['X-ClusterGate-Route-ID'] = route.id
  forwardHeaders['X-Request-ID'] = requestId

  // Buffered body (Buffer) acquired above; streamed bodies are piped directly
  let requestBody: any = rawBodyBuffer

  // ---- Apply request transforms (only runs when we have a buffered body) ----
  const transformRules = routeExt.transformRules
  if (transformRules && transformRules.length > 0) {
    let parsedBody: unknown = undefined
    if (requestBody) {
      try {
        const asText = Buffer.isBuffer(requestBody) ? requestBody.toString('utf8') : requestBody
        parsedBody = JSON.parse(typeof asText === 'string' ? asText : '{}')
      } catch {
        // Non-JSON body (form-encoded, plain text, binary) — leave undefined so
        // body transforms are skipped rather than failing the whole request.
        parsedBody = undefined
      }
    }
    const transformed = applyRequestTransforms(transformRules, forwardHeaders, queryParams, parsedBody)
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
  let resolvedUrl = `${fullTargetUrl.split('?')[0]}${transformedQs}`

  // Streamed bodies are piped straight through; preserve Content-Length so the
  // target knows the size (axios would otherwise fall back to chunked).
  if (requestStream) {
    const cl = req.get('content-length')
    if (cl) forwardHeaders['Content-Length'] = cl
  }

  // The log keeps a bounded copy of the request body. A streamed body is
  // teed on its way to the upstream (backpressure unchanged); a buffered or
  // transformed one is decoded once when the log is written.
  let requestCapture: StreamCapture | undefined
  if (requestStream) {
    const capture = new StreamCapture({
      contentType: req.get('content-type'),
      contentEncoding: req.get('content-encoding'),
      limit: LOGGED_BODY_LIMIT,
      kind: 'body',
    })
    requestCapture = capture
    const tee = new Transform({
      transform(chunk: Buffer, _enc, cb) { capture.push(chunk); cb(null, chunk) },
    })
    const incoming = requestStream
    incoming.on('error', (e: Error) => tee.destroy(e))
    requestStream = incoming.pipe(tee)
  }
  const bodyForLog = requestBody
  const loggedRequestBody = (): Promise<string | undefined> => requestCapture
    ? requestCapture.finish(req.readableEnded ? 'complete' : 'open').then((r) => r.body || undefined)
    : captureBody(bodyForLog, req.get('content-type'), req.get('content-encoding'))

  const axiosConfig: AxiosRequestConfig = {
    method: req.method as AxiosRequestConfig['method'],
    url: resolvedUrl,
    headers: forwardHeaders,
    data: requestStream ?? requestBody,
    timeout: route.timeout,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    responseType: 'arraybuffer',
    validateStatus: () => true, // Don't throw on any HTTP status
    maxRedirects: 0, // Disable redirect following to prevent SSRF via open redirectors
    decompress: true,
    httpsAgent: new https.Agent({ rejectUnauthorized: (route as any).sslVerify !== false, lookup: safeLookup }),
    httpAgent: new http.Agent({ lookup: safeLookup }),
  }

  let responseStatus: number | undefined
  let responseBody: Promise<string | undefined> | undefined
  let duration: number | undefined
  let error: string | undefined

  try {
    // ---- Streaming mode: pipe the upstream response straight through so SSE /
    // chunked / NDJSON bodies (e.g. n8n AI Agent token streams) reach the client
    // incrementally instead of being buffered until completion. ----
    if ((route as any).streamResponse) {
      const streamConfig: AxiosRequestConfig = { ...axiosConfig, responseType: 'stream', decompress: false }
      let resp: any
      try {
        resp = await axios(streamConfig)
      } catch (err) {
        const axiosErr = err as AxiosError
        if (isTlsProtocolMismatch(err) && typeof streamConfig.url === 'string' && streamConfig.url.startsWith('https://')) {
          streamConfig.url = 'http://' + streamConfig.url.slice('https://'.length)
          resolvedUrl = streamConfig.url
          logger.warn('HTTPS target spoke plain HTTP — retrying stream over http', { routeId: route.id, url: streamConfig.url })
          resp = await axios(streamConfig)
        } else if (axiosErr.response) {
          resp = axiosErr.response
        } else {
          throw err
        }
      }

      duration = Date.now() - start
      responseStatus = resp.status

      // Forward upstream headers as-is (Content-Encoding kept since we don't
      // decompress; Content-Length dropped via HOP_BY_HOP so we can chunk).
      // Collect into a map first so the optional Location rewrite (default-on)
      // can replace the value before it's set on the response.
      const streamHeaders: Record<string, string> = {}
      for (const [key, value] of Object.entries(resp.headers as Record<string, string>)) {
        if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
          streamHeaders[key] = value
        }
      }
      {
        const basePathForRewrite = route.publicPath.endsWith('/*') ? route.publicPath.slice(0, -2) : route.publicPath
        maybeRewriteLocation(streamHeaders, responseStatus, basePathForRewrite, selectedTargetUrl, (route as any).rewriteRedirects !== false)
      }
      hardenProxyResponseHeaders(streamHeaders, { sandbox: (route as any).sandbox === true })
      clearApiSecurityHeaders(res)
      for (const [key, value] of Object.entries(streamHeaders)) {
        res.setHeader(key, value)
      }
      res.setHeader('X-Request-ID', requestId)
      res.setHeader('X-ClusterGate-Duration', String(duration))
      res.setHeader('X-ClusterGate-Stream', '1') // disable our compression middleware
      res.setHeader('X-Accel-Buffering', 'no') // disable proxy (nginx) buffering
      res.status(responseStatus || 502)
      if (typeof (res as any).flushHeaders === 'function') (res as any).flushHeaders()

      if (route.circuitBreakerEnabled) recordSuccess(route.id).catch(() => {})
      if (selectedTargetId) markTargetHealthy(selectedTargetId).catch(() => {})
      if ((route as any).createdById) {
        const owner = (route as any).createdById
        if (duration !== undefined && duration < 10 && responseStatus !== undefined && responseStatus < 400) {
          achievementService.checkSpeedDemon(owner).catch(() => {})
        }
        // Globe Trotter is a cheap distinct-country COUNT — fire occasionally
        // (~1 in 20 requests) so it unlocks without piling up on every hit.
        if (Math.random() < 0.05) achievementService.checkGlobeTrotter(owner).catch(() => {})
      }
      proxyRequestsTotal.inc({ route_id: route.id, method: req.method, status: String(responseStatus) })
      proxyRequestDuration.observe({ route_id: route.id }, duration / 1000)
      // Log right away so long-lived streams show up while they run; the body
      // is filled in from the tee once the stream ends or the budget is spent.
      const logIdPromise = logRequest({
        routeId: route.id, requestId, method: req.method, path: proxyPath,
        queryParams: req.query as Record<string, string>,
        requestHeaders: sanitizeHeaders(forwardHeaders),
        requestBody: loggedRequestBody(),
        responseStatus, responseHeaders: sanitizeHeaders(streamHeaders), responseBody: STREAMING_PLACEHOLDER,
        duration, targetUrl: resolvedUrl, ip: req.ip, userAgent: req.get('user-agent'), source,
      })

      const capture = new StreamCapture({
        contentType: headerValue(resp.headers, 'content-type'),
        contentEncoding: headerValue(resp.headers, 'content-encoding'),
        limit: LOGGED_STREAM_BODY_LIMIT,
      })
      let captureFlushed = false
      const flushCapture = (state: CaptureEndState) => {
        if (captureFlushed) return
        captureFlushed = true
        capture.finish(state)
          .then(async (result) => {
            const logId = await logIdPromise
            if (logId) await updateLoggedResponseBody(logId, result.body)
          })
          .catch((err) => logger.warn('Failed to record streamed response body', { error: (err as Error).message }))
      }

      await new Promise<void>((resolve, reject) => {
        // Observe chunks alongside pipe(): same events, no extra buffering or
        // backpressure — the client stream is not touched.
        resp.data.on('data', (chunk: Buffer) => {
          if (captureFlushed) return
          capture.push(chunk)
          if (capture.full) flushCapture('open')
        })
        resp.data.on('end', () => { flushCapture('complete'); resolve() })
        resp.data.on('error', (e: Error) => { flushCapture('aborted'); reject(e) })
        res.on('close', () => { flushCapture(resp.data.readableEnded ? 'complete' : 'aborted'); resolve() })
        resp.data.pipe(res)
      })
      return
    }

    let lastError: Error | null = null
    let response: any = null

    // Retry logic
    // A consumed request stream can't be replayed, so don't retry streamed bodies
    const maxAttempts = requestStream ? 1 : 1 + (route.retryCount || 0)
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
        // Target spoke plain HTTP on an https:// URL (e.g. n8n on :5678).
        // OpenSSL reports this as EPROTO "packet length too long" / "wrong
        // version number". Transparently fall back to http:// once.
        if (isTlsProtocolMismatch(err) && typeof axiosConfig.url === 'string' && axiosConfig.url.startsWith('https://')) {
          axiosConfig.url = 'http://' + axiosConfig.url.slice('https://'.length)
          resolvedUrl = axiosConfig.url
          logger.warn('HTTPS target spoke plain HTTP — retrying over http', {
            routeId: route.id,
            url: axiosConfig.url,
          })
          try {
            response = await axios(axiosConfig)
            lastError = null
            break
          } catch (httpErr) {
            lastError = httpErr as Error
            if ((httpErr as AxiosError).response) {
              response = (httpErr as AxiosError).response
              lastError = null
              break
            }
          }
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

    // Keep redirects inside the proxy by default (rewrites Location); user
    // can opt out via route.rewriteRedirects=false to pass through unchanged.
    {
      const basePathForRewrite = route.publicPath.endsWith('/*') ? route.publicPath.slice(0, -2) : route.publicPath
      maybeRewriteLocation(respHeaders, responseStatus, basePathForRewrite, selectedTargetUrl, (route as any).rewriteRedirects !== false)
    }

    // Keep the upstream from reaching ClusterGate through the shared origin
    hardenProxyResponseHeaders(respHeaders, { sandbox: (route as any).sandbox === true })
    clearApiSecurityHeaders(res)

    // Set response headers
    for (const [key, value] of Object.entries(respHeaders)) {
      res.setHeader(key, value)
    }

    res.setHeader('X-Request-ID', requestId)
    res.setHeader('X-ClusterGate-Duration', String(duration))

    // axios already decompressed the body, so no content-encoding here
    responseBody = captureBody(responseBuffer, headerValue(respHeaders, 'content-type'))

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

    // Eagerly check the Speed Demon achievement on fast successful responses
    // (avg-of-5 + <10ms is checked in the service itself). This way users see
    // it unlock immediately instead of waiting for the daily cron.
    if (duration !== undefined && duration < 10 && responseStatus !== undefined && responseStatus < 400 && (route as any).createdById) {
      achievementService.checkSpeedDemon((route as any).createdById).catch(() => {})
    }

    // Log request
    logRequest({
      routeId: route.id,
      requestId,
      method: req.method,
      path: proxyPath,
      queryParams: req.query as Record<string, string>,
      requestHeaders: sanitizeHeaders(forwardHeaders),
      requestBody: loggedRequestBody(),
      responseStatus,
      responseHeaders: sanitizeHeaders(respHeaders),
      responseBody,
      duration,
      targetUrl: resolvedUrl,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      source,
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
      path: proxyPath,
      queryParams: req.query as Record<string, string>,
      requestHeaders: sanitizeHeaders(forwardHeaders),
      requestBody: loggedRequestBody(),
      responseStatus,
      responseHeaders: {},
      duration,
      targetUrl: resolvedUrl,
      error: error,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      source,
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

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Enforce the route's client-facing auth. Returns the lowercased name of the
 * header that carried a ClusterGate-managed API key so the proxy can strip it
 * before forwarding (the key is a gateway credential — it must never reach the
 * upstream); null for the static BASIC/BEARER schemes, whose passthrough
 * behavior is unchanged.
 */
export async function validateRouteAuth(route: Route, req: Request): Promise<string | null> {
  const authType = (route as any).authType as string
  const authValue = decryptSecret((route as any).authValue)

  // API key auth is satisfied by route-scoped generated keys (hashed, with
  // expiry + usage tracking + scope) — not the legacy static value. The key is
  // accepted from X-API-Key or as Authorization: Bearer, so OpenAI-compatible
  // clients (which only speak Bearer) work without custom headers.
  if (authType === 'API_KEY') {
    let apiKey = req.get('X-API-Key')
    let consumedHeader = 'x-api-key'
    if (!apiKey) {
      const authHeader = req.get('Authorization')
      if (authHeader?.startsWith('Bearer ')) {
        apiKey = authHeader.slice(7)
        consumedHeader = 'authorization'
      }
    }
    if (!apiKey) {
      throw AppError.unauthorized('API key required — provide it via the X-API-Key header or as Authorization: Bearer')
    }
    const key = await verifyApiKey(apiKey, route.id, req.ip || req.socket?.remoteAddress)
    if (!key) {
      throw AppError.unauthorized('Invalid API key — generate one for this route and send it via X-API-Key or Authorization: Bearer')
    }
    if (key.scope === 'READ' && !SAFE_METHODS.has(req.method)) {
      throw AppError.forbidden('This API key is read-only and cannot perform write requests')
    }
    return consumedHeader
  }

  if (!authValue) {
    throw AppError.internal('Route requires authentication but no auth value is configured')
  }

  switch (authType) {
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
  return null
}

export function isIpAllowed(clientIp: string, allowlist: string[]): boolean {
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

// Read an unconsumed request stream into a Buffer (used when a streamed route
// still needs the full body for webhook signature checks or transforms).
function readRawBody(req: Request): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

async function logRequest(data: {
  routeId: string
  requestId: string
  method: string
  path: string
  queryParams: Record<string, string>
  requestHeaders: Record<string, string>
  requestBody?: string | Promise<string | undefined>
  responseStatus?: number
  responseHeaders: Record<string, string>
  responseBody?: string | Promise<string | undefined>
  duration?: number
  targetUrl: string
  error?: string
  ip?: string
  userAgent?: string
  source: RequestSource
}): Promise<string | null> {
  try {
    // GeoIP lookup
    const geo = lookupIp(data.ip)
    const requestBody = await data.requestBody
    const responseBody = await data.responseBody

    const created = await prisma.requestLog.create({
      data: {
        routeId: data.routeId,
        requestId: data.requestId,
        method: data.method,
        path: data.path,
        queryParams: data.queryParams,
        requestHeaders: data.requestHeaders,
        requestBody: sanitizeText(requestBody) ?? requestBody,
        responseStatus: data.responseStatus,
        responseHeaders: data.responseHeaders,
        responseBody: sanitizeText(responseBody) ?? responseBody,
        duration: data.duration,
        targetUrl: data.targetUrl,
        error: data.error,
        ip: data.ip,
        userAgent: data.userAgent,
        source: data.source,
        geoCountry: geo.country,
        geoCity: geo.city,
        geoLatitude: geo.latitude,
        geoLongitude: geo.longitude,
      },
      select: { id: true },
    })
    return created.id
  } catch (err) {
    logger.warn('Failed to log proxy request', { error: (err as Error).message })
    return null
  }
}

// Fill in the body of a streamed response once the tee has it. Goes through
// the same sanitizer as every other logged body.
async function updateLoggedResponseBody(logId: string, body: string): Promise<void> {
  await prisma.requestLog.update({
    where: { id: logId },
    data: { responseBody: sanitizeText(body) ?? body },
  })
}

// Bounded, log-ready text of a buffered body: binary content becomes a
// placeholder and a cut body ends with a visible truncation marker.
async function captureBody(
  body: Buffer | string | undefined | null,
  contentType?: string,
  contentEncoding?: string,
): Promise<string | undefined> {
  if (body === undefined || body === null || body.length === 0) return undefined
  const capture = new StreamCapture({ contentType, contentEncoding, limit: LOGGED_BODY_LIMIT, kind: 'body' })
  capture.push(body)
  const result = await capture.finish('complete')
  return result.body || undefined
}

function headerValue(headers: Record<string, unknown> | undefined, name: string): string | undefined {
  if (!headers) return undefined
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name)
  const v = key ? headers[key] : undefined
  if (Array.isArray(v)) return v.join(', ')
  return typeof v === 'string' ? v : undefined
}
