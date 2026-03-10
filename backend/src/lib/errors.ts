export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message)
    this.name = 'AppError'
    Error.captureStackTrace(this, this.constructor)
  }

  static badRequest(message: string, details?: unknown) {
    return new AppError(400, 'BAD_REQUEST', message, details)
  }

  static unauthorized(message = 'Authentication required') {
    return new AppError(401, 'UNAUTHORIZED', message)
  }

  static forbidden(message = 'Insufficient permissions') {
    return new AppError(403, 'FORBIDDEN', message)
  }

  static notFound(resource = 'Resource') {
    return new AppError(404, 'NOT_FOUND', `${resource} not found`)
  }

  static conflict(message: string) {
    return new AppError(409, 'CONFLICT', message)
  }

  static tooManyRequests(message = 'Too many requests') {
    return new AppError(429, 'TOO_MANY_REQUESTS', message)
  }

  static internal(message = 'Internal server error') {
    return new AppError(500, 'INTERNAL_ERROR', message)
  }

  static serviceUnavailable(message: string) {
    return new AppError(503, 'SERVICE_UNAVAILABLE', message)
  }
}
