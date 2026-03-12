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
import { stripSensitiveRouteFields, safePageSize, validateTargetUrlSync } from '../lib/security'

const router = Router()

// Route schema
const routeBodySchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  publicPath: z.string().min(1, 'Public path is required').startsWith('/r/', 'Public path must start with /r/'),
  targetUrl: z.string().url('Target URL must be a valid URL'),
  methods: z.array(z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])).min(1),
  tags: z.array(z.string()).default([]),
  timeout: z.number().int().min(1000).max(120000).default(30000),
  retryCount: z.number().int().min(0).max(5).default(0),
  retryDelay: z.number().int().min(100).max(10000).default(1000),
  stripPrefix: z.boolean().default(false),
  sslVerify: z.boolean().default(true),
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
  rateLimitEnabled: z.boolean().default(false),
  rateLimitMax: z.coerce.number().int().min(1).max(100000).default(100),
  rateLimitWindow: z.coerce.number().int().min(1000).max(3600000).default(60000),
  maintenanceMode: z.boolean().default(false),
  maintenanceMessage: z.string().optional(),
  // WebSocket
  wsEnabled: z.boolean().default(false),
  // Circuit Breaker
  circuitBreakerEnabled: z.boolean().default(false),
  cbFailureThreshold: z.number().int().min(1).max(100).default(5),
  cbRecoveryTimeout: z.number().int().min(1000).max(300000).default(30000),
  // Load Balancing
  lbStrategy: z.enum(['ROUND_ROBIN', 'WEIGHTED', 'FAILOVER']).default('ROUND_ROBIN'),
  // Group & Org
  routeGroupId: z.string().nullable().optional(),
  organizationId: z.string().nullable().optional(),
})

/**
 * @openapi
 * /api/routes:
 *   get:
 *     tags: [Routes]
 *     summary: List routes
 *     description: Returns a paginated list of proxy routes with optional filtering and sorting.
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name or path
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [DRAFT, ACTIVE, INACTIVE]
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: string
 *           enum: ['true', 'false']
 *       - in: query
 *         name: tags
 *         schema:
 *           type: string
 *         description: Comma-separated tag list
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *       - in: query
 *         name: sortDir
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *     responses:
 *       200:
 *         description: Paginated route list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Route'
 *                 meta:
 *                   $ref: '#/components/schemas/PaginationMeta'
 *       401:
 *         description: Not authenticated
 */
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
        page: parseInt(String(page)) || 1,
        pageSize: safePageSize(pageSize as string),
        sortBy: sortBy as string,
        sortDir: (sortDir as 'asc' | 'desc') || 'desc',
      }
    )

    result.data = result.data.map((r: any) => stripSensitiveRouteFields(r))
    res.json({ success: true, ...result })
  } catch (err) {
    next(err)
  }
})

/**
 * @openapi
 * /api/routes/check-path:
 *   get:
 *     tags: [Routes]
 *     summary: Check path availability
 *     description: Checks whether a public path is available for use by a route.
 *     parameters:
 *       - in: query
 *         name: path
 *         required: true
 *         schema:
 *           type: string
 *         description: The public path to check
 *       - in: query
 *         name: excludeId
 *         schema:
 *           type: string
 *         description: Route ID to exclude from the check (for updates)
 *     responses:
 *       200:
 *         description: Path availability result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     available:
 *                       type: boolean
 *                     existingRoute:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         id:
 *                           type: string
 *                         name:
 *                           type: string
 */
router.get('/check-path', authenticate, async (req, res, next) => {
  try {
    const path = req.query.path as string
    const excludeId = req.query.excludeId as string | undefined
    if (!path) {
      return res.json({ success: true, data: { available: true } })
    }

    const existing = await prisma.route.findFirst({
      where: {
        publicPath: path,
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true, name: true },
    })

    res.json({
      success: true,
      data: {
        available: !existing,
        existingRoute: existing ? { id: existing.id, name: existing.name } : null,
      },
    })
  } catch (err) {
    next(err)
  }
})

/**
 * @openapi
 * /api/routes/export:
 *   get:
 *     tags: [Routes]
 *     summary: Export routes
 *     description: Exports all routes as a JSON file download. Requires ADMIN or OPERATOR role.
 *     responses:
 *       200:
 *         description: JSON file with all routes
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Route'
 *                 exportedAt:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient permissions
 */
router.get('/export', authenticate, authorize([Role.ADMIN, Role.OPERATOR]), async (_req, res, next) => {
  try {
    const routes = await routeService.exportRoutes()
    res.setHeader('Content-Disposition', 'attachment; filename="clustergate-routes.json"')
    res.json({ success: true, data: routes, exportedAt: new Date().toISOString() })
  } catch (err) {
    next(err)
  }
})

