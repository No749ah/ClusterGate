import { Router } from 'express'
import { z } from 'zod'
import { Role } from '@prisma/client'
import { authenticate, authorize } from '../middleware/authenticate'
import { incidentService } from '../services/incidentService'
import { achievementService } from '../services/achievementService'

const router = Router()

// List incidents
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { status, routeId, page = '1', pageSize = '20' } = req.query
    const result = await incidentService.list({
      status: status as any,
      routeId: routeId as string,
      page: parseInt(String(page)) || 1,
      pageSize: Math.min(parseInt(String(pageSize)) || 20, 100),
    })
    res.json({ success: true, ...result })
  } catch (err) {
    next(err)
  }
})

// Get incident by ID
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const incident = await incidentService.getById(req.params.id)
    if (!incident) {
      return res.status(404).json({ success: false, error: { message: 'Incident not found' } })
    }
    res.json({ success: true, data: incident })
  } catch (err) {
    next(err)
  }
})

// Create incident manually
router.post('/', authenticate, authorize([Role.ADMIN, Role.OPERATOR]), async (req, res, next) => {
  try {
    const data = z.object({
      title: z.string().min(1).max(200),
      description: z.string().max(2000).optional(),
      severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
      routeId: z.string().optional(),
    }).parse(req.body)

    const incident = await incidentService.create(data)
    res.status(201).json({ success: true, data: incident })
  } catch (err) {
    next(err)
  }
})

// Update incident status
router.patch('/:id/status', authenticate, authorize([Role.ADMIN, Role.OPERATOR]), async (req, res, next) => {
  try {
    const { status } = z.object({
      status: z.enum(['ACTIVE', 'INVESTIGATING', 'RESOLVED']),
    }).parse(req.body)

    const incident = await incidentService.updateStatus(req.params.id, status, req.user!.userId)

    // Achievement: first incident resolved
    if (status === 'RESOLVED') {
      achievementService.checkIncidentResolved(req.user!.userId).catch(() => {})
    }

    res.json({ success: true, data: incident })
  } catch (err) {
    next(err)
  }
})

// Add event to incident
router.post('/:id/events', authenticate, authorize([Role.ADMIN, Role.OPERATOR]), async (req, res, next) => {
  try {
    const data = z.object({
      type: z.string().min(1).max(50),
      title: z.string().min(1).max(200),
      description: z.string().max(2000).optional(),
      metadata: z.record(z.any()).optional(),
    }).parse(req.body)

    const event = await incidentService.addEvent(req.params.id, {
      ...data,
      createdById: req.user!.userId,
    })
    res.status(201).json({ success: true, data: event })
  } catch (err) {
    next(err)
  }
})

export default router
