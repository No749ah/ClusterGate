import { Router } from 'express'
import { readFileSync } from 'fs'
import { join } from 'path'
import { prisma } from '../lib/prisma'
import { authenticate } from '../middleware/authenticate'

const router = Router()

function getVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8'))
    return pkg.version || '1.0.0'
  } catch {
    return process.env.npm_package_version || '1.0.0'
  }
}

// GET /api/health/live — Kubernetes liveness probe (public, no sensitive data)
router.get('/live', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() })
})

// GET /api/health/ready — Kubernetes readiness probe (public, no sensitive data)
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

// GET /api/health/status — Full system status (requires auth — exposes infra info)
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
