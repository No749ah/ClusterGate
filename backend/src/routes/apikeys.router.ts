import { Router } from 'express'
import { z } from 'zod'
import { Role } from '@prisma/client'
import { authenticate, authorize } from '../middleware/authenticate'
import * as apiKeyService from '../services/apiKeyService'

const router = Router()

// GET /api/routes/:routeId/api-keys
router.get('/:routeId/api-keys', authenticate, authorize([Role.ADMIN, Role.OPERATOR]), async (req, res, next) => {
  try {
    const keys = await apiKeyService.getApiKeys(req.params.routeId)
    res.json({ success: true, data: keys })
  } catch (err) {
    next(err)
  }
})

// POST /api/routes/:routeId/api-keys
router.post('/:routeId/api-keys', authenticate, authorize([Role.ADMIN, Role.OPERATOR]), async (req, res, next) => {
  try {
    const { name, expiresAt } = z.object({
      name: z.string().min(1, 'Name is required').max(100),
      expiresAt: z.string().datetime().optional(),
    }).parse(req.body)

    const key = await apiKeyService.createApiKey(
      req.params.routeId,
      name,
      expiresAt ? new Date(expiresAt) : undefined
    )
    res.status(201).json({ success: true, data: key })
  } catch (err) {
    next(err)
  }
})

// POST /api/routes/:routeId/api-keys/:keyId/revoke
router.post('/:routeId/api-keys/:keyId/revoke', authenticate, authorize([Role.ADMIN]), async (req, res, next) => {
  try {
    await apiKeyService.revokeApiKey(req.params.keyId)
    res.json({ success: true, message: 'API key revoked' })
  } catch (err) {
    next(err)
  }
})

// DELETE /api/routes/:routeId/api-keys/:keyId
router.delete('/:routeId/api-keys/:keyId', authenticate, authorize([Role.ADMIN]), async (req, res, next) => {
  try {
    await apiKeyService.deleteApiKey(req.params.keyId)
    res.json({ success: true, message: 'API key deleted' })
  } catch (err) {
    next(err)
  }
})

export default router
