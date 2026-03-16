/**
 * Vitest global setup — runs before every test file.
 *
 * Sets the environment variables that the config module validates on import,
 * so that importing any module that transitively pulls in `../config` will
 * not call process.exit(1).
 */

process.env.JWT_SECRET = 'test-jwt-secret-that-is-at-least-32-chars-long!!'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'
process.env.NODE_ENV = 'test'
