import { IncomingMessage } from 'http'
import { Socket } from 'net'
import { URL } from 'url'
import { createProxyServer } from 'http-proxy'
import { prisma } from '../lib/prisma'
import { logger } from '../lib/logger'
import { isIpAllowed } from '../services/proxyService'
import { timingSafeCompare } from '../lib/security'

const proxy = createProxyServer({
  ws: true,
  changeOrigin: true,
  secure: false,
})

proxy.on('error', (err, _req, res) => {
  logger.error('WebSocket proxy error', { error: err.message })
  if (res && 'writeHead' in res && typeof res.writeHead === 'function') {
    try {
      res.writeHead(502, { 'Content-Type': 'text/plain' })
      res.end('WebSocket proxy error')
    } catch {}
  }
})

/**
 * Handle HTTP upgrade requests for WebSocket-enabled routes.
 * Called from the server's 'upgrade' event.
 */
export async function handleWebSocketUpgrade(req: IncomingMessage, socket: Socket, head: Buffer) {
  const url = req.url || ''

  // Only handle /r/* paths
  if (!url.startsWith('/r/')) {
    socket.destroy()
    return
  }

  // Separate pathname from query string for matching and auth lookups
  const parsedUrl = new URL(url, 'http://localhost')
  const path = parsedUrl.pathname.slice(2) // Strip /r prefix

  try {
    const routes = await prisma.route.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        status: 'PUBLISHED',
        wsEnabled: true,
      },
      orderBy: { publicPath: 'desc' },
    })

    const route = routes.find((r) => {
      let routePath = r.publicPath
      if (routePath.startsWith('/r/')) routePath = routePath.slice(2)
      else if (routePath.startsWith('/r')) routePath = routePath.slice(2) || '/'
      if (routePath.endsWith('/*')) routePath = routePath.slice(0, -2)
      if (routePath === '/' || routePath === '') return true
      return path === routePath || path.startsWith(routePath + '/')
    })

    if (!route) {
      logger.debug('No WS route found for path', { path: url })
      socket.destroy()
      return
    }

    // ---- Enforce the same per-route security controls as the HTTP proxy ----
    if (route.maintenanceMode) {
      socket.destroy()
      return
    }

    if (route.ipAllowlist.length > 0) {
      const clientIp = req.socket.remoteAddress || ''
      if (!isIpAllowed(clientIp, route.ipAllowlist)) {
        logger.warn('WS upgrade blocked by IP allowlist', { route: route.name, ip: clientIp })
        socket.destroy()
        return
      }
    }

    if ((route as any).requireAuth && (route as any).authType !== 'NONE') {
      if (!isWsAuthorized(route, req, parsedUrl)) {
        logger.warn('WS upgrade blocked: authentication failed', { route: route.name })
        socket.destroy()
        return
      }
    }

    // Build target path
    let targetPath = path
    const basePath = route.publicPath.endsWith('/*')
      ? route.publicPath.slice(0, -2)
      : route.publicPath
    const normalizedBase = basePath.startsWith('/r/') ? basePath.slice(2) : basePath
    if (normalizedBase !== '/' && targetPath.startsWith(normalizedBase)) {
      targetPath = targetPath.slice(normalizedBase.length) || '/'
    }

    if (route.stripPrefix) {
      targetPath = '/'
    }

    const targetBase = route.targetUrl.replace(/\/$/, '').replace(/^http/, 'ws')
    const target = `${targetBase}${targetPath}`

    logger.info('WebSocket upgrade', { route: route.name, target })

    // Honor the route's sslVerify setting instead of a global secure:false
    proxy.ws(req, socket, head, { target, secure: (route as any).sslVerify !== false })
  } catch (err) {
    logger.error('WS upgrade error', { error: (err as Error).message })
    socket.destroy()
  }
}

function isWsAuthorized(route: any, req: IncomingMessage, parsedUrl: URL): boolean {
  const authType = route.authType as string
  const authValue = route.authValue as string | null
  if (!authValue) return false

  const header = (name: string): string => {
    const v = req.headers[name.toLowerCase()]
    return Array.isArray(v) ? v[0] : v || ''
  }

  switch (authType) {
    case 'API_KEY': {
      const apiKey = header('x-api-key') || parsedUrl.searchParams.get('api_key') || ''
      return !!apiKey && timingSafeCompare(apiKey, authValue)
    }
    case 'BASIC': {
      const auth = header('authorization')
      if (!auth.startsWith('Basic ')) return false
      return timingSafeCompare(auth.slice(6), authValue)
    }
    case 'BEARER': {
      const auth = header('authorization')
      if (!auth.startsWith('Bearer ')) return false
      return timingSafeCompare(auth.slice(7), authValue)
    }
    default:
      return false
  }
}
