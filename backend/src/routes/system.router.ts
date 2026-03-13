import { Router } from 'express'
import { authenticate } from '../middleware/authenticate'
import { authorize } from '../middleware/authenticate'
import { checkForUpdates, pullAndRestart, getCachedUpdateStatus } from '../services/updateService'
import { prisma } from '../lib/prisma'
import { getVersion } from '../lib/version'
import { runAllHealthChecks } from '../services/healthService'
import { cleanOldLogs } from '../services/logService'
import { config } from '../config'
import axios from 'axios'

const router = Router()

// All system routes require admin
router.use(authenticate)
router.use(authorize(['ADMIN']))

/**
 * @openapi
 * /api/system/version:
 *   get:
 *     tags: [System]
 *     summary: Get current version
 *     description: Returns the current running version of ClusterGate. Requires ADMIN role.
 *     responses:
 *       200:
 *         description: Version info
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
 *                     version:
 *                       type: string
 *                       example: "1.2.1"
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient permissions
 */
router.get('/version', (_req, res) => {
  res.json({
    success: true,
    data: {
      version: getVersion(),
    },
  })
})

/**
 * @openapi
 * /api/system/update-status:
 *   get:
 *     tags: [System]
 *     summary: Get cached update status
 *     description: Returns the cached result of the last update check. No external API call is made. Requires ADMIN role.
 *     responses:
 *       200:
 *         description: Cached update status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   nullable: true
 *                   properties:
 *                     hasUpdate:
 *                       type: boolean
 *                     currentVersion:
 *                       type: string
 *                     latestVersion:
 *                       type: string
 *                     checkedAt:
 *                       type: string
 *                       format: date-time
 */
router.get('/update-status', (_req, res) => {
  const cached = getCachedUpdateStatus()
  res.json({ success: true, data: cached })
})

/**
 * @openapi
 * /api/system/update-check:
 *   get:
 *     tags: [System]
 *     summary: Check for updates
 *     description: Checks GHCR for newer container images (forces a fresh check). Requires ADMIN role.
 *     responses:
 *       200:
 *         description: Update check result
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
 *                     hasUpdate:
 *                       type: boolean
 *                     currentVersion:
 *                       type: string
 *                     latestVersion:
 *                       type: string
 */
router.get('/update-check', async (_req, res, next) => {
  try {
    const result = await checkForUpdates()
    res.json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
})

/**
 * @openapi
 * /api/system/update:
 *   post:
 *     tags: [System]
 *     summary: Trigger update
 *     description: Triggers an update with SSE progress stream. Response is a Server-Sent Events stream. Requires ADMIN role.
 *     responses:
 *       200:
 *         description: SSE stream of update progress events
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 */
router.post('/update', async (_req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no') // disable nginx/istio buffering
  res.flushHeaders()

  const sendEvent = (data: unknown) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  try {
    const result = await pullAndRestart((event) => {
      sendEvent({ type: 'progress', ...event })
    })
    sendEvent({ type: 'complete', ...result })
  } catch (err: any) {
    sendEvent({ type: 'error', message: err.message })
  } finally {
    res.end()
  }
})

/**
 * @openapi
 * /api/system/config:
 *   get:
 *     tags: [System]
 *     summary: Get runtime configuration
 *     description: Returns current runtime configuration values. Requires ADMIN role.
 *     responses:
 *       200:
 *         description: Runtime config
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
 *                     logRetentionDays:
 *                       type: integer
 *                     proxyTimeout:
 *                       type: integer
 *                     rateLimitWindowMs:
 *                       type: integer
 *                     rateLimitMax:
 *                       type: integer
 *                     authRateLimitMax:
 *                       type: integer
 *                     metricsEnabled:
 *                       type: boolean
 *                     logLevel:
 *                       type: string
 *                     jwtExpiresIn:
 *                       type: string
 *                     nodeEnv:
 *                       type: string
 */
router.get('/config', (_req, res) => {
  res.json({
    success: true,
    data: {
      logRetentionDays: config.LOG_RETENTION_DAYS,
      proxyTimeout: config.PROXY_TIMEOUT,
      rateLimitWindowMs: config.RATE_LIMIT_WINDOW_MS,
      rateLimitMax: config.RATE_LIMIT_MAX,
      authRateLimitMax: config.AUTH_RATE_LIMIT_MAX,
      metricsEnabled: config.METRICS_ENABLED,
      logLevel: config.LOG_LEVEL,
      jwtExpiresIn: config.JWT_EXPIRES_IN,
      nodeEnv: config.NODE_ENV,
    },
  })
})

/**
 * @openapi
 * /api/system/release-notes:
 *   get:
 *     tags: [System]
 *     summary: Get release notes from GitHub
 *     description: Fetches release notes for a specific version tag from GitHub. Requires ADMIN role.
 *     parameters:
 *       - name: tag
 *         in: query
 *         schema:
 *           type: string
 *         description: Version tag (e.g., "1.5.0"). Defaults to latest release.
 *     responses:
 *       200:
 *         description: Release notes
 */
router.get('/release-notes', async (req, res, next) => {
  try {
    const tag = req.query.tag as string | undefined

    let url: string
    if (tag) {
      // Fetch specific release by tag
      const cleanTag = tag.replace(/^v/, '')
      url = `https://api.github.com/repos/No749ah/ClusterGate/releases/tags/v${cleanTag}`
    } else {
      // Fetch latest release
      url = `https://api.github.com/repos/No749ah/ClusterGate/releases/latest`
    }

    try {
      const response = await axios.get(url, {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'ClusterGate-Backend',
        },
        timeout: 10000,
      })

      res.json({
        success: true,
        data: {
          tag: response.data.tag_name,
          name: response.data.name,
          body: response.data.body,
          publishedAt: response.data.published_at,
          htmlUrl: response.data.html_url,
        },
      })
    } catch (err: any) {
      if (err.response?.status === 404) {
        res.json({ success: true, data: null })
      } else {
        throw err
      }
    }
  } catch (err) {
    next(err)
  }
})

