import { Request, Response, NextFunction } from 'express'
import { v4 as uuid } from 'uuid'
import { httpRequestsTotal, httpRequestDuration } from '../lib/metrics'
import { logger } from '../lib/logger'

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const requestId = uuid()
  const start = Date.now()

  req.headers['x-request-id'] = requestId
  res.setHeader('X-Request-ID', requestId)

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000
    const path = req.route?.path || req.path
    const status = String(res.statusCode)

    // Normalize path for metrics (avoid high cardinality)
    const normalizedPath = normalizePath(path)

    httpRequestsTotal.inc({ method: req.method, path: normalizedPath, status })
    httpRequestDuration.observe({ method: req.method, path: normalizedPath, status }, duration)

    logger.info(`${req.method} ${req.path} ${res.statusCode} ${Math.round(duration * 1000)}ms`, {
      requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: Math.round(duration * 1000),
      ip: req.ip,
    })
  })

  next()
}

function normalizePath(path: string): string {
  // Replace IDs with :id to reduce cardinality
  return path
    .replace(/\/[a-z0-9]{20,}\//gi, '/:id/')
    .replace(/\/[a-z0-9]{20,}$/gi, '/:id')
}
