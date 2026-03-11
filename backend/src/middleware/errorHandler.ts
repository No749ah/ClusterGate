import { Request, Response, NextFunction } from 'express'
import { ZodError } from 'zod'
import { Prisma } from '@prisma/client'
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken'
import { AppError } from '../lib/errors'
import { logger } from '../lib/logger'

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  // AppError — known application errors
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error('Application error', {
        code: err.code,
        message: err.message,
        path: req.path,
        method: req.method,
        stack: err.stack,
      })
    }
    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    })
  }

  // Zod validation errors
  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input data',
        details: err.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      },
    })
  }

  // JWT errors
  if (err instanceof TokenExpiredError) {
    return res.status(401).json({
      success: false,
      error: { code: 'TOKEN_EXPIRED', message: 'Token has expired' },
    })
  }
  if (err instanceof JsonWebTokenError) {
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Invalid token' },
    })
  }

  // Prisma errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002': {
        const fields = (err.meta?.target as string[])?.join(', ') || 'unknown'
        return res.status(409).json({
          success: false,
          error: {
            code: 'CONFLICT',
            message: `A record with this ${fields} already exists`,
            details: { fields: err.meta?.target },
          },
        })
      }
      case 'P2025':
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Record not found' },
        })
      case 'P2003':
        return res.status(400).json({
          success: false,
          error: { code: 'FOREIGN_KEY_ERROR', message: 'Related record not found' },
        })
      default:
        logger.error('Prisma error', { code: err.code, message: err.message })
    }
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    logger.error('Prisma validation error', { message: err.message })
    return res.status(400).json({
      success: false,
      error: { code: 'DATABASE_VALIDATION_ERROR', message: 'Invalid database query' },
    })
  }

  // Unknown errors
  const error = err as Error
  logger.error('Unhandled error', {
    message: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
  })

  return res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  })
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'The requested endpoint was not found',
    },
  })
}
