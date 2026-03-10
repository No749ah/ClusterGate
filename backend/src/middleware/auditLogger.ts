import { Request, Response, NextFunction } from 'express'
import { prisma } from '../lib/prisma'
import { logger } from '../lib/logger'

function deriveAction(method: string, path: string): string {
  const parts = path.replace(/^\/api\//, '').split('/')
  const resource = parts[0] || 'unknown'
  const subAction = parts[2] // e.g. "publish", "duplicate"

  const methodMap: Record<string, string> = {
    POST: subAction || 'create',
    PUT: 'update',
    PATCH: 'update',
    DELETE: 'delete',
  }

  const action = methodMap[method] || method.toLowerCase()
  return `${resource}.${action}`
}

function extractResourceId(path: string): string | undefined {
  const parts = path.replace(/^\/api\/[^/]+\//, '').split('/')
  const id = parts[0]
  // Basic cuid/uuid check
  if (id && id.length > 10 && !id.includes('.')) {
    return id
  }
  return undefined
}

export function auditLogger(req: Request, res: Response, next: NextFunction) {
  const mutateMethods = ['POST', 'PUT', 'PATCH', 'DELETE']

  if (!mutateMethods.includes(req.method) || !req.user) {
    return next()
  }

  const originalJson = res.json.bind(res)

  res.json = function (body: unknown) {
    // Log after response
    setImmediate(async () => {
      if (res.statusCode < 400) {
        try {
          await prisma.auditLog.create({
            data: {
              userId: req.user!.userId,
              action: deriveAction(req.method, req.path),
              resource: req.path.replace(/^\/api\//, '').split('/')[0] || 'unknown',
              resourceId: extractResourceId(req.path),
              details: JSON.parse(JSON.stringify({
                method: req.method,
                path: req.path,
                body: sanitizeBody(req.body),
                statusCode: res.statusCode,
              })),
              ip: req.ip || req.socket.remoteAddress,
              userAgent: req.get('user-agent'),
            },
          })
        } catch (err) {
          logger.warn('Failed to write audit log', { error: (err as Error).message })
        }
      }
    })

    return originalJson(body)
  }

  next()
}

function sanitizeBody(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body
  const sanitized = { ...(body as Record<string, unknown>) }
  const sensitiveFields = ['password', 'passwordHash', 'authValue', 'webhookSecret', 'apiKey', 'token']
  for (const field of sensitiveFields) {
    if (field in sanitized) {
      sanitized[field] = '[REDACTED]'
    }
  }
  return sanitized
}
