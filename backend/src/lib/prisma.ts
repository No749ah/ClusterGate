import { PrismaClient } from '@prisma/client'
import { config } from '../config'
import { logger } from './logger'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: config.isDev
      ? [
          { emit: 'event', level: 'query' },
          { emit: 'event', level: 'error' },
          { emit: 'event', level: 'warn' },
        ]
      : [{ emit: 'event', level: 'error' }],
  })

if (config.isDev) {
  ;(prisma as any).$on('query', (e: any) => {
    logger.debug(`Query: ${e.query}`, { duration: e.duration })
  })
}

;(prisma as any).$on('error', (e: any) => {
  logger.error('Prisma error', { message: e.message })
})

if (config.isDev) {
  globalForPrisma.prisma = prisma
}
