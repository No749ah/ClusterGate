import { prisma } from '../lib/prisma'
import { logger } from '../lib/logger'

export async function getNotifications(userId: string, unreadOnly = false) {
  return prisma.notification.findMany({
    where: {
      userId,
      ...(unreadOnly && { isRead: false }),
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      route: { select: { id: true, name: true } },
    },
  })
}

export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({
    where: { userId, isRead: false },
  })
}

export async function markAsRead(notificationId: string, userId: string) {
  return prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: { isRead: true },
  })
}

export async function markAllAsRead(userId: string) {
  return prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  })
}

export async function createNotification(data: {
  userId?: string
  type: string
  title: string
  message: string
  routeId?: string
}) {
  try {
    // If no userId specified, notify all admins
    if (!data.userId) {
      const admins = await prisma.user.findMany({
        where: { role: 'ADMIN', isActive: true },
        select: { id: true },
      })

      await prisma.notification.createMany({
        data: admins.map((admin) => ({
          userId: admin.id,
          type: data.type,
          title: data.title,
          message: data.message,
          routeId: data.routeId,
        })),
      })
      return
    }

    await prisma.notification.create({ data })
  } catch (err) {
    logger.warn('Failed to create notification', { error: (err as Error).message })
  }
}

export async function notifyRouteError(routeId: string, routeName: string, error: string) {
  // Throttle: only create if no recent unread error notification for this route
  try {
    const existing = await prisma.notification.findFirst({
      where: {
        type: 'route.error',
        routeId,
        isRead: false,
        createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) }, // within last 5 min
      },
    })
    if (existing) return
  } catch {
    // ignore check errors
  }

  await createNotification({
    type: 'route.error',
    title: `Route Error: ${routeName}`,
    message: `Proxy error on route "${routeName}": ${error.slice(0, 200)}`,
    routeId,
  })
}

export async function notifyHealthDown(routeId: string, routeName: string, error?: string) {
  // Throttle: only create notification if no unread health.down notification exists for this route
  try {
    const existing = await prisma.notification.findFirst({
      where: {
        type: 'health.down',
        routeId,
        isRead: false,
        createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) }, // within last 30 min
      },
    })
    if (existing) return // already notified recently
  } catch {
    // ignore check errors
  }

  await createNotification({
    type: 'health.down',
    title: `Health Check Failed: ${routeName}`,
    message: `Target for route "${routeName}" is unreachable${error ? `: ${error.slice(0, 200)}` : ''}`,
    routeId,
  })
}
