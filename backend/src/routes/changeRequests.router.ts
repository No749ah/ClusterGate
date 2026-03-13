import { Router } from 'express'
import { z } from 'zod'
import { Role } from '@prisma/client'
import { authenticate, authorize } from '../middleware/authenticate'
import { changeRequestService } from '../services/changeRequestService'
import { achievementService } from '../services/achievementService'

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
router.post('/:id/approve', authenticate, authorize([Role.ADMIN]), async (req, res, next) => {
  try {
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
router.post('/:id/reject', authenticate, authorize([Role.ADMIN]), async (req, res, next) => {
  try {
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
