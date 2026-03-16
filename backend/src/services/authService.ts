import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma'
import { signToken } from '../lib/jwt'
import { AppError } from '../lib/errors'
import { User } from '@prisma/client'

const BCRYPT_ROUNDS = 12

export interface LoginResult {
  user: Omit<User, 'passwordHash' | 'twoFactorSecret' | 'recoveryCodes'>
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

  // If 2FA is enabled, don't update lastLoginAt or issue a real token yet
  // The auth router will handle the 2FA flow
  if (user.twoFactorEnabled) {
    const { passwordHash: _, twoFactorSecret: _s, recoveryCodes: _r, ...safeUser } = user
    return { user: safeUser, token: '' }
  }

  // Update last login
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  })

  const token = signToken({ userId: user.id, email: user.email, role: user.role, tokenVersion: user.tokenVersion })

  const { passwordHash: _, twoFactorSecret: _s, recoveryCodes: _r, ...safeUser } = user

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
  await prisma.user.update({ where: { id: userId }, data: { passwordHash, tokenVersion: { increment: 1 } } })
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

export async function isSetupComplete(): Promise<boolean> {
  const count = await prisma.user.count()
  return count > 0
}

export async function setupInitialAdmin(data: {
  email: string
  password: string
  name: string
}): Promise<LoginResult> {
  const validation = validatePassword(data.password)
  if (!validation.valid) {
    throw AppError.badRequest('Password does not meet requirements', validation.errors)
  }

  const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS)

  // Atomic check-and-create inside a serializable transaction to prevent race conditions
  const user = await prisma.$transaction(async (tx) => {
    const existing = await tx.user.count()
    if (existing > 0) {
      throw AppError.forbidden('Setup has already been completed')
    }

    return tx.user.create({
      data: {
        email: data.email.toLowerCase().trim(),
        passwordHash,
        name: data.name,
        role: 'ADMIN',
        isActive: true,
      },
    })
  }, { isolationLevel: 'Serializable' })

  const token = signToken({ userId: user.id, email: user.email, role: user.role, tokenVersion: user.tokenVersion })
  const { passwordHash: _, twoFactorSecret: _s, recoveryCodes: _r, ...safeUser } = user

  return { user: safeUser, token }
}
