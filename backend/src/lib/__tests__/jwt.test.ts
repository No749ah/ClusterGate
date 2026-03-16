import { describe, it, expect, vi } from 'vitest'
import jwt from 'jsonwebtoken'

// The config module is loaded by jwt.ts on import. The env vars are set in
// the setup file (src/test/setup.ts) before this module is loaded.

// Mock @prisma/client to provide the Role enum without needing a generated client
vi.mock('@prisma/client', () => ({
  Role: {
    ADMIN: 'ADMIN',
    OPERATOR: 'OPERATOR',
    VIEWER: 'VIEWER',
  },
}))

import { signToken, verifyToken, signShortLivedToken, verifyShortLivedToken } from '../jwt'
import type { JWTPayload, ShortLivedPayload } from '../jwt'

const TEST_SECRET = process.env.JWT_SECRET!

describe('JWT utilities', () => {
  describe('signToken', () => {
    it('creates a valid JWT string', () => {
      const token = signToken({
        userId: 'user-123',
        email: 'test@example.com',
        role: 'ADMIN' as any,
      })

      expect(token).toBeDefined()
      expect(typeof token).toBe('string')
      // JWT has 3 dot-separated parts
      expect(token.split('.')).toHaveLength(3)
    })

    it('embeds the correct payload fields', () => {
      const token = signToken({
        userId: 'user-456',
        email: 'alice@example.com',
        role: 'OPERATOR' as any,
        tokenVersion: 3,
      })

      const decoded = jwt.decode(token) as JWTPayload
      expect(decoded.userId).toBe('user-456')
      expect(decoded.email).toBe('alice@example.com')
      expect(decoded.role).toBe('OPERATOR')
      expect(decoded.tokenVersion).toBe(3)
    })

    it('sets the issuer to clustergate', () => {
      const token = signToken({
        userId: 'u1',
        email: 'a@b.com',
        role: 'VIEWER' as any,
      })

      const decoded = jwt.decode(token, { complete: true }) as any
      expect(decoded.payload.iss).toBe('clustergate')
    })

    it('sets an expiration time', () => {
      const token = signToken({
        userId: 'u1',
        email: 'a@b.com',
        role: 'ADMIN' as any,
      })

      const decoded = jwt.decode(token) as JWTPayload
      expect(decoded.exp).toBeDefined()
      expect(decoded.iat).toBeDefined()
      // exp should be in the future
      expect(decoded.exp!).toBeGreaterThan(Math.floor(Date.now() / 1000))
    })
  })

  describe('verifyToken', () => {
    it('returns the payload for a valid token', () => {
      const token = signToken({
        userId: 'user-789',
        email: 'bob@example.com',
        role: 'ADMIN' as any,
        tokenVersion: 1,
      })

      const payload = verifyToken(token)
      expect(payload.userId).toBe('user-789')
      expect(payload.email).toBe('bob@example.com')
      expect(payload.role).toBe('ADMIN')
      expect(payload.tokenVersion).toBe(1)
    })

    it('throws for an invalid token', () => {
      expect(() => verifyToken('invalid.token.here')).toThrow()
    })

    it('throws for a token signed with a different secret', () => {
      const token = jwt.sign(
        { userId: 'u1', email: 'a@b.com', role: 'ADMIN' },
        'different-secret-that-is-32-chars-long!!!',
        { algorithm: 'HS256', issuer: 'clustergate' }
      )

      expect(() => verifyToken(token)).toThrow()
    })

    it('throws for a token with wrong issuer', () => {
      const token = jwt.sign(
        { userId: 'u1', email: 'a@b.com', role: 'ADMIN' },
        TEST_SECRET,
        { algorithm: 'HS256', issuer: 'wrong-issuer' }
      )

      expect(() => verifyToken(token)).toThrow()
    })

    it('throws for an expired token', () => {
      const token = jwt.sign(
        { userId: 'u1', email: 'a@b.com', role: 'ADMIN' },
        TEST_SECRET,
        { algorithm: 'HS256', issuer: 'clustergate', expiresIn: '-1s' }
      )

      expect(() => verifyToken(token)).toThrow()
    })
  })

  describe('signShortLivedToken', () => {
    it('creates a valid token with a purpose field', () => {
      const token = signShortLivedToken({
        userId: 'user-2fa',
        purpose: '2fa',
      })

      expect(token).toBeDefined()
      expect(token.split('.')).toHaveLength(3)

      const decoded = jwt.decode(token) as ShortLivedPayload
      expect(decoded.userId).toBe('user-2fa')
      expect(decoded.purpose).toBe('2fa')
    })

    it('uses a short expiration by default', () => {
      const token = signShortLivedToken({
        userId: 'u1',
        purpose: '2fa',
      })

      const decoded = jwt.decode(token) as ShortLivedPayload & { iat: number; exp: number }
      // 5 minutes = 300 seconds
      const ttl = decoded.exp - decoded.iat
      expect(ttl).toBe(300)
    })

    it('allows custom expiration', () => {
      const token = signShortLivedToken(
        { userId: 'u1', purpose: 'reset' },
        '10m'
      )

      const decoded = jwt.decode(token) as ShortLivedPayload & { iat: number; exp: number }
      const ttl = decoded.exp - decoded.iat
      expect(ttl).toBe(600) // 10 minutes
    })

    it('sets the issuer to clustergate', () => {
      const token = signShortLivedToken({
        userId: 'u1',
        purpose: '2fa',
      })

      const decoded = jwt.decode(token, { complete: true }) as any
      expect(decoded.payload.iss).toBe('clustergate')
    })
  })

  describe('verifyShortLivedToken', () => {
    it('returns the payload when purpose matches', () => {
      const token = signShortLivedToken({
        userId: 'user-2fa',
        purpose: '2fa',
      })

      const payload = verifyShortLivedToken(token, '2fa')
      expect(payload.userId).toBe('user-2fa')
      expect(payload.purpose).toBe('2fa')
    })

    it('throws when purpose does not match', () => {
      const token = signShortLivedToken({
        userId: 'u1',
        purpose: '2fa',
      })

      expect(() => verifyShortLivedToken(token, 'password-reset')).toThrow(
        'Invalid token purpose'
      )
    })

    it('throws for an expired short-lived token', () => {
      const token = jwt.sign(
        { userId: 'u1', purpose: '2fa' },
        TEST_SECRET,
        { algorithm: 'HS256', issuer: 'clustergate', expiresIn: '-1s' }
      )

      expect(() => verifyShortLivedToken(token, '2fa')).toThrow()
    })

    it('throws for an invalid token', () => {
      expect(() => verifyShortLivedToken('garbage', '2fa')).toThrow()
    })

    it('throws for a token signed with wrong secret', () => {
      const token = jwt.sign(
        { userId: 'u1', purpose: '2fa' },
        'another-secret-that-is-32-chars-long!!!!',
        { algorithm: 'HS256', issuer: 'clustergate', expiresIn: '5m' }
      )

      expect(() => verifyShortLivedToken(token, '2fa')).toThrow()
    })
  })
})
