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

export function signToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRES_IN,
    issuer: 'clustergate',
  } as jwt.SignOptions)
}

export function verifyToken(token: string): JWTPayload {
  return jwt.verify(token, config.JWT_SECRET, {
    issuer: 'clustergate',
  }) as JWTPayload
}
