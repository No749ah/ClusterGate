import { Router } from 'express'
import { z } from 'zod'
import { Role } from '@prisma/client'
import { authenticate, authorize } from '../middleware/authenticate'
import * as apiKeyService from '../services/apiKeyService'

const router = Router()

/**
 * @openapi
 * /api/routes/{routeId}/api-keys:
 *   get:
 *     tags: [API Keys]
 *     summary: List API keys for a route
 *     description: Returns all API keys associated with a route. Requires ADMIN or OPERATOR role.
 *     parameters:
 *       - in: path
 *         name: routeId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: List of API keys
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       keyPrefix:
 *                         type: string
 *                         description: First characters of the key for identification
 *                       isActive:
 *                         type: boolean
 *                       expiresAt:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
 *                       lastUsedAt:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient permissions
 */
router.get('/:routeId/api-keys', authenticate, authorize([Role.ADMIN, Role.OPERATOR]), async (req, res, next) => {
  try {
    const keys = await apiKeyService.getApiKeys(req.params.routeId)
    res.json({ success: true, data: keys })
  } catch (err) {
    next(err)
  }
})

/**
 * @openapi
 * /api/routes/{routeId}/api-keys:
 *   post:
 *     tags: [API Keys]
 *     summary: Create API key
 *     description: Creates a new API key for a route. The full key is only returned once in this response. Requires ADMIN or OPERATOR role.
 *     parameters:
 *       - in: path
 *         name: routeId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *               expiresAt:
 *                 type: string
 *                 format: date-time
 *                 description: Optional expiration date
 *     responses:
 *       201:
 *         description: API key created (full key returned only once)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     key:
 *                       type: string
 *                       description: The full API key (shown only once)
 *                     expiresAt:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *       400:
 *         description: Validation error
 */
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

/**
 * @openapi
 * /api/routes/{routeId}/api-keys/{keyId}/revoke:
 *   post:
 *     tags: [API Keys]
 *     summary: Revoke API key
 *     description: Revokes an API key, making it inactive. Requires ADMIN role.
 *     parameters:
 *       - in: path
 *         name: routeId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: keyId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: API key revoked
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       404:
 *         description: API key not found
 */
router.post('/:routeId/api-keys/:keyId/revoke', authenticate, authorize([Role.ADMIN]), async (req, res, next) => {
  try {
    await apiKeyService.revokeApiKey(req.params.keyId, req.params.routeId)
    res.json({ success: true, message: 'API key revoked' })
  } catch (err) {
    next(err)
  }
})

/**
 * @openapi
 * /api/routes/{routeId}/api-keys/{keyId}:
 *   delete:
 *     tags: [API Keys]
 *     summary: Delete API key
 *     description: Permanently deletes an API key. Requires ADMIN role.
 *     parameters:
 *       - in: path
 *         name: routeId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: keyId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: API key deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       404:
 *         description: API key not found
 */
router.delete('/:routeId/api-keys/:keyId', authenticate, authorize([Role.ADMIN]), async (req, res, next) => {
  try {
    await apiKeyService.deleteApiKey(req.params.keyId, req.params.routeId)
    res.json({ success: true, message: 'API key deleted' })
  } catch (err) {
    next(err)
  }
})

export default router
