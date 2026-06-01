import type { Route } from '@/types'

// Fields that make up a portable route config — mirrors the backend export
// shape (no ids, timestamps, runtime circuit-breaker state, or secret values).
const EXPORT_FIELDS = [
  'name', 'description', 'publicPath', 'targetUrl', 'methods', 'status', 'tags', 'environment',
  'timeout', 'retryCount', 'retryDelay', 'stripPrefix', 'sslVerify', 'streamResponse',
  'requestBodyLimit', 'addHeaders', 'removeHeaders', 'rewriteRules', 'corsEnabled', 'corsOrigins',
  'ipAllowlist', 'requireAuth', 'authType', 'upstreamAuthType', 'upstreamAuthHeader', 'targetType',
  'healthCheckMethod', 'healthCheckPath', 'healthCheckBody', 'maintenanceMode', 'maintenanceMessage',
  'rateLimitEnabled', 'rateLimitMax', 'rateLimitWindow', 'wsEnabled', 'circuitBreakerEnabled',
  'cbFailureThreshold', 'cbRecoveryTimeout', 'lbStrategy',
] as const

export type RouteConfig = Record<string, unknown>

/** Build a portable config object from a route (for export / clipboard). */
export function toExportConfig(route: Route): RouteConfig {
  const out: RouteConfig = {}
  for (const f of EXPORT_FIELDS) {
    const v = (route as any)[f]
    if (v !== undefined && v !== null) out[f] = v
  }
  return out
}

/**
 * Prepare pasted configs for creation: draft status + a unique public path and
 * name so they never collide with an existing route.
 */
export function prepareForPaste(configs: RouteConfig[]): RouteConfig[] {
  return configs.map((c) => {
    const suffix = Math.random().toString(36).slice(2, 6)
    const path = typeof c.publicPath === 'string' ? c.publicPath.replace(/\/$/, '') : '/r/imported'
    return {
      ...c,
      name: `${c.name ?? 'Imported route'} (copy)`,
      publicPath: `${path}-copy-${suffix}`,
      status: 'DRAFT',
    }
  })
}

/** Parse clipboard text into an array of route configs (accepts one or many). */
export function parseConfigs(text: string): RouteConfig[] | null {
  try {
    const parsed = JSON.parse(text)
    const arr = Array.isArray(parsed) ? parsed : [parsed]
    // Must look like route configs
    if (!arr.every((c) => c && typeof c === 'object' && typeof c.targetUrl === 'string' && typeof c.publicPath === 'string')) {
      return null
    }
    return arr
  } catch {
    return null
  }
}

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH'])

/** Build a runnable curl command for calling a route through the proxy. */
export function buildCurl(route: Route, origin: string): string {
  const proxyPath = route.publicPath.startsWith('/r/')
    ? route.publicPath
    : `/r${route.publicPath.startsWith('/') ? route.publicPath : `/${route.publicPath}`}`
  const url = `${origin}${proxyPath.replace(/\/\*$/, '/example')}`
  const method = route.methods.includes('GET') ? 'GET' : route.methods[0] ?? 'GET'

  const lines = [`curl -X ${method} '${url}'`]

  // Custom request headers configured on the route
  const addHeaders = (route.addHeaders as Record<string, string>) || {}
  for (const [k, v] of Object.entries(addHeaders)) {
    lines.push(`  -H '${k}: ${v}'`)
  }

  // Auth the proxy itself requires
  if (route.requireAuth) {
    if (route.authType === 'API_KEY') lines.push(`  -H 'X-API-Key: <YOUR_API_KEY>'`)
    else if (route.authType === 'BEARER') lines.push(`  -H 'Authorization: Bearer <YOUR_TOKEN>'`)
    else if (route.authType === 'BASIC') lines.push(`  -H 'Authorization: Basic <BASE64_USER_PASS>'`)
  }

  if (WRITE_METHODS.has(method)) {
    lines.push(`  -H 'Content-Type: application/json'`)
    lines.push(`  -d '{}'`)
  }

  return lines.join(' \\\n')
}

/** Trigger a browser download of a JSON payload. */
export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
