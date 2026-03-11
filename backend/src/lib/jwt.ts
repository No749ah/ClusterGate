import jwt from 'jsonwebtoken'
import { config } from '../config'
import { Role } from '@prisma/client'

export interface JWTPayload {
  userId: string
  email: string
  role: Role
  iat?: number
  exp?: number
}

export interface ShortLivedPayload {
  userId: string
  purpose: string
  iat?: number
  exp?: number
}

export function signToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, config.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: config.JWT_EXPIRES_IN,
    issuer: 'clustergate',
  } as jwt.SignOptions)
}

export function verifyToken(token: string): JWTPayload {
  return jwt.verify(token, config.JWT_SECRET, {
    algorithms: ['HS256'],
    issuer: 'clustergate',
  }) as JWTPayload
}

/**
 * Sign a short-lived token with a purpose field (e.g., '2fa').
 * Expires in 5 minutes by default.
 */
export function signShortLivedToken(
  payload: Omit<ShortLivedPayload, 'iat' | 'exp'>,
  expiresIn = '5m'
): string {
  return jwt.sign(payload, config.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn,
    issuer: 'clustergate',
  } as jwt.SignOptions)
}

/**
 * Verify a short-lived token and check that its purpose matches.
 */
export function verifyShortLivedToken(token: string, expectedPurpose: string): ShortLivedPayload {
  const payload = jwt.verify(token, config.JWT_SECRET, {
    algorithms: ['HS256'],
    issuer: 'clustergate',
  }) as ShortLivedPayload

  if (payload.purpose !== expectedPurpose) {
    throw new Error('Invalid token purpose')
  }

  return payload
}
