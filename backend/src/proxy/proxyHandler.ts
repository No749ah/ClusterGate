import { Request, Response, NextFunction } from 'express'
import { prisma } from '../lib/prisma'
import { logger } from '../lib/logger'
import { proxyRequest } from '../services/proxyService'

export async function proxyHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const host = req.hostname
    const path = req.path

    // Find matching route by domain + path prefix
    const routes = await prisma.route.findMany({
      where: {
        domain: host,
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
    const route = routes.find((r) => {
      if (r.publicPath === '/' || r.publicPath === '') return true
      return path === r.publicPath || path.startsWith(r.publicPath + '/') || path.startsWith(r.publicPath)
    })

    if (!route) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'ROUTE_NOT_FOUND',
          message: `No route configured for ${host}${path}`,
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
      path,
      target: route.targetUrl,
    })

    await proxyRequest(route, req, res)
  } catch (err) {
    next(err)
  }
}
