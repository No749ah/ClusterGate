import { Router } from 'express'
import { z } from 'zod'
import { Role } from '@prisma/client'
import { authenticate, authorize } from '../middleware/authenticate'
import { attachRouteParamResolver } from '../middleware/resolveRouteParam'
import * as transformService from '../services/transformService'

const router = Router()
attachRouteParamResolver(router, 'routeId')

/**
 * @openapi
 * /api/routes/{routeId}/transforms:
 *   get:
 *     tags: [Transforms]
 *     summary: List request/response transform rules for a route
 *     parameters: [{ in: path, name: routeId, required: true, schema: { type: string } }]
 *     responses: { 200: { description: List of transform rules } }
 *   post:
 *     tags: [Transforms]
 *     summary: Create a transform rule (admin/operator)
 *     parameters: [{ in: path, name: routeId, required: true, schema: { type: string } }]
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { type: object, properties: { phase: { type: string, enum: [REQUEST, RESPONSE] }, type: { type: string, enum: [SET_HEADER, REMOVE_HEADER, REWRITE_BODY_JSON, SET_QUERY_PARAM, REMOVE_QUERY_PARAM, MAP_STATUS_CODE] }, name: { type: string } } } } }
 *     responses: { 201: { description: Created } }
 * /api/routes/{routeId}/transforms/{ruleId}:
 *   put:
 *     tags: [Transforms]
 *     summary: Update a transform rule (admin/operator)
 *     parameters:
 *       - { in: path, name: routeId, required: true, schema: { type: string } }
 *       - { in: path, name: ruleId, required: true, schema: { type: string } }
 *     responses: { 200: { description: Updated } }
 *   delete:
 *     tags: [Transforms]
 *     summary: Delete a transform rule (admin)
 *     parameters:
 *       - { in: path, name: routeId, required: true, schema: { type: string } }
 *       - { in: path, name: ruleId, required: true, schema: { type: string } }
 *     responses: { 200: { description: Deleted } }
 */

const transformRuleSchema = z.object({
  phase: z.enum(['REQUEST', 'RESPONSE']),
  type: z.enum(['SET_HEADER', 'REMOVE_HEADER', 'REWRITE_BODY_JSON', 'SET_QUERY_PARAM', 'REMOVE_QUERY_PARAM', 'MAP_STATUS_CODE']),
  name: z.string().min(1).max(100),
  config: z.record(z.any()),
  order: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
  condition: z.record(z.any()).nullable().optional(),
})

// GET /api/routes/:routeId/transforms
router.get('/:routeId/transforms', authenticate, async (req, res, next) => {
  try {
    const rules = await transformService.getTransformRules(req.params.routeId)
    res.json({ success: true, data: rules })
  } catch (err) {
    next(err)
  }
})

// POST /api/routes/:routeId/transforms
router.post('/:routeId/transforms', authenticate, authorize([Role.ADMIN, Role.OPERATOR]), async (req, res, next) => {
  try {
    const data = transformRuleSchema.parse(req.body)
    const rule = await transformService.createTransformRule(req.params.routeId, data)
    res.status(201).json({ success: true, data: rule })
  } catch (err) {
    next(err)
  }
})

// PUT /api/routes/:routeId/transforms/:ruleId
router.put('/:routeId/transforms/:ruleId', authenticate, authorize([Role.ADMIN, Role.OPERATOR]), async (req, res, next) => {
  try {
    const data = transformRuleSchema.partial().parse(req.body)
    const rule = await transformService.updateTransformRule(req.params.ruleId, data as any)
    res.json({ success: true, data: rule })
  } catch (err) {
    next(err)
  }
})

// DELETE /api/routes/:routeId/transforms/:ruleId
router.delete('/:routeId/transforms/:ruleId', authenticate, authorize([Role.ADMIN]), async (req, res, next) => {
  try {
    await transformService.deleteTransformRule(req.params.ruleId)
    res.json({ success: true, message: 'Transform rule deleted' })
  } catch (err) {
    next(err)
  }
})

export default router