/**
 * @openapi
 * /api/routes/import:
 *   post:
 *     tags: [Routes]
 *     summary: Import routes
 *     description: Imports routes from a JSON payload. Requires ADMIN role.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [routes]
 *             properties:
 *               routes:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/RouteBody'
 *     responses:
 *       200:
 *         description: Import result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient permissions
 */
router.post('/import', authenticate, authorize([Role.ADMIN]), async (req, res, next) => {
  try {
    const { routes } = z.object({ routes: z.array(routeBodySchema) }).parse(req.body)
    const result = await routeService.importRoutes(routes as any[], req.user!.userId)
    res.json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
})

/**
 * @openapi
 * /api/routes/{id}/uptime:
 *   get:
 *     tags: [Routes]
 *     summary: Get route uptime
 *     description: Returns uptime statistics for a specific route over a given number of days.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 7
 *     responses:
 *       200:
 *         description: Uptime data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *       404:
 *         description: Route not found
 */
router.get('/:id/uptime', authenticate, async (req, res, next) => {
  try {
    const days = parseInt(String(req.query.days)) || 7
    const route = await prisma.route.findUnique({
      where: { id: req.params.id, deletedAt: null },
    })
    if (!route) throw AppError.notFound('Route')

    const result = await healthService.getRouteUptime(req.params.id, days)
    res.json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
})

/**
 * @openapi
 * /api/routes/{id}:
 *   get:
 *     tags: [Routes]
 *     summary: Get route by ID
 *     description: Returns a single route by its ID.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Route details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Route'
 *       404:
 *         description: Route not found
 */
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const route = await routeService.getRouteById(req.params.id)
    const data = stripSensitiveRouteFields(route as any)
    res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
})

/**
 * @openapi
 * /api/routes:
 *   post:
 *     tags: [Routes]
 *     summary: Create route
 *     description: Creates a new proxy route. Requires ADMIN or OPERATOR role.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RouteBody'
 *     responses:
 *       201:
 *         description: Route created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Route'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient permissions
 */
router.post('/', authenticate, authorize([Role.ADMIN, Role.OPERATOR]), async (req, res, next) => {
  try {
    const data = routeBodySchema.parse(req.body)
    const route = await routeService.createRoute(data as any, req.user!.userId)
    res.status(201).json({ success: true, data: route })
  } catch (err) {
    next(err)
  }
})

/**
 * @openapi
 * /api/routes/{id}:
 *   put:
 *     tags: [Routes]
 *     summary: Update route
 *     description: Updates an existing proxy route. All fields are optional (partial update). Requires ADMIN or OPERATOR role.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RouteBody'
 *     responses:
 *       200:
 *         description: Route updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Route'
 *       400:
 *         description: Validation error
 *       404:
 *         description: Route not found
 */
router.put('/:id', authenticate, authorize([Role.ADMIN, Role.OPERATOR]), async (req, res, next) => {
  try {
    const data = routeBodySchema.partial().parse(req.body)
    const route = await routeService.updateRoute(req.params.id, data as any, req.user!.userId)
    res.json({ success: true, data: route })
  } catch (err) {
    next(err)
  }
})

/**
 * @openapi
 * /api/routes/{id}:
 *   delete:
 *     tags: [Routes]
 *     summary: Delete route
 *     description: Soft-deletes a route. Requires ADMIN role.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Route deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       404:
 *         description: Route not found
 */
router.delete('/:id', authenticate, authorize([Role.ADMIN]), async (req, res, next) => {
  try {
    await routeService.deleteRoute(req.params.id)
    res.json({ success: true, message: 'Route deleted successfully' })
  } catch (err) {
    next(err)
  }
})

/**
 * @openapi
 * /api/routes/{id}/publish:
 *   post:
 *     tags: [Routes]
 *     summary: Publish route
 *     description: Publishes a draft or inactive route, making it active. Requires ADMIN or OPERATOR role.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Route published
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Route'
 *       404:
 *         description: Route not found
 */
router.post('/:id/publish', authenticate, authorize([Role.ADMIN, Role.OPERATOR]), async (req, res, next) => {
  try {
    const route = await routeService.publishRoute(req.params.id, req.user!.userId)
    res.json({ success: true, data: route })
  } catch (err) {
    next(err)
  }
})

/**
 * @openapi
 * /api/routes/{id}/deactivate:
 *   post:
 *     tags: [Routes]
 *     summary: Deactivate route
 *     description: Deactivates an active route. Requires ADMIN or OPERATOR role.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Route deactivated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Route'
 *       404:
 *         description: Route not found
 */
router.post('/:id/deactivate', authenticate, authorize([Role.ADMIN, Role.OPERATOR]), async (req, res, next) => {
  try {
    const route = await routeService.deactivateRoute(req.params.id, req.user!.userId)
    res.json({ success: true, data: route })
  } catch (err) {
    next(err)
  }
})