/**
 * @openapi
 * /api/system/stats:
 *   get:
 *     tags: [System]
 *     summary: Get system statistics
 *     description: Returns database counts, system info, memory usage, and DB size. Requires ADMIN role.
 *     responses:
 *       200:
 *         description: System statistics
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
 *                     counts:
 *                       type: object
 *                       properties:
 *                         users:
 *                           type: integer
 *                         routes:
 *                           type: integer
 *                         activeRoutes:
 *                           type: integer
 *                         requestLogs:
 *                           type: integer
 *                         auditLogs:
 *                           type: integer
 *                         apiKeys:
 *                           type: integer
 *                         healthChecks:
 *                           type: integer
 *                     database:
 *                       type: object
 *                       properties:
 *                         size:
 *                           type: string
 *                           nullable: true
 *                         oldestLog:
 *                           type: string
 *                           format: date-time
 *                           nullable: true
 *                     system:
 *                       type: object
 *                       properties:
 *                         uptime:
 *                           type: integer
 *                         version:
 *                           type: string
 *                         nodeVersion:
 *                           type: string
 *                         platform:
 *                           type: string
 *                         memory:
 *                           type: object
 *                           properties:
 *                             heapUsed:
 *                               type: integer
 *                             heapTotal:
 *                               type: integer
 *                             rss:
 *                               type: integer
 */
router.get('/stats', async (_req, res, next) => {
  try {
    const [
      userCount,
      routeCount,
      activeRouteCount,
      logCount,
      auditCount,
      apiKeyCount,
      healthCheckCount,
    ] = await Promise.all([
      prisma.user.count({ where: { isActive: true } }),
      prisma.route.count({ where: { deletedAt: null } }),
      prisma.route.count({ where: { isActive: true, deletedAt: null } }),
      prisma.requestLog.count(),
      prisma.auditLog.count(),
      prisma.apiKey.count(),
      prisma.healthCheck.count(),
    ])

    const memoryUsage = process.memoryUsage()

    // Get DB size estimate
    let dbSize: string | null = null
    try {
      const result = await prisma.$queryRaw<{ size: string }[]>`
        SELECT pg_size_pretty(pg_database_size(current_database())) as size
      `
      dbSize = result[0]?.size || null
    } catch {}

    // Get oldest log
    let oldestLog: Date | null = null
    try {
      const oldest = await prisma.requestLog.findFirst({ orderBy: { createdAt: 'asc' }, select: { createdAt: true } })
      oldestLog = oldest?.createdAt || null
    } catch {}

    res.json({
      success: true,
      data: {
        counts: {
          users: userCount,
          routes: routeCount,
          activeRoutes: activeRouteCount,
          requestLogs: logCount,
          auditLogs: auditCount,
          apiKeys: apiKeyCount,
          healthChecks: healthCheckCount,
        },
        database: {
          size: dbSize,
          oldestLog,
        },
        system: {
          uptime: Math.floor(process.uptime()),
          version: getVersion(),
          nodeVersion: process.version,
          platform: process.platform,
          memory: {
            heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
            heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
            rss: Math.round(memoryUsage.rss / 1024 / 1024),
          },
        },
      },
    })
  } catch (err) {
    next(err)
  }
})

