import { PrismaClient, IncidentStatus, IncidentSeverity } from '@prisma/client'

const prisma = new PrismaClient()

export const incidentService = {
  async list(filters?: { status?: IncidentStatus; routeId?: string; page?: number; pageSize?: number }) {
    const { status, routeId, page = 1, pageSize = 20 } = filters ?? {}
    const where: any = {}
    if (status) where.status = status
    if (routeId) where.routeId = routeId

    const [data, total] = await Promise.all([
      prisma.incident.findMany({
        where,
        include: {
          route: { select: { id: true, name: true, publicPath: true } },
          events: { orderBy: { createdAt: 'desc' }, take: 5 },
          _count: { select: { events: true } },
        },
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.incident.count({ where }),
    ])

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) }
  },

  async getById(id: string) {
    return prisma.incident.findUnique({
      where: { id },
      include: {
        route: { select: { id: true, name: true, publicPath: true } },
        events: { orderBy: { createdAt: 'asc' } },
      },
    })
  },

  async create(data: {
    title: string
    description?: string
    severity?: IncidentSeverity
    routeId?: string
  }) {
    const incident = await prisma.incident.create({
      data: {
        title: data.title,
        description: data.description,
        severity: data.severity ?? 'MEDIUM',
        routeId: data.routeId,
      },
    })

    // Add initial event
    await prisma.incidentEvent.create({
      data: {
        incidentId: incident.id,
        type: 'status_change',
        title: 'Incident created',
        description: data.description,
      },
    })

    return incident
  },

  async updateStatus(id: string, status: IncidentStatus, userId?: string) {
    const incident = await prisma.incident.update({
      where: { id },
      data: {
        status,
        resolvedAt: status === 'RESOLVED' ? new Date() : undefined,
      },
    })

    await prisma.incidentEvent.create({
      data: {
        incidentId: id,
        type: 'status_change',
        title: `Status changed to ${status}`,
        createdById: userId,
      },
    })

    return incident
  },

  async addEvent(incidentId: string, event: {
    type: string
    title: string
    description?: string
    metadata?: any
    createdById?: string
  }) {
    return prisma.incidentEvent.create({
      data: {
        incidentId,
        type: event.type,
        title: event.title,
        description: event.description,
        metadata: event.metadata ?? {},
        createdById: event.createdById,
      },
    })
  },

  // Auto-detect incidents from health check failures
  async checkAndCreateFromHealthFailure(routeId: string, routeName: string, error: string) {
    // Check if there's already an active incident for this route
    const existing = await prisma.incident.findFirst({
      where: { routeId, status: { in: ['ACTIVE', 'INVESTIGATING'] } },
    })

    if (existing) {
      // Add event to existing incident
      await this.addEvent(existing.id, {
        type: 'health_check_failed',
        title: `Health check failed`,
        description: error,
        metadata: { routeId, routeName },
      })
      return existing
    }

    // Create new incident
    return this.create({
      title: `Route "${routeName}" health check failing`,
      description: `Health check returned: ${error}`,
      severity: 'HIGH',
      routeId,
    })
  },

  // Auto-detect from circuit breaker state change
  async checkAndCreateFromCBOpen(routeId: string, routeName: string) {
    const existing = await prisma.incident.findFirst({
      where: { routeId, status: { in: ['ACTIVE', 'INVESTIGATING'] } },
    })

    if (existing) {
      await this.addEvent(existing.id, {
        type: 'cb_opened',
        title: 'Circuit breaker opened',
        metadata: { routeId },
      })
      return existing
    }

    return this.create({
      title: `Circuit breaker opened for "${routeName}"`,
      description: 'Failure threshold exceeded, traffic is being blocked.',
      severity: 'CRITICAL',
      routeId,
    })
  },

  async deleteIncident(id: string) {
    // Delete events first (child records)
    await prisma.incidentEvent.deleteMany({ where: { incidentId: id } })
    return prisma.incident.delete({ where: { id } })
  },

  // Auto-resolve when route becomes healthy
  async autoResolveIfHealthy(routeId: string) {
    const active = await prisma.incident.findMany({
      where: { routeId, status: { in: ['ACTIVE', 'INVESTIGATING'] } },
    })

    for (const incident of active) {
      await this.updateStatus(incident.id, 'RESOLVED')
      await this.addEvent(incident.id, {
        type: 'status_change',
        title: 'Auto-resolved: route is healthy again',
      })
    }
  },
}
