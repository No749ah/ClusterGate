import { randomBytes, createHash } from 'crypto'
import { prisma } from '../lib/prisma'
import { AppError } from '../lib/errors'

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

export async function getApiKeys(routeId: string) {
  const route = await prisma.route.findUnique({ where: { id: routeId, deletedAt: null } })
  if (!route) throw AppError.notFound('Route')

  return prisma.apiKey.findMany({
    where: { routeId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      isActive: true,
      lastUsedAt: true,
      expiresAt: true,
      createdAt: true,
    },
  })
}

export async function createApiKey(routeId: string, name: string, expiresAt?: Date) {
  const route = await prisma.route.findUnique({ where: { id: routeId, deletedAt: null } })
  if (!route) throw AppError.notFound('Route')

  // Generate a random API key
  const rawKey = `cgk_${randomBytes(32).toString('hex')}`
  const keyHash = hashKey(rawKey)

  const apiKey = await prisma.apiKey.create({
    data: {
      routeId,
      name,
      keyHash,
      expiresAt,
    },
    select: {
      id: true,
      name: true,
      isActive: true,
      expiresAt: true,
      createdAt: true,
    },
  })

  // Return the raw key only on creation (never stored in plaintext)
  return { ...apiKey, key: rawKey }
}

export async function revokeApiKey(keyId: string, routeId: string) {
  const apiKey = await prisma.apiKey.findUnique({ where: { id: keyId } })
  if (!apiKey || apiKey.routeId !== routeId) throw AppError.notFound('API Key')

  return prisma.apiKey.update({
    where: { id: keyId },
    data: { isActive: false },
  })
}

export async function deleteApiKey(keyId: string, routeId: string) {
  const apiKey = await prisma.apiKey.findUnique({ where: { id: keyId } })
  if (!apiKey || apiKey.routeId !== routeId) throw AppError.notFound('API Key')

  return prisma.apiKey.delete({ where: { id: keyId } })
}

export async function validateApiKey(key: string, routeId: string): Promise<boolean> {
  const keyHash = hashKey(key)
  const apiKey = await prisma.apiKey.findFirst({
    where: {
      keyHash,
      routeId,
      isActive: true,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
  })

  if (!apiKey) return false

  // Update last used
  await prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() },
  })

  return true
}
