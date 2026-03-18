import { Role } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { AppError } from '../lib/errors'
import { hashPassword, validatePassword } from './authService'

export interface CreateUserData {
  email: string
  password: string
  name: string
  role?: Role
}

export async function getUsers(pagination = { page: 1, pageSize: 20 }) {
  const { page, pageSize } = pagination
  const skip = (page - 1) * pageSize

  const [data, total] = await prisma.$transaction([
    prisma.user.findMany({
      skip,
      take: pageSize,
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
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
    }),
    prisma.user.count(),
  ])

  return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) }
}

export async function getUserById(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
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
  if (!user) throw AppError.notFound('User')
  return user
}

export async function createUser(data: CreateUserData) {
  // Check email uniqueness
  const exists = await prisma.user.findUnique({
    where: { email: data.email.toLowerCase().trim() },
  })
  if (exists) throw AppError.conflict('A user with this email already exists')

  const validation = validatePassword(data.password)
  if (!validation.valid) {
    throw AppError.badRequest('Password does not meet requirements', validation.errors)
  }

  const passwordHash = await hashPassword(data.password)

  return prisma.user.create({
    data: {
      email: data.email.toLowerCase().trim(),
      passwordHash,
      name: data.name,
      role: data.role ?? Role.VIEWER,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  })
}

export async function updateUser(
  id: string,
  data: { name?: string; role?: Role; isActive?: boolean }
) {
  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) throw AppError.notFound('User')

  // Prevent demoting or deactivating the last active admin
  if (user.role === Role.ADMIN && (data.role !== undefined && data.role !== Role.ADMIN || data.isActive === false)) {
    const adminCount = await prisma.user.count({ where: { role: Role.ADMIN, isActive: true } })
    if (adminCount <= 1) {
      throw AppError.badRequest('Cannot demote or deactivate the last admin. Promote another user first.')
    }
  }

  return prisma.user.update({
    where: { id },
    data,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      updatedAt: true,
    },
  })
}

export async function deleteUser(id: string, requestingUserId: string) {
  if (id === requestingUserId) {
    throw AppError.badRequest('You cannot delete your own account')
  }

  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) throw AppError.notFound('User')

  // Prevent deleting the last active admin
  if (user.role === Role.ADMIN && user.isActive) {
    const adminCount = await prisma.user.count({ where: { role: Role.ADMIN, isActive: true } })
    if (adminCount <= 1) {
      throw AppError.badRequest('Cannot delete the last admin. Promote another user first.')
    }
  }

  // Soft delete + revoke all sessions
  await prisma.user.update({
    where: { id },
    data: { isActive: false, tokenVersion: { increment: 1 } },
  })
}

export async function restoreUser(id: string) {
  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) throw AppError.notFound('User')
  if (user.isActive) throw AppError.badRequest('User is already active')

  return prisma.user.update({
    where: { id },
    data: { isActive: true },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      updatedAt: true,
    },
  })
}

export async function adminDisable2FA(id: string) {
  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) throw AppError.notFound('User')
  if (!user.twoFactorEnabled) throw AppError.badRequest('Two-factor authentication is not enabled')

  return prisma.user.update({
    where: { id },
    data: {
      twoFactorSecret: null,
      twoFactorEnabled: false,
      recoveryCodes: [],
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      twoFactorEnabled: true,
      updatedAt: true,
    },
  })
}

export async function adminResetPassword(id: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) throw AppError.notFound('User')

  const validation = validatePassword(newPassword)
  if (!validation.valid) {
    throw AppError.badRequest('Password does not meet requirements', validation.errors)
  }

  const passwordHash = await hashPassword(newPassword)
  await prisma.user.update({ where: { id }, data: { passwordHash, tokenVersion: { increment: 1 } } })
}
