import { PrismaClient, ChangeRequestStatus, OrgRole } from '@prisma/client'

const prisma = new PrismaClient()

export interface CRPolicy {
  required: boolean
  bypassRoles: OrgRole[]
  approverRoles: OrgRole[]
  source: 'none' | 'organization' | 'group'
}

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

  /**
   * Resolve the full CR policy for a route, considering org and group overrides.
   */
  async getPolicy(routeId: string): Promise<CRPolicy> {
    const route = await prisma.route.findUnique({
      where: { id: routeId },
      select: {
        organizationId: true,
        routeGroupId: true,
      },
    })

    if (!route?.organizationId) {
      return { required: false, bypassRoles: [], approverRoles: [], source: 'none' }
    }

    const org = await prisma.organization.findUnique({
      where: { id: route.organizationId },
      select: {
        changeRequestsEnabled: true,
        crBypassRoles: true,
        crApproverRoles: true,
      },
    })

    if (!org) {
      return { required: false, bypassRoles: [], approverRoles: [], source: 'none' }
    }

    // Check group-level override
    if (route.routeGroupId) {
      const group = await prisma.routeGroup.findUnique({
        where: { id: route.routeGroupId },
        select: {
          changeRequestsEnabled: true,
          crBypassRoles: true,
          crApproverRoles: true,
        },
      })

      if (group && group.changeRequestsEnabled !== null) {
        // Group has its own CR policy
        return {
          required: group.changeRequestsEnabled,
          bypassRoles: group.crBypassRoles.length > 0 ? group.crBypassRoles : org.crBypassRoles,
          approverRoles: group.crApproverRoles.length > 0 ? group.crApproverRoles : org.crApproverRoles,
          source: 'group',
        }
      }
    }

    // Inherit from organization
    return {
      required: org.changeRequestsEnabled,
      bypassRoles: org.crBypassRoles,
      approverRoles: org.crApproverRoles,
      source: org.changeRequestsEnabled ? 'organization' : 'none',
    }
  },

  /**
   * Check if a user can bypass CR for a route (edit directly).
   * System ADMINs always bypass.
   */
  async canBypass(routeId: string, userId: string, systemRole: string): Promise<boolean> {
    if (systemRole === 'ADMIN') return true

    const policy = await this.getPolicy(routeId)
    if (!policy.required) return true

    // Get user's org membership role
    const route = await prisma.route.findUnique({
      where: { id: routeId },
      select: { organizationId: true },
    })

    if (!route?.organizationId) return true

    const membership = await prisma.orgMembership.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId: route.organizationId,
        },
      },
      select: { role: true },
    })

    if (!membership) return true // Not an org member, standard auth applies

    return policy.bypassRoles.includes(membership.role)
  },

  /**
   * Check if a user can approve/reject a CR.
   * System ADMINs can always approve.
   */
  async canApprove(crId: string, userId: string, systemRole: string): Promise<boolean> {
    if (systemRole === 'ADMIN') return true

    const cr = await prisma.changeRequest.findUnique({
      where: { id: crId },
      select: { routeId: true },
    })

    if (!cr?.routeId) return systemRole === 'ADMIN'

    const policy = await this.getPolicy(cr.routeId)

    const route = await prisma.route.findUnique({
      where: { id: cr.routeId },
      select: { organizationId: true },
    })

    if (!route?.organizationId) return systemRole === 'ADMIN'

    const membership = await prisma.orgMembership.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId: route.organizationId,
        },
      },
      select: { role: true },
    })

    if (!membership) return false

    return policy.approverRoles.includes(membership.role)
  },

  /** Keep backward compat — simple boolean check */
  async isChangeRequestRequired(routeId: string): Promise<boolean> {
    const policy = await this.getPolicy(routeId)
    return policy.required
  },

  async pendingCount() {
    return prisma.changeRequest.count({ where: { status: 'PENDING' } })
  },
}
