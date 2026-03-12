import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import compression from 'compression'
import swaggerUi from 'swagger-ui-express'
import { swaggerSpec } from './lib/swagger'
import { config } from './config'
import { logger } from './lib/logger'
import { getVersion } from './lib/version'
import { prisma } from './lib/prisma'
import { registry } from './lib/metrics'
import { globalLimiter, proxyLimiter } from './middleware/rateLimiter'
import { requestLogger } from './middleware/requestLogger'
import { auditLogger } from './middleware/auditLogger'
import { errorHandler, notFoundHandler } from './middleware/errorHandler'
import { proxyHandler } from './proxy/proxyHandler'
import { startCronJobs, stopCronJobs } from './cron/jobs'

// Route handlers
import authRouter from './routes/auth.router'
import routesRouter from './routes/routes.router'
import usersRouter from './routes/users.router'
import logsRouter from './routes/logs.router'
import healthRouter from './routes/health.router'
import auditRouter from './routes/audit.router'
import apikeysRouter from './routes/apikeys.router'
import notificationsRouter from './routes/notifications.router'
import systemRouter from './routes/system.router'
import analyticsRouter from './routes/analytics.router'
import backupRouter from './routes/backup.router'
import routeGroupsRouter from './routes/routegroups.router'
import organizationsRouter from './routes/organizations.router'
import transformsRouter from './routes/transforms.router'
import targetsRouter from './routes/targets.router'
import { handleWebSocketUpgrade } from './proxy/wsHandler'

const app = express()

// ============================================================================
// Security Middleware
// ============================================================================

app.use(
  helmet({
    contentSecurityPolicy: false, // Managed by frontend
    crossOriginEmbedderPolicy: false,
  })
)

app.use(
  cors({
    origin: config.allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Webhook-Signature', 'X-Hub-Signature-256'],
  })
)

app.set('trust proxy', 1) // Trust first proxy (for correct IP in k8s)

// ============================================================================
// Parsing & Compression
// ============================================================================

app.use(cookieParser())
app.use(express.json({ limit: '5mb' }))
app.use(express.urlencoded({ extended: true, limit: '5mb' }))
app.use(compression())

// ============================================================================
// Logging & Rate Limiting
// ============================================================================

app.use(requestLogger)
app.use(globalLimiter)

// ============================================================================
// Metrics endpoint
// ============================================================================

app.get('/metrics', async (req, res) => {
  // Protect metrics endpoint — require secret via header (not query param)
  if (config.METRICS_SECRET) {
    const providedSecret = req.get('X-Metrics-Secret')
    if (providedSecret !== config.METRICS_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
  } else {
    // No secret configured — block public access in production
    if (config.isProd) {
      return res.status(403).json({ error: 'Metrics secret not configured' })
    }
  }
  res.set('Content-Type', registry.contentType)
  res.send(await registry.metrics())
})

// ============================================================================
// Swagger / OpenAPI Docs
// ============================================================================

app.get('/api/docs.json', (_req, res) => {
  res.setHeader('Content-Type', 'application/json')
  res.send(swaggerSpec)
})
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'ClusterGate API Docs',
}))

// ============================================================================
// API Routes
// ============================================================================

app.use('/api/health', healthRouter)
app.use('/api/auth', authRouter)
app.use('/api/routes', auditLogger, routesRouter)
app.use('/api/users', auditLogger, usersRouter)
app.use('/api/logs', logsRouter)
app.use('/api/audit', auditRouter)
app.use('/api/routes', auditLogger, apikeysRouter)
app.use('/api/notifications', notificationsRouter)
app.use('/api/system', systemRouter)
app.use('/api/analytics', analyticsRouter)
app.use('/api/backups', auditLogger, backupRouter)
app.use('/api/route-groups', auditLogger, routeGroupsRouter)
app.use('/api/organizations', auditLogger, organizationsRouter)
app.use('/api/routes', auditLogger, transformsRouter)
app.use('/api/routes', auditLogger, targetsRouter)

// ============================================================================
// Proxy Handler — all proxy routes live under /r/ prefix
// ============================================================================

app.use('/r', proxyLimiter, proxyHandler)

// ============================================================================
// Error Handling
// ============================================================================

app.use(notFoundHandler)
app.use(errorHandler)

// ============================================================================
// Server Startup
// ============================================================================

async function start() {
  try {
    // Test database connection
    await prisma.$connect()
    logger.info('Database connected')

    // Start HTTP server
    const server = app.listen(config.PORT, () => {
      logger.info(`ClusterGate backend started`, {
        port: config.PORT,
        env: config.NODE_ENV,
        version: getVersion(),
      })
    })

    // WebSocket upgrade handler
    server.on('upgrade', (req, socket, head) => {
      handleWebSocketUpgrade(req, socket as any, head)
    })

    // Start background jobs
    startCronJobs()

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, starting graceful shutdown...`)

      server.close(async () => {
        logger.info('HTTP server closed')
        stopCronJobs()
        await prisma.$disconnect()
        logger.info('Database disconnected')
        process.exit(0)
      })

      // Force exit after 30 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout')
        process.exit(1)
      }, 30000)
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'))
    process.on('SIGINT', () => shutdown('SIGINT'))

    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled promise rejection', { reason })
    })

    process.on('uncaughtException', (err) => {
      logger.error('Uncaught exception', { error: err.message, stack: err.stack })
      process.exit(1)
    })
  } catch (err) {
    logger.error('Failed to start server', { error: (err as Error).message })
    process.exit(1)
  }
}

start()

export default app
