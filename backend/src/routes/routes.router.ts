import { Router, Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { Role } from '@prisma/client'
import { authenticate, authorize } from '../middleware/authenticate'
import * as routeService from '../services/routeService'
import * as healthService from '../services/healthService'
import * as logService from '../services/logService'
import { proxyRequest } from '../services/proxyService'
import { prisma } from '../lib/prisma'
import { AppError } from '../lib/errors'

const router = Router()

// Route schema
const routeBodySchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  publicPath: z.string().min(1, 'Public path is required').startsWith('/', 'Must start with /'),
  targetUrl: z.string().url('Target URL must be a valid URL'),
  methods: z.array(z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])).min(1),
  tags: z.array(z.string()).default([]),
  timeout: z.number().int().min(1000).max(120000).default(30000),
  retryCount: z.number().int().min(0).max(5).default(0),
  retryDelay: z.number().int().min(100).max(10000).default(1000),
  stripPrefix: z.boolean().default(false),
  requestBodyLimit: z.string().default('10mb'),
  addHeaders: z.record(z.string()).default({}),
  removeHeaders: z.array(z.string()).default([]),
  rewriteRules: z
    .array(z.object({ from: z.string(), to: z.string() }))
    .default([]),
  corsEnabled: z.boolean().default(false),
  corsOrigins: z.array(z.string()).default([]),
  ipAllowlist: z.array(z.string()).default([]),
  requireAuth: z.boolean().default(false),
  authType: z.enum(['NONE', 'API_KEY', 'BASIC', 'BEARER']).default('NONE'),
  authValue: z.string().optional(),
  webhookSecret: z.string().optional(),
  maintenanceMode: z.boolean().default(false),
  maintenanceMessage: z.string().optional(),
})

// GET /api/routes
router.get('/', authenticate, authorize([Role.ADMIN, Role.OPERATOR, Role.VIEWER]), async (req, res, next) => {
  try {
    const { page = '1', pageSize = '20', search, status, isActive, tags, sortBy, sortDir } = req.query

    const result = await routeService.getRoutes(
      {
        search: search as string,
        status: status as any,
        isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
        tags: tags ? String(tags).split(',') : undefined,
      },
      {
        page: parseInt(String(page)),
        pageSize: parseInt(String(pageSize)),
        sortBy: sortBy as string,
        sortDir: (sortDir as 'asc' | 'desc') || 'desc',
      }
    )

    res.json({ success: true, ...result })
  } catch (err) {
    next(err)
  }
})

// GET /api/routes/export
router.get('/export', authenticate, authorize([Role.ADMIN, Role.OPERATOR]), async (_req, res, next) => {
  try {
    const routes = await routeService.exportRoutes()
    res.setHeader('Content-Disposition', 'attachment; filename="clustergate-routes.json"')
    res.json({ success: true, data: routes, exportedAt: new Date().toISOString() })
  } catch (err) {
    next(err)
  }
})

// POST /api/routes/import
router.post('/import', authenticate, authorize([Role.ADMIN]), async (req, res, next) => {
  try {
    const { routes } = z.object({ routes: z.array(z.unknown()) }).parse(req.body)
    const result = await routeService.importRoutes(routes, req.user!.userId)
    res.json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
})

// GET /api/routes/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const route = await routeService.getRouteById(req.params.id)
    res.json({ success: true, data: route })
  } catch (err) {
    next(err)
  }
})

// POST /api/routes
router.post('/', authenticate, authorize([Role.ADMIN, Role.OPERATOR]), async (req, res, next) => {
  try {
    const data = routeBodySchema.parse(req.body)
    const route = await routeService.createRoute(data as any, req.user!.userId)
    res.status(201).json({ success: true, data: route })
  } catch (err) {
    next(err)
  }
})

// PUT /api/routes/:id
router.put('/:id', authenticate, authorize([Role.ADMIN, Role.OPERATOR]), async (req, res, next) => {
  try {
    const data = routeBodySchema.partial().parse(req.body)
    const route = await routeService.updateRoute(req.params.id, data as any, req.user!.userId)
    res.json({ success: true, data: route })
  } catch (err) {
    next(err)
  }
})

// DELETE /api/routes/:id
router.delete('/:id', authenticate, authorize([Role.ADMIN]), async (req, res, next) => {
  try {
    await routeService.deleteRoute(req.params.id)
    res.json({ success: true, message: 'Route deleted successfully' })
  } catch (err) {
    next(err)
  }
})

// POST /api/routes/:id/publish
router.post('/:id/publish', authenticate, authorize([Role.ADMIN, Role.OPERATOR]), async (req, res, next) => {
  try {
    const route = await routeService.publishRoute(req.params.id, req.user!.userId)
    res.json({ success: true, data: route })
  } catch (err) {
    next(err)
  }
})

