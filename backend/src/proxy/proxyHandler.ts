import { Request, Response, NextFunction } from 'express'
import { prisma } from '../lib/prisma'
import { logger } from '../lib/logger'
import { proxyRequest } from '../services/proxyService'

/**
 * Proxy handler — mounted at /r in the Express app.
 * Express strips the /r mount prefix from req.path, so if the full
 * request is /r/my-service/hello, req.path here is /my-service/hello.
 * Route publicPaths are stored with the /r prefix (e.g. /r/my-service),
 * so we strip /r before matching.
 */
export async function proxyHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const path = req.path // already has /r stripped by Express mount

    // Find matching route by path prefix
    const routes = await prisma.route.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        status: 'PUBLISHED',
      },
      orderBy: [
        // More specific paths first (longer path = more specific)
        { publicPath: 'desc' },
      ],
    })

    // Find best matching route (longest prefix match)
    // Strip the /r prefix from stored publicPath for comparison
    const route = routes.find((r) => {
      let routePath = r.publicPath
      // Strip /r prefix from stored path for matching
      if (routePath.startsWith('/r/')) {
        routePath = routePath.slice(2) // /r/my-service -> /my-service
      } else if (routePath.startsWith('/r')) {
        routePath = routePath.slice(2) || '/'
      }
      // Strip trailing /* for wildcard routes
      if (routePath.endsWith('/*')) {
        routePath = routePath.slice(0, -2)
      }
      if (routePath === '/' || routePath === '') return true
      return path === routePath || path.startsWith(routePath + '/') || path.startsWith(routePath)
    })

    if (!route) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'ROUTE_NOT_FOUND',
          message: `No route configured for /r${path}`,
        },
      })
    }

    // Check HTTP method
    if (route.methods.length > 0 && !route.methods.includes(req.method)) {
      return res.status(405).json({
        success: false,
        error: {
          code: 'METHOD_NOT_ALLOWED',
          message: `Method ${req.method} is not allowed for this route`,
        },
      })
    }

    // Check maintenance mode
    if (route.maintenanceMode) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'MAINTENANCE',
          message: route.maintenanceMessage || 'This service is temporarily unavailable',
        },
      })
    }

    logger.debug('Proxying request', {
      route: route.name,
      method: req.method,
      path: `/r${path}`,
      target: route.targetUrl,
    })

    // Restore the full path including /r prefix so proxyService can strip publicPath correctly
    const originalPath = req.path
    ;(req as any).path = `/r${originalPath}`
    await proxyRequest(route, req, res)
    ;(req as any).path = originalPath
  } catch (err) {
    next(err)
  }
}
