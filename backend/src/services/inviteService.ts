import crypto from 'crypto'
import { Role } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { AppError } from '../lib/errors'
import { hashPassword, validatePassword } from './authService'
import { signToken } from '../lib/jwt'

const INVITE_EXPIRY_HOURS = 72

export async function createInvite(email: string, role: Role, createdById: string) {
  const normalizedEmail = email.toLowerCase().trim()

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } })
  if (existingUser) {
    throw AppError.conflict('A user with this email already exists')
  }

  // Invalidate any existing pending invites for this email
  await prisma.inviteToken.updateMany({
    where: { email: normalizedEmail, usedAt: null },
    data: { usedAt: new Date() },
  })

  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000)

  const invite = await prisma.inviteToken.create({
    data: {
      email: normalizedEmail,
      role,
      token,
      expiresAt,
      createdById,
    },
    include: {
      createdBy: { select: { name: true } },
    },
  })

  return {
    id: invite.id,
    email: invite.email,
    role: invite.role,
    token: invite.token,
    expiresAt: invite.expiresAt,
    createdBy: invite.createdBy,
  }
}

export async function validateInvite(token: string) {
  const invite = await prisma.inviteToken.findUnique({
    where: { token },
  })

  if (!invite) {
    throw AppError.notFound('Invite')
  }

  if (invite.usedAt) {
    throw AppError.badRequest('This invite has already been used')
  }

  if (invite.expiresAt < new Date()) {
    throw AppError.badRequest('This invite has expired')
  }

  return {
    email: invite.email,
    role: invite.role,
  }
}

export async function acceptInvite(token: string, data: { name: string; password: string }) {
  const validation = validatePassword(data.password)
  if (!validation.valid) {
    throw AppError.badRequest('Password does not meet requirements', validation.errors)
  }

  const passwordHash = await hashPassword(data.password)

  // Atomic check-and-create inside a serializable transaction to prevent race conditions
  const user = await prisma.$transaction(async (tx) => {
    const invite = await tx.inviteToken.findUnique({ where: { token } })

    if (!invite) throw AppError.notFound('Invite')
    if (invite.usedAt) throw AppError.badRequest('This invite has already been used')
    if (invite.expiresAt < new Date()) throw AppError.badRequest('This invite has expired')

    // Check if user with this email was created in the meantime
    const existingUser = await tx.user.findUnique({ where: { email: invite.email } })
    if (existingUser) {
      throw AppError.conflict('An account with this email already exists')
    }

    // Mark invite as used first (prevents concurrent accepts)
    await tx.inviteToken.update({
      where: { id: invite.id },
      data: { usedAt: new Date() },
    })

    return tx.user.create({
      data: {
        email: invite.email,
        passwordHash,
        name: data.name,
        role: invite.role,
        isActive: true,
      },
    })
  }, { isolationLevel: 'Serializable' })

  const jwtToken = signToken({ userId: user.id, email: user.email, role: user.role, tokenVersion: user.tokenVersion })
  const { passwordHash: _, ...safeUser } = user

  return { user: safeUser, token: jwtToken }
}

export async function getPendingInvites() {
  const invites = await prisma.inviteToken.findMany({
    where: { usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      createdAt: true,
      createdBy: { select: { id: true, name: true } },
    },
  })
  return invites
}

export async function revokeInvite(id: string) {
  const invite = await prisma.inviteToken.findUnique({ where: { id } })
  if (!invite) throw AppError.notFound('Invite')
  if (invite.usedAt) throw AppError.badRequest('Invite already used')

  await prisma.inviteToken.update({
    where: { id },
    data: { usedAt: new Date() },
  })
}
