import { IncomingMessage } from 'http'
import { Socket } from 'net'
import { createProxyServer } from 'http-proxy'
import { prisma } from '../lib/prisma'
import { logger } from '../lib/logger'

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

  const path = url.slice(2) // Strip /r prefix

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
      return path === routePath || path.startsWith(routePath + '/') || path.startsWith(routePath)
    })

    if (!route) {
      logger.debug('No WS route found for path', { path: url })
      socket.destroy()
      return
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

    proxy.ws(req, socket, head, { target })
  } catch (err) {
    logger.error('WS upgrade error', { error: (err as Error).message })
    socket.destroy()
  }
}
