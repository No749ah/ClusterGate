import { Router } from 'express'
import { z } from 'zod'
import { Role } from '@prisma/client'
import { authenticate, authorize } from '../middleware/authenticate'
import { attachRouteParamResolver } from '../middleware/resolveRouteParam'
import * as lbService from '../services/loadBalancerService'

const router = Router()
attachRouteParamResolver(router, 'routeId')

/**
 * @openapi
 * /api/routes/{routeId}/targets:
 *   get:
 *     tags: [Targets]
 *     summary: List load-balancer targets for a route
 *     parameters: [{ in: path, name: routeId, required: true, schema: { type: string } }]
 *     responses: { 200: { description: List of targets } }
 *   post:
 *     tags: [Targets]
 *     summary: Add a target (admin/operator)
 *     parameters: [{ in: path, name: routeId, required: true, schema: { type: string } }]
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { type: object, required: [url], properties: { url: { type: string, format: uri }, weight: { type: integer }, priority: { type: integer } } } } }
 *     responses: { 201: { description: Created } }
 * /api/routes/{routeId}/targets/{targetId}:
 *   put:
 *     tags: [Targets]
 *     summary: Update a target (admin/operator)
 *     parameters:
 *       - { in: path, name: routeId, required: true, schema: { type: string } }
 *       - { in: path, name: targetId, required: true, schema: { type: string } }
 *     responses: { 200: { description: Updated } }
 *   delete:
 *     tags: [Targets]
 *     summary: Delete a target (admin)
 *     parameters:
 *       - { in: path, name: routeId, required: true, schema: { type: string } }
 *       - { in: path, name: targetId, required: true, schema: { type: string } }
 *     responses: { 200: { description: Deleted } }
 */

const targetSchema = z.object({
  url: z.string().url(),
  weight: z.number().int().min(1).max(100).default(100),
  priority: z.number().int().min(0).default(0),
})

// GET /api/routes/:routeId/targets
router.get('/:routeId/targets', authenticate, async (req, res, next) => {
  try {
    const targets = await lbService.getTargets(req.params.routeId)
    res.json({ success: true, data: targets })
  } catch (err) {
    next(err)
  }
})

// POST /api/routes/:routeId/targets
router.post('/:routeId/targets', authenticate, authorize([Role.ADMIN, Role.OPERATOR]), async (req, res, next) => {
  try {
    const data = targetSchema.parse(req.body)
    const target = await lbService.addTarget(req.params.routeId, data)

    res.status(201).json({ success: true, data: target })
  } catch (err) {
    next(err)
  }
})

// PUT /api/routes/:routeId/targets/:targetId
router.put('/:routeId/targets/:targetId', authenticate, authorize([Role.ADMIN, Role.OPERATOR]), async (req, res, next) => {
  try {
    const data = targetSchema.partial().parse(req.body)
    const target = await lbService.updateTarget(req.params.targetId, data)
    res.json({ success: true, data: target })
  } catch (err) {
    next(err)
  }
})

// DELETE /api/routes/:routeId/targets/:targetId
router.delete('/:routeId/targets/:targetId', authenticate, authorize([Role.ADMIN]), async (req, res, next) => {
  try {
    await lbService.deleteTarget(req.params.targetId)
    res.json({ success: true, message: 'Target deleted' })
  } catch (err) {
    next(err)
  }
})

export default router
