import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { getVersion } from '../lib/version'
import { authenticate } from '../middleware/authenticate'

const router = Router()

/**
 * @openapi
 * /api/health/live:
 *   get:
 *     tags: [Health]
 *     summary: Liveness probe
 *     description: Kubernetes liveness probe. Returns 200 if the process is alive.
 *     security: []
 *     responses:
 *       200:
 *         description: Process is alive
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
router.get('/live', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() })
})

/**
 * @openapi
 * /api/health/ready:
 *   get:
 *     tags: [Health]
 *     summary: Readiness probe
 *     description: Kubernetes readiness probe. Returns 200 if the database is reachable, 503 otherwise.
 *     security: []
 *     responses:
 *       200:
 *         description: Service is ready
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ready
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       503:
 *         description: Service is not ready (database unreachable)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: not_ready
 *                 error:
 *                   type: string
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
router.get('/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    res.status(200).json({ status: 'ready', timestamp: new Date().toISOString() })
  } catch (err) {
    res.status(503).json({
      status: 'not_ready',
      error: 'Database connection failed',
      timestamp: new Date().toISOString(),
    })
  }
})

/**
 * @openapi
 * /api/health/status:
 *   get:
 *     tags: [Health]
 *     summary: Full system status
 *     description: Returns detailed system health including database latency, memory usage, and version info. Requires authentication.
 *     responses:
 *       200:
 *         description: System status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [healthy, degraded]
 *                 version:
 *                   type: string
 *                 uptime:
 *                   type: integer
 *                   description: Uptime in seconds
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 database:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       enum: [ok, error]
 *                     latency:
 *                       type: integer
 *                       description: Database latency in ms
 *                 memory:
 *                   type: object
 *                   properties:
 *                     heapUsed:
 *                       type: integer
 *                       description: Heap used in MB
 *                     heapTotal:
 *                       type: integer
 *                       description: Total heap in MB
 *                     rss:
 *                       type: integer
 *                       description: RSS in MB
 *                     external:
 *                       type: integer
 *                       description: External memory in MB
 *       401:
 *         description: Not authenticated
 */
router.get('/status', authenticate, async (_req, res) => {
  const memoryUsage = process.memoryUsage()
  let dbStatus = 'ok'
  let dbLatency: number | undefined

  try {
    const start = Date.now()
    await prisma.$queryRaw`SELECT 1`
    dbLatency = Date.now() - start
  } catch {
    dbStatus = 'error'
  }

  res.json({
    status: dbStatus === 'ok' ? 'healthy' : 'degraded',
    version: getVersion(),
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    database: {
      status: dbStatus,
      latency: dbLatency,
    },
    memory: {
      heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
      rss: Math.round(memoryUsage.rss / 1024 / 1024),
      external: Math.round(memoryUsage.external / 1024 / 1024),
    },
  })
})

export default router
