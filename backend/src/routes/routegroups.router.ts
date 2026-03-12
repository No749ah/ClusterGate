import { Router } from 'express'
import { z } from 'zod'
import { Role } from '@prisma/client'
import { authenticate, authorize } from '../middleware/authenticate'
import * as routeGroupService from '../services/routeGroupService'

const router = Router()

const routeGroupSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  pathPrefix: z.string().min(3).startsWith('/r/'),
  teamId: z.string().optional(),
  defaultTimeout: z.number().int().min(1000).max(120000).optional(),
  defaultRetryCount: z.number().int().min(0).max(5).optional(),
  defaultRateLimitEnabled: z.boolean().optional(),
  defaultRateLimitMax: z.number().int().min(1).optional(),
  defaultRateLimitWindow: z.number().int().min(1000).optional(),
  defaultAuthType: z.enum(['NONE', 'API_KEY', 'BASIC', 'BEARER']).optional(),
  defaultAuthValue: z.string().optional(),
  defaultAddHeaders: z.record(z.string()).optional(),
  defaultRemoveHeaders: z.array(z.string()).optional(),
  defaultCorsEnabled: z.boolean().optional(),
  defaultCorsOrigins: z.array(z.string()).optional(),
  defaultIpAllowlist: z.array(z.string()).optional(),
})

// List route groups
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { teamId, search } = req.query
    const groups = await routeGroupService.getRouteGroups({
      teamId: teamId as string,
      search: search as string,
    })
    res.json({ success: true, data: groups })
  } catch (err) {
    next(err)
  }
})

// Get route group by ID
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const group = await routeGroupService.getRouteGroupById(req.params.id)
    res.json({ success: true, data: group })
  } catch (err) {
    next(err)
  }
})

// Create route group
router.post('/', authenticate, authorize([Role.ADMIN, Role.OPERATOR]), async (req, res, next) => {
  try {
    const data = routeGroupSchema.parse(req.body)
    const group = await routeGroupService.createRouteGroup(data)
    res.status(201).json({ success: true, data: group })
  } catch (err) {
    next(err)
  }
})

// Update route group
router.put('/:id', authenticate, authorize([Role.ADMIN, Role.OPERATOR]), async (req, res, next) => {
  try {
    const data = routeGroupSchema.partial().parse(req.body)
    const group = await routeGroupService.updateRouteGroup(req.params.id, data as any)
    res.json({ success: true, data: group })
  } catch (err) {
    next(err)
  }
})

// Delete route group
router.delete('/:id', authenticate, authorize([Role.ADMIN]), async (req, res, next) => {
  try {
    await routeGroupService.deleteRouteGroup(req.params.id)
    res.json({ success: true, message: 'Route group deleted' })
  } catch (err) {
    next(err)
  }
})

// Assign route to group
router.post('/:id/routes/:routeId', authenticate, authorize([Role.ADMIN, Role.OPERATOR]), async (req, res, next) => {
  try {
    const route = await routeGroupService.assignRouteToGroup(req.params.routeId, req.params.id)
    res.json({ success: true, data: route })
  } catch (err) {
    next(err)
  }
})

// Remove route from group
router.delete('/:id/routes/:routeId', authenticate, authorize([Role.ADMIN, Role.OPERATOR]), async (req, res, next) => {
  try {
    const route = await routeGroupService.assignRouteToGroup(req.params.routeId, null)
    res.json({ success: true, data: route })
  } catch (err) {
    next(err)
  }
})

export default router