/**
 * @openapi
 * /api/system/health-check:
 *   post:
 *     tags: [System]
 *     summary: Trigger health checks
 *     description: Runs health checks for all active routes immediately. Requires ADMIN role.
 *     responses:
 *       200:
 *         description: Health checks completed
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
 *                     message:
 *                       type: string
 */
router.post('/health-check', async (_req, res, next) => {
  try {
    await runAllHealthChecks()
    res.json({ success: true, data: { message: 'Health checks completed' } })
  } catch (err) {
    next(err)
  }
})

/**
 * @openapi
 * /api/system/cleanup-logs:
 *   post:
 *     tags: [System]
 *     summary: Clean up request logs
 *     description: Manually triggers log cleanup with optional custom retention period. Requires ADMIN role.
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               days:
 *                 type: integer
 *                 description: Retention period in days (defaults to configured value)
 *     responses:
 *       200:
 *         description: Cleanup result
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
 *                     deleted:
 *                       type: integer
 *                     retentionDays:
 *                       type: integer
 */
router.post('/cleanup-logs', async (req, res, next) => {
  try {
    const days = req.body?.days || config.LOG_RETENTION_DAYS
    const deleted = await cleanOldLogs(days)
    res.json({ success: true, data: { deleted, retentionDays: days } })
  } catch (err) {
    next(err)
  }
})

/**
 * @openapi
 * /api/system/cleanup-health-checks:
 *   post:
 *     tags: [System]
 *     summary: Clean up health check records
 *     description: Deletes old health check records. Requires ADMIN role.
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               days:
 *                 type: integer
 *                 default: 30
 *                 description: Retention period in days
 *     responses:
 *       200:
 *         description: Cleanup result
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
 *                     deleted:
 *                       type: integer
 *                     retentionDays:
 *                       type: integer
 */
router.post('/cleanup-health-checks', async (req, res, next) => {
  try {
    const days = req.body?.days || 30
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)
    const result = await prisma.healthCheck.deleteMany({
      where: { createdAt: { lt: cutoff } },
    })
    res.json({ success: true, data: { deleted: result.count, retentionDays: days } })
  } catch (err) {
    next(err)
  }
})

/**
 * @openapi
 * /api/system/cleanup-audit-logs:
 *   post:
 *     tags: [System]
 *     summary: Clean up audit logs
 *     description: Deletes old audit log records. Requires ADMIN role.
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               days:
 *                 type: integer
 *                 default: 365
 *                 description: Retention period in days
 *     responses:
 *       200:
 *         description: Cleanup result
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
 *                     deleted:
 *                       type: integer
 *                     retentionDays:
 *                       type: integer
 */
router.post('/cleanup-audit-logs', async (req, res, next) => {
  try {
    const days = req.body?.days || 365
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)
    const result = await prisma.auditLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    })
    res.json({ success: true, data: { deleted: result.count, retentionDays: days } })
  } catch (err) {
    next(err)
  }
})

/**
 * @openapi
 * /api/system/audit-export:
 *   get:
 *     tags: [System]
 *     summary: Export audit logs
 *     description: Exports up to 10,000 audit logs as a JSON file download. Requires ADMIN role.
 *     responses:
 *       200:
 *         description: JSON file with audit logs
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
 *                 exportedAt:
 *                   type: string
 *                   format: date-time
 *                 count:
 *                   type: integer
 */
router.get('/audit-export', async (req, res, next) => {
  try {
    const logs = await prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10000,
      include: { user: { select: { id: true, name: true, email: true } } },
    })
    res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${new Date().toISOString().slice(0, 10)}.json"`)
    res.json({ success: true, data: logs, exportedAt: new Date().toISOString(), count: logs.length })
  } catch (err) {
    next(err)
  }
})

/**
 * @openapi
 * /api/system/force-logout-all:
 *   post:
 *     tags: [System]
 *     summary: Force logout all users
 *     description: Invalidates all user sessions except the requesting admin's. Other users will need to re-authenticate. Requires ADMIN role.
 *     responses:
 *       200:
 *         description: Logout result
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
 *                     affectedUsers:
 *                       type: integer
 *                     message:
 *                       type: string
 */
router.post('/force-logout-all', async (req, res, next) => {
  try {
    const result = await prisma.user.updateMany({
      where: { isActive: true, id: { not: (req as any).user.id } },
      data: { updatedAt: new Date() },
    })
    res.json({ success: true, data: { affectedUsers: result.count, message: 'All other users will need to re-authenticate' } })
  } catch (err) {
    next(err)
  }
})

export default router