/**
 * @openapi
 * /api/routes/{id}/duplicate:
 *   post:
 *     tags: [Routes]
 *     summary: Duplicate route
 *     description: Creates a copy of an existing route with a new auto-generated path. Requires ADMIN or OPERATOR role.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       201:
 *         description: Route duplicated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Route'
 *       404:
 *         description: Route not found
 */
router.post('/:id/duplicate', authenticate, authorize([Role.ADMIN, Role.OPERATOR]), async (req, res, next) => {
  try {
    const route = await routeService.duplicateRoute(req.params.id, req.user!.userId)
    res.status(201).json({ success: true, data: route })
  } catch (err) {
    next(err)
  }
})

/**
 * @openapi
 * /api/routes/{id}/test:
 *   post:
 *     tags: [Routes]
 *     summary: Test route
 *     description: Sends a test request through the proxy to verify the route configuration. Requires ADMIN or OPERATOR role.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               method:
 *                 type: string
 *                 enum: [GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS]
 *                 default: GET
 *               path:
 *                 type: string
 *                 description: Override the request path
 *               headers:
 *                 type: object
 *                 additionalProperties:
 *                   type: string
 *               body:
 *                 description: Request body to forward
 *               skipAuth:
 *                 type: boolean
 *                 description: Skip auth enforcement for this test
 *     responses:
 *       200:
 *         description: Test result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: integer
 *                     duration:
 *                       type: integer
 *                       description: Response time in ms
 *                     headers:
 *                       type: object
 *                       additionalProperties:
 *                         type: string
 *                     body:
 *                       type: string
 *                     error:
 *                       type: string
 *       404:
 *         description: Route not found
 */
router.post('/:id/test', authenticate, authorize([Role.ADMIN, Role.OPERATOR]), async (req, res, next) => {
  try {
    const route = await routeService.getRouteById(req.params.id)

    // SSRF protection — block test requests to private/internal URLs
    try {
      validateTargetUrlSync(route.targetUrl)
    } catch (err) {
      return res.json({
        success: true,
        data: { status: 403, duration: 0, error: `SSRF blocked: ${(err as Error).message}`, headers: {} },
      })
    }

    const { method = 'GET', path = route.publicPath, headers = {}, body, skipAuth } = req.body

    // If skipAuth is requested, temporarily disable auth enforcement for this test
    if (skipAuth === true) {
      ;(route as any).requireAuth = false
    }

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

/**
 * @openapi
 * /api/routes/{id}/health:
 *   get:
 *     tags: [Routes]
 *     summary: Check route health
 *     description: Runs a health check against the route's target URL and returns the result.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Health check result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       enum: [healthy, unhealthy]
 *                     statusCode:
 *                       type: integer
 *                     latency:
 *                       type: integer
 *       404:
 *         description: Route not found
 */
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

/**
 * @openapi
 * /api/routes/{id}/versions:
 *   get:
 *     tags: [Routes]
 *     summary: Get route versions
 *     description: Returns all configuration versions for a route.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: List of route versions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       version:
 *                         type: integer
 *                       config:
 *                         type: object
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       createdBy:
 *                         type: string
 *       404:
 *         description: Route not found
 */
router.get('/:id/versions', authenticate, async (req, res, next) => {
  try {
    const versions = await routeService.getRouteVersions(req.params.id)
    res.json({ success: true, data: versions })
  } catch (err) {
    next(err)
  }
})

/**
 * @openapi
 * /api/routes/{id}/versions/{versionId}/restore:
 *   post:
 *     tags: [Routes]
 *     summary: Restore route version
 *     description: Restores a route to a previous version. Requires ADMIN role.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: versionId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Route restored
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Route'
 *       404:
 *         description: Route or version not found
 */
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

/**
 * @openapi
 * /api/routes/{id}/logs:
 *   get:
 *     tags: [Routes]
 *     summary: Get route request logs
 *     description: Returns paginated request logs for a specific route.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: method
 *         schema:
 *           type: string
 *       - in: query
 *         name: statusType
 *         schema:
 *           type: string
 *           enum: [success, error]
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date-time
 *     responses:
 *       200:
 *         description: Paginated request logs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                 meta:
 *                   $ref: '#/components/schemas/PaginationMeta'
 */
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
      { page: parseInt(String(page)) || 1, pageSize: safePageSize(pageSize as string) }
    )

    res.json({ success: true, ...result })
  } catch (err) {
    next(err)
  }
})

/**
 * @openapi
 * /api/routes/{id}/stats:
 *   get:
 *     tags: [Routes]
 *     summary: Get route statistics
 *     description: Returns request statistics and daily request counts for a route.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Route stats
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalRequests:
 *                       type: integer
 *                     avgResponseTime:
 *                       type: number
 *                     errorRate:
 *                       type: number
 *                     daily:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           date:
 *                             type: string
 *                           count:
 *                             type: integer
 */
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
