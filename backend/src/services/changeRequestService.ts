import { PrismaClient, ChangeRequestStatus } from '@prisma/client'

const prisma = new PrismaClient()

export const changeRequestService = {
  async list(filters?: { status?: ChangeRequestStatus; routeId?: string; requestedById?: string; page?: number; pageSize?: number }) {
    const { status, routeId, requestedById, page = 1, pageSize = 20 } = filters ?? {}
    const where: any = {}
    if (status) where.status = status
    if (routeId) where.routeId = routeId
    if (requestedById) where.requestedById = requestedById

    const [data, total] = await Promise.all([
      prisma.changeRequest.findMany({
        where,
        include: {
          route: { select: { id: true, name: true, publicPath: true } },
          requestedBy: { select: { id: true, name: true, email: true } },
          reviewedBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.changeRequest.count({ where }),
    ])

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) }
  },

  async getById(id: string) {
    return prisma.changeRequest.findUnique({
      where: { id },
      include: {
        route: { select: { id: true, name: true, publicPath: true, targetUrl: true } },
        requestedBy: { select: { id: true, name: true, email: true } },
        reviewedBy: { select: { id: true, name: true, email: true } },
      },
    })
  },

  async create(data: {
    routeId?: string
    type: string
    title: string
    description?: string
    payload: any
    diff?: any
    requestedById: string
  }) {
    return prisma.changeRequest.create({
      data: {
        routeId: data.routeId,
        type: data.type,
        title: data.title,
        description: data.description,
        payload: data.payload,
        diff: data.diff,
        requestedById: data.requestedById,
      },
      include: {
        requestedBy: { select: { id: true, name: true, email: true } },
      },
    })
  },

  async approve(id: string, reviewerId: string, comment?: string) {
    const cr = await prisma.changeRequest.update({
      where: { id },
      data: {
        status: 'APPROVED',
        reviewedById: reviewerId,
        reviewComment: comment,
        reviewedAt: new Date(),
      },
    })

    // Auto-apply the change
    await this.applyChange(cr)

    return prisma.changeRequest.update({
      where: { id },
      data: { status: 'APPLIED' },
      include: {
        route: { select: { id: true, name: true } },
        requestedBy: { select: { id: true, name: true, email: true } },
        reviewedBy: { select: { id: true, name: true, email: true } },
      },
    })
  },

  async reject(id: string, reviewerId: string, comment?: string) {
    return prisma.changeRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        reviewedById: reviewerId,
        reviewComment: comment,
        reviewedAt: new Date(),
      },
      include: {
        requestedBy: { select: { id: true, name: true, email: true } },
        reviewedBy: { select: { id: true, name: true, email: true } },
      },
    })
  },

  async applyChange(cr: { id: string; type: string; routeId: string | null; payload: any }) {
    const payload = cr.payload as any

    if (cr.type === 'update' && cr.routeId) {
      // Extract only allowed fields from payload
      const { name, description, targetUrl, methods, publicPath, timeout, retryCount, retryDelay,
              rateLimitEnabled, rateLimitMax, rateLimitWindow, stripPrefix, sslVerify,
              corsEnabled, corsOrigins, requireAuth, authType, authValue, tags,
              wsEnabled, circuitBreakerEnabled, cbFailureThreshold, cbRecoveryTimeout,
              lbStrategy, maintenanceMode, maintenanceMessage } = payload

      await prisma.route.update({
        where: { id: cr.routeId },
        data: {
          name, description, targetUrl, methods, publicPath, timeout, retryCount, retryDelay,
          rateLimitEnabled, rateLimitMax, rateLimitWindow, stripPrefix, sslVerify,
          corsEnabled, corsOrigins, requireAuth, authType, authValue, tags,
          wsEnabled, circuitBreakerEnabled, cbFailureThreshold, cbRecoveryTimeout,
          lbStrategy, maintenanceMode, maintenanceMessage,
        },
      })
    }
  },

  async isChangeRequestRequired(routeId: string): Promise<boolean> {
    const route = await prisma.route.findUnique({
      where: { id: routeId },
      select: { organizationId: true },
    })

    if (!route?.organizationId) return false

    const org = await prisma.organization.findUnique({
      where: { id: route.organizationId },
      select: { changeRequestsEnabled: true },
    })

    return org?.changeRequestsEnabled ?? false
  },

  async pendingCount() {
    return prisma.changeRequest.count({ where: { status: 'PENDING' } })
  },
}
