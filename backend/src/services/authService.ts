import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma'
import { signToken } from '../lib/jwt'
import { AppError } from '../lib/errors'
import { User } from '@prisma/client'

const BCRYPT_ROUNDS = 12

export interface LoginResult {
  user: Omit<User, 'passwordHash'>
  token: string
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
  })

  if (!user || !user.isActive) {
    // Constant-time comparison to prevent timing attacks
    await bcrypt.compare(password, '$2a$12$invalidhashfortimingatttack')
    throw AppError.unauthorized('Invalid email or password')
  }

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) {
    throw AppError.unauthorized('Invalid email or password')
  }

  // Update last login
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  })

  const token = signToken({ userId: user.id, email: user.email, role: user.role })

  const { passwordHash: _, ...safeUser } = user

  return { user: { ...safeUser, lastLoginAt: new Date() }, token }
}

export async function getCurrentUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      twoFactorEnabled: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  if (!user || !user.isActive) {
    throw AppError.notFound('User')
  }

  return user
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw AppError.notFound('User')

  const valid = await bcrypt.compare(currentPassword, user.passwordHash)
  if (!valid) {
    throw AppError.badRequest('Current password is incorrect')
  }

  const validation = validatePassword(newPassword)
  if (!validation.valid) {
    throw AppError.badRequest('Password does not meet requirements', validation.errors)
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } })
}

export function validatePassword(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (password.length < 8) errors.push('Must be at least 8 characters')
  if (!/[A-Z]/.test(password)) errors.push('Must contain at least one uppercase letter')
  if (!/[a-z]/.test(password)) errors.push('Must contain at least one lowercase letter')
  if (!/[0-9]/.test(password)) errors.push('Must contain at least one number')
  if (!/[^A-Za-z0-9]/.test(password)) errors.push('Must contain at least one special character')

  return { valid: errors.length === 0, errors }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS)
}
