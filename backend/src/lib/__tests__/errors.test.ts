import { describe, it, expect } from 'vitest'
import { AppError } from '../errors'

describe('AppError', () => {
  describe('constructor', () => {
    it('creates an error with all properties', () => {
      const err = new AppError(418, 'TEAPOT', 'I am a teapot', { extra: true })

      expect(err).toBeInstanceOf(Error)
      expect(err).toBeInstanceOf(AppError)
      expect(err.statusCode).toBe(418)
      expect(err.code).toBe('TEAPOT')
      expect(err.message).toBe('I am a teapot')
      expect(err.details).toEqual({ extra: true })
      expect(err.name).toBe('AppError')
    })

    it('creates an error without details', () => {
      const err = new AppError(500, 'ERR', 'Something broke')

      expect(err.details).toBeUndefined()
    })

    it('has a proper stack trace', () => {
      const err = new AppError(500, 'ERR', 'fail')

      expect(err.stack).toBeDefined()
      expect(err.stack).not.toContain('new AppError')
    })
  })

  describe('static badRequest', () => {
    it('creates a 400 error', () => {
      const err = AppError.badRequest('Invalid input')

      expect(err.statusCode).toBe(400)
      expect(err.code).toBe('BAD_REQUEST')
      expect(err.message).toBe('Invalid input')
      expect(err.details).toBeUndefined()
    })

    it('creates a 400 error with details', () => {
      const details = { field: 'email', reason: 'invalid format' }
      const err = AppError.badRequest('Validation failed', details)

      expect(err.statusCode).toBe(400)
      expect(err.code).toBe('BAD_REQUEST')
      expect(err.message).toBe('Validation failed')
      expect(err.details).toEqual(details)
    })
  })

  describe('static unauthorized', () => {
    it('creates a 401 error with default message', () => {
      const err = AppError.unauthorized()

      expect(err.statusCode).toBe(401)
      expect(err.code).toBe('UNAUTHORIZED')
      expect(err.message).toBe('Authentication required')
    })

    it('creates a 401 error with custom message', () => {
      const err = AppError.unauthorized('Token expired')

      expect(err.statusCode).toBe(401)
      expect(err.code).toBe('UNAUTHORIZED')
      expect(err.message).toBe('Token expired')
    })
  })

  describe('static forbidden', () => {
    it('creates a 403 error with default message', () => {
      const err = AppError.forbidden()

      expect(err.statusCode).toBe(403)
      expect(err.code).toBe('FORBIDDEN')
      expect(err.message).toBe('Insufficient permissions')
    })

    it('creates a 403 error with custom message', () => {
      const err = AppError.forbidden('Admin only')

      expect(err.statusCode).toBe(403)
      expect(err.code).toBe('FORBIDDEN')
      expect(err.message).toBe('Admin only')
    })
  })

  describe('static notFound', () => {
    it('creates a 404 error with default resource', () => {
      const err = AppError.notFound()

      expect(err.statusCode).toBe(404)
      expect(err.code).toBe('NOT_FOUND')
      expect(err.message).toBe('Resource not found')
    })

    it('creates a 404 error with specific resource', () => {
      const err = AppError.notFound('User')

      expect(err.statusCode).toBe(404)
      expect(err.code).toBe('NOT_FOUND')
      expect(err.message).toBe('User not found')
    })
  })

  describe('static conflict', () => {
    it('creates a 409 error', () => {
      const err = AppError.conflict('Email already exists')

      expect(err.statusCode).toBe(409)
      expect(err.code).toBe('CONFLICT')
      expect(err.message).toBe('Email already exists')
    })
  })

  describe('static tooManyRequests', () => {
    it('creates a 429 error with default message', () => {
      const err = AppError.tooManyRequests()

      expect(err.statusCode).toBe(429)
      expect(err.code).toBe('TOO_MANY_REQUESTS')
      expect(err.message).toBe('Too many requests')
    })

    it('creates a 429 error with custom message', () => {
      const err = AppError.tooManyRequests('Rate limit exceeded')

      expect(err.statusCode).toBe(429)
      expect(err.code).toBe('TOO_MANY_REQUESTS')
      expect(err.message).toBe('Rate limit exceeded')
    })
  })

  describe('static internal', () => {
    it('creates a 500 error with default message', () => {
      const err = AppError.internal()

      expect(err.statusCode).toBe(500)
      expect(err.code).toBe('INTERNAL_ERROR')
      expect(err.message).toBe('Internal server error')
    })

    it('creates a 500 error with custom message', () => {
      const err = AppError.internal('Database connection failed')

      expect(err.statusCode).toBe(500)
      expect(err.code).toBe('INTERNAL_ERROR')
      expect(err.message).toBe('Database connection failed')
    })
  })

  describe('static serviceUnavailable', () => {
    it('creates a 503 error', () => {
      const err = AppError.serviceUnavailable('Upstream server down')

      expect(err.statusCode).toBe(503)
      expect(err.code).toBe('SERVICE_UNAVAILABLE')
      expect(err.message).toBe('Upstream server down')
    })
  })

  describe('error inheritance', () => {
    it('can be caught as a generic Error', () => {
      const err = AppError.badRequest('test')

      expect(() => {
        throw err
      }).toThrow(Error)
    })

    it('can be caught as an AppError', () => {
      const err = AppError.notFound('Route')

      expect(() => {
        throw err
      }).toThrow(AppError)
    })

    it('can be type-checked with instanceof', () => {
      try {
        throw AppError.unauthorized()
      } catch (e) {
        expect(e instanceof AppError).toBe(true)
        expect(e instanceof Error).toBe(true)
        if (e instanceof AppError) {
          expect(e.statusCode).toBe(401)
        }
      }
    })
  })
})
