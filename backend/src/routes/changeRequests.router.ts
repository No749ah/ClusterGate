import { Router } from 'express'
import { z } from 'zod'
import { Role } from '@prisma/client'
import { authenticate, authorize } from '../middleware/authenticate'
import { attachRouteParamResolver } from '../middleware/resolveRouteParam'
import { changeRequestService } from '../services/changeRequestService'
import { achievementService } from '../services/achievementService'
import { prisma } from '../lib/prisma'
import { requireRouteView } from '../middleware/routeAccess'
import { getUserOrgIds, canViewRouteById, isOrgMember } from '../services/orgAccessService'
import { AppError } from '../lib/errors'
import type { Request } from 'express'

const router = Router()
attachRouteParamResolver(router, 'routeId')

// Change requests carry full route configs and diffs, so non-admins only see
// the ones on routes of their organizations (plus their own submissions).
async function scopeFor(req: Request) {
  if (req.user!.role === 'ADMIN') return undefined
  return { organizationIds: await getUserOrgIds(req.user!.userId), userId: req.user!.userId }
}

/**
 * @openapi
 * /api/change-requests:
 *   get:
 *     tags: [Change Requests]
 *     summary: List change requests (filter by status/route/requester)
 *     responses: { 200: { description: Paginated change requests } }
 *   post:
 *     tags: [Change Requests]
 *     summary: Create a change request (admin/operator)
 *     responses: { 201: { description: Created } }
 * /api/change-requests/pending-count:
 *   get:
 *     tags: [Change Requests]
 *     summary: Number of pending change requests
 *     responses: { 200: { description: Count } }
 * /api/change-requests/check/{routeId}:
 *   get:
 *     tags: [Change Requests]
 *     summary: Whether a change request is required for a route
 *     parameters: [{ in: path, name: routeId, required: true, schema: { type: string } }]
 *     responses: { 200: { description: Requirement flag } }
 * /api/change-requests/policy/{routeId}:
 *   get:
 *     tags: [Change Requests]
 *     summary: Effective CR policy for a route (+ caller permissions)
 *     parameters: [{ in: path, name: routeId, required: true, schema: { type: string } }]
 *     responses: { 200: { description: Policy } }
 * /api/change-requests/{id}:
 *   get:
 *     tags: [Change Requests]
 *     summary: Get a change request
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses: { 200: { description: Change request }, 404: { description: Not found } }
 * /api/change-requests/{id}/approve:
 *   post:
 *     tags: [Change Requests]
 *     summary: Approve and apply a change request
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses: { 200: { description: Applied }, 403: { description: Not permitted } }
 * /api/change-requests/{id}/reject:
 *   post:
 *     tags: [Change Requests]
 *     summary: Reject a change request
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses: { 200: { description: Rejected }, 403: { description: Not permitted } }
 */

// List change requests
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { status, routeId, requestedById, page = '1', pageSize = '20' } = req.query
    const result = await changeRequestService.list({
      status: status as any,
      routeId: routeId as string,
      requestedById: requestedById as string,
      page: parseInt(String(page)) || 1,
      pageSize: Math.min(parseInt(String(pageSize)) || 20, 100),
      scope: await scopeFor(req),
    })
    res.json({ success: true, ...result })
  } catch (err) {
    next(err)
  }
})

// Get pending count
router.get('/pending-count', authenticate, async (req, res, next) => {
  try {
    const count = await changeRequestService.pendingCount(await scopeFor(req))
    res.json({ success: true, data: { count } })
  } catch (err) {
    next(err)
  }
})

// Check if change request required for a route
router.get('/check/:routeId', authenticate, requireRouteView('routeId'), async (req, res, next) => {
  try {
    const required = await changeRequestService.isChangeRequestRequired(req.params.routeId)
    res.json({ success: true, data: { required } })
  } catch (err) {
    next(err)
  }
})

// Get full CR policy for a route (includes user's permissions)
router.get('/policy/:routeId', authenticate, requireRouteView('routeId'), async (req, res, next) => {
  try {
    const policy = await changeRequestService.getPolicy(req.params.routeId)
    const canBypass = await changeRequestService.canBypass(req.params.routeId, req.user!.userId, req.user!.role)

    // Check if user can approve CRs for this route
    let canApprove = req.user!.role === 'ADMIN'
    if (!canApprove && policy.required) {
      const route = await prisma.route.findUnique({
        where: { id: req.params.routeId },
        select: { organizationId: true },
      })
      if (route?.organizationId) {
        const membership = await prisma.orgMembership.findUnique({
          where: { userId_organizationId: { userId: req.user!.userId, organizationId: route.organizationId } },
          select: { role: true },
        })
        if (membership) {
          canApprove = policy.approverRoles.includes(membership.role)
        }
      }
    }

    res.json({ success: true, data: { ...policy, canBypass, canApprove } })
  } catch (err) {
    next(err)
  }
})

