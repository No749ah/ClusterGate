import { Router } from 'express'
import { z } from 'zod'
import { Role } from '@prisma/client'
import { authenticate, authorize } from '../middleware/authenticate'
import { changeRequestService } from '../services/changeRequestService'
import { achievementService } from '../services/achievementService'
import { prisma } from '../lib/prisma'

const router = Router()

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
    })
    res.json({ success: true, ...result })
  } catch (err) {
    next(err)
  }
})

// Get pending count
router.get('/pending-count', authenticate, async (_req, res, next) => {
  try {
    const count = await changeRequestService.pendingCount()
    res.json({ success: true, data: { count } })
  } catch (err) {
    next(err)
  }
})

// Check if change request required for a route
router.get('/check/:routeId', authenticate, async (req, res, next) => {
  try {
    const required = await changeRequestService.isChangeRequestRequired(req.params.routeId)
    res.json({ success: true, data: { required } })
  } catch (err) {
    next(err)
  }
})

// Get full CR policy for a route (includes user's permissions)
router.get('/policy/:routeId', authenticate, async (req, res, next) => {
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
    if (!cr) {
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

export default router