// POST /api/routes/:id/deactivate
router.post('/:id/deactivate', authenticate, authorize([Role.ADMIN, Role.OPERATOR]), async (req, res, next) => {
  try {
    const route = await routeService.deactivateRoute(req.params.id, req.user!.userId)
    res.json({ success: true, data: route })
  } catch (err) {
    next(err)
  }
})

// POST /api/routes/:id/duplicate
router.post('/:id/duplicate', authenticate, authorize([Role.ADMIN, Role.OPERATOR]), async (req, res, next) => {
  try {
    const route = await routeService.duplicateRoute(req.params.id, req.user!.userId)
    res.status(201).json({ success: true, data: route })
  } catch (err) {
    next(err)
  }
})

// POST /api/routes/:id/test
router.post('/:id/test', authenticate, authorize([Role.ADMIN, Role.OPERATOR]), async (req, res, next) => {
  try {
    const route = await routeService.getRouteById(req.params.id)

    const { method = 'GET', path = route.publicPath, headers = {}, body } = req.body

    // Build a mock request-like object for the proxy
    const mockReq = {
      method: method.toUpperCase(),
      path,
      hostname: 'localhost',
      ip: req.ip,
      protocol: 'https',
      query: {},
      headers: {
        'content-type': 'application/json',
        ...headers,
      },
      body: body || undefined,
      get: (key: string) => (mockReq.headers as any)[key.toLowerCase()] || '',
      socket: { remoteAddress: req.ip },
    } as any

    const start = Date.now()
    let responseStatus: number | undefined
    let responseBody: string | undefined
    let responseHeaders: Record<string, string> = {}

    const mockRes = {
      statusCode: 200,
      setHeader: (key: string, value: string) => { responseHeaders[key] = value },
      status: (code: number) => {
        mockRes.statusCode = code
        responseStatus = code
        return mockRes
      },
      send: (data: Buffer | string) => {
        responseBody = typeof data === 'string' ? data : data.toString('utf8').slice(0, 10000)
        return mockRes
      },
      json: (data: unknown) => {
        responseBody = JSON.stringify(data).slice(0, 10000)
        return mockRes
      },
    } as any

    try {
      await proxyRequest(route, mockReq, mockRes)
    } catch (proxyErr) {
      const duration = Date.now() - start
      return res.json({
        success: true,
        data: {
          status: 503,
          duration,
          error: (proxyErr as Error).message,
          headers: responseHeaders,
        },
      })
    }

    const duration = Date.now() - start

    res.json({
      success: true,
      data: {
        status: responseStatus || mockRes.statusCode,
        duration,
        headers: responseHeaders,
        body: responseBody,
      },
    })
  } catch (err) {
    next(err)
  }
})

// GET /api/routes/:id/health
router.get('/:id/health', authenticate, async (req, res, next) => {
  try {
    const route = await prisma.route.findUnique({
      where: { id: req.params.id, deletedAt: null },
    })
    if (!route) throw AppError.notFound('Route')

    const result = await healthService.checkRouteHealth(route)
    res.json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
})

// GET /api/routes/:id/versions
router.get('/:id/versions', authenticate, async (req, res, next) => {
  try {
    const versions = await routeService.getRouteVersions(req.params.id)
    res.json({ success: true, data: versions })
  } catch (err) {
    next(err)
  }
})

// POST /api/routes/:id/versions/:versionId/restore
router.post('/:id/versions/:versionId/restore', authenticate, authorize([Role.ADMIN]), async (req, res, next) => {
  try {
    const route = await routeService.restoreRouteVersion(
      req.params.id,
      req.params.versionId,
      req.user!.userId
    )
    res.json({ success: true, data: route })
  } catch (err) {
    next(err)
  }
})

// GET /api/routes/:id/logs
router.get('/:id/logs', authenticate, async (req, res, next) => {
  try {
    const { page = '1', pageSize = '50', method, statusType, dateFrom, dateTo } = req.query

    const result = await logService.getRouteLogs(
      {
        routeId: req.params.id,
        method: method as string,
        statusType: statusType as 'success' | 'error',
        dateFrom: dateFrom ? new Date(String(dateFrom)) : undefined,
        dateTo: dateTo ? new Date(String(dateTo)) : undefined,
      },
      { page: parseInt(String(page)), pageSize: parseInt(String(pageSize)) }
    )

    res.json({ success: true, ...result })
  } catch (err) {
    next(err)
  }
})

// GET /api/routes/:id/stats
router.get('/:id/stats', authenticate, async (req, res, next) => {
  try {
    const stats = await logService.getRouteStats(req.params.id)
    const daily = await logService.getDailyRequestCounts(req.params.id, 7)
    res.json({ success: true, data: { ...stats, daily } })
  } catch (err) {
    next(err)
  }
})

export default router
