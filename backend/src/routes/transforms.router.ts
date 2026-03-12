import { Router } from 'express'
import { z } from 'zod'
import { Role } from '@prisma/client'
import { authenticate, authorize } from '../middleware/authenticate'
import * as transformService from '../services/transformService'

const router = Router()

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
