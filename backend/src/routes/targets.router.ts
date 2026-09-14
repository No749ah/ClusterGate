import { Router } from 'express'
import { z } from 'zod'
import { Role } from '@prisma/client'
import { authenticate, authorize } from '../middleware/authenticate'
import { attachRouteParamResolver } from '../middleware/resolveRouteParam'
import { requireRouteView, requireRouteManage } from '../middleware/routeAccess'
import * as lbService from '../services/loadBalancerService'
import { prisma } from '../lib/prisma'
import { AppError } from '../lib/errors'
import { validateTargetUrlSync } from '../lib/security'

const router = Router()
attachRouteParamResolver(router, 'routeId')

/**
 * @openapi
 * /api/routes/{routeId}/targets:
 *   get:
 *     tags: [Targets]
 *     summary: List load-balancing targets for a route
 *     parameters: [{ in: path, name: routeId, required: true, schema: { type: string } }]
 *     responses: { 200: { description: Targets } }
 *   post:
 *     tags: [Targets]
 *     summary: Add a target (admin/operator with manage rights on the route)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [url]
 *             properties:
 *               url: { type: string, format: uri }
 *               weight: { type: integer, minimum: 1, maximum: 100, default: 100 }
 *               priority: { type: integer, minimum: 0, default: 0 }
 *     responses: { 201: { description: Target created } }
 * /api/routes/{routeId}/targets/{targetId}:
 *   put:
 *     tags: [Targets]
 *     summary: Update a target
 *     responses: { 200: { description: Updated } }
 *   delete:
 *     tags: [Targets]
 *     summary: Delete a target (admin)
 *     responses: { 200: { description: Deleted } }
 */

const targetSchema = z.object({
  url: z.string().url(),
  weight: z.number().int().min(1).max(100).default(100),
  priority: z.number().int().min(0).default(0),
})

// Targets receive the route's injected upstream credentials, so a target URL
// is as sensitive as the route's own target: SSRF-checked and only editable
// by someone who may manage the route.
function assertTargetUrl(url: string | undefined) {
  if (url) validateTargetUrlSync(url)
}

// A target id from the URL must belong to the route in the URL — otherwise a
// caller with manage rights on one route could edit targets of another.
async function assertTargetBelongsToRoute(targetId: string, routeId: string) {
  const target = await prisma.routeTarget.findFirst({ where: { id: targetId, routeId }, select: { id: true } })
  if (!target) throw AppError.notFound('Target')
}

// GET /api/routes/:routeId/targets
router.get('/:routeId/targets', authenticate, requireRouteView('routeId'), async (req, res, next) => {
  try {
    const targets = await lbService.getTargets(req.params.routeId)
    res.json({ success: true, data: targets })
  } catch (err) {
    next(err)
  }
})

// POST /api/routes/:routeId/targets
router.post('/:routeId/targets', authenticate, authorize([Role.ADMIN, Role.OPERATOR]), requireRouteManage('routeId'), async (req, res, next) => {
  try {
    const data = targetSchema.parse(req.body)
    assertTargetUrl(data.url)
    const target = await lbService.addTarget(req.params.routeId, data)

    res.status(201).json({ success: true, data: target })
  } catch (err) {
    next(err)
  }
})

// PUT /api/routes/:routeId/targets/:targetId
router.put('/:routeId/targets/:targetId', authenticate, authorize([Role.ADMIN, Role.OPERATOR]), requireRouteManage('routeId'), async (req, res, next) => {
  try {
    const data = targetSchema.partial().parse(req.body)
    assertTargetUrl(data.url)
    await assertTargetBelongsToRoute(req.params.targetId, req.params.routeId)
    const target = await lbService.updateTarget(req.params.targetId, data)
    res.json({ success: true, data: target })
  } catch (err) {
    next(err)
  }
})

// DELETE /api/routes/:routeId/targets/:targetId
router.delete('/:routeId/targets/:targetId', authenticate, authorize([Role.ADMIN]), requireRouteManage('routeId'), async (req, res, next) => {
  try {
    await assertTargetBelongsToRoute(req.params.targetId, req.params.routeId)
    await lbService.deleteTarget(req.params.targetId)
    res.json({ success: true, message: 'Target deleted' })
  } catch (err) {
    next(err)
  }
})

export default router