// Get change request by ID
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const cr = await changeRequestService.getById(req.params.id)
    const visible =
      !!cr &&
      (req.user!.role === 'ADMIN' ||
        cr.requestedById === req.user!.userId ||
        (!!cr.routeId && (await canViewRouteById(req.user!.userId, req.user!.role, cr.routeId))))
    if (!visible) {
      return res.status(404).json({ success: false, error: { message: 'Change request not found' } })
    }
    res.json({ success: true, data: cr })
  } catch (err) {
    next(err)
  }
})

// Create change request
router.post('/', authenticate, authorize([Role.ADMIN, Role.OPERATOR]), async (req, res, next) => {
  try {
    const data = z.object({
      routeId: z.string().optional(),
      type: z.enum(['create', 'update', 'delete']),
      title: z.string().min(1).max(200),
      description: z.string().max(2000).optional(),
      payload: z.record(z.any()),
      diff: z.record(z.any()).optional(),
    }).parse(req.body)

    // Proposals must target a route the caller can see, or (for new routes)
    // an organization the caller belongs to.
    if (data.routeId) {
      if (!(await canViewRouteById(req.user!.userId, req.user!.role, data.routeId))) throw AppError.notFound('Route')
    } else if (req.user!.role !== 'ADMIN') {
      const orgId = (data.payload as any)?.organizationId
      if (typeof orgId !== 'string' || !(await isOrgMember(req.user!.userId, req.user!.role, orgId))) {
        throw AppError.forbidden('Change requests for new routes must target an organization you belong to')
      }
    }

    const cr = await changeRequestService.create({
      ...data,
      requestedById: req.user!.userId,
    })
    res.status(201).json({ success: true, data: cr })
  } catch (err) {
    next(err)
  }
})

// Approve change request
router.post('/:id/approve', authenticate, authorize([Role.ADMIN, Role.OPERATOR]), async (req, res, next) => {
  try {
    // Check if user has approver role for this CR
    const allowed = await changeRequestService.canApprove(req.params.id, req.user!.userId, req.user!.role)
    if (!allowed) {
      return res.status(403).json({ success: false, error: { message: 'You do not have permission to approve this change request' } })
    }

    const { comment } = z.object({
      comment: z.string().max(1000).optional(),
    }).parse(req.body || {})

    const cr = await changeRequestService.approve(req.params.id, req.user!.userId, comment)

    // Achievement: reviewer
    achievementService.checkReviewer(req.user!.userId).catch(() => {})

    res.json({ success: true, data: cr })
  } catch (err) {
    next(err)
  }
})

// Reject change request
router.post('/:id/reject', authenticate, authorize([Role.ADMIN, Role.OPERATOR]), async (req, res, next) => {
  try {
    // Check if user has approver role for this CR
    const allowed = await changeRequestService.canApprove(req.params.id, req.user!.userId, req.user!.role)
    if (!allowed) {
      return res.status(403).json({ success: false, error: { message: 'You do not have permission to reject this change request' } })
    }

    const { comment } = z.object({
      comment: z.string().max(1000).optional(),
    }).parse(req.body || {})

    const cr = await changeRequestService.reject(req.params.id, req.user!.userId, comment)

    // Achievement: reviewer
    achievementService.checkReviewer(req.user!.userId).catch(() => {})

    res.json({ success: true, data: cr })
  } catch (err) {
    next(err)
  }
})

/**
 * @openapi
 * /api/change-requests/{id}:
 *   delete:
 *     tags: [Change Requests]
 *     summary: Delete a resolved change request (admin)
 *     description: Permanently deletes a non-pending change request. Requires ADMIN.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Deleted }
 *       400: { description: Cannot delete a pending change request }
 */
// Delete a resolved change request (admins only)
router.delete('/:id', authenticate, authorize([Role.ADMIN]), async (req, res, next) => {
  try {
    await changeRequestService.delete(req.params.id)
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

export default router
