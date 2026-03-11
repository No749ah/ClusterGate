import { Router } from 'express'
import { authenticate } from '../middleware/authenticate'
import { authorize } from '../middleware/authenticate'
import { checkForUpdates, pullAndRestart } from '../services/updateService'
import { prisma } from '../lib/prisma'
import { getVersion } from '../lib/version'
import { runAllHealthChecks } from '../services/healthService'
import { cleanOldLogs } from '../services/logService'
import { config } from '../config'

const router = Router()

// All system routes require admin
router.use(authenticate)
router.use(authorize(['ADMIN']))

/**
 * GET /api/system/version
 * Returns the current running version.
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
 * GET /api/system/update-check
 * Check GHCR for newer images.
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
 * POST /api/system/update
 * Pull latest images via Docker socket.
 */
router.post('/update', async (_req, res, next) => {
  try {
    const result = await pullAndRestart()
    res.json({
      success: result.success,
      data: result,
    })
  } catch (err) {
    next(err)
  }
})

/**
 * GET /api/system/config
 * Get current runtime configuration (admin only).
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
 * GET /api/system/stats
 * Get database and system statistics.
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
 * POST /api/system/health-check
 * Trigger health checks for all active routes immediately.
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
 * POST /api/system/cleanup-logs
 * Manually trigger log cleanup with optional custom retention days.
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
 * POST /api/system/cleanup-health-checks
 * Clean old health check records.
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
 * POST /api/system/cleanup-audit-logs
 * Clean old audit log records.
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
 * GET /api/system/audit-export
 * Export audit logs as JSON.
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
 * POST /api/system/force-logout-all
 * Invalidate all user sessions by updating a global logout timestamp.
 * NOTE: This approach is simple — it bumps each user's updatedAt which
 * the JWT validation can check against. For full session invalidation,
 * we'd need a session store.
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
