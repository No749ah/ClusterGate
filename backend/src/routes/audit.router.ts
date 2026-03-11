import { Router } from 'express'
import { Role } from '@prisma/client'
import { authenticate, authorize } from '../middleware/authenticate'
import * as auditService from '../services/auditService'
import { safePageSize } from '../lib/security'

const router = Router()

/**
 * @openapi
 * /api/audit:
 *   get:
 *     tags: [Audit]
 *     summary: List audit logs
 *     description: Returns paginated audit logs with optional filtering. Requires ADMIN role.
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *         description: Filter by action type (e.g., auth.login, route.create)
 *       - in: query
 *         name: resource
 *         schema:
 *           type: string
 *         description: Filter by resource type (e.g., auth, route, user)
 *       - in: query
 *         name: resourceId
 *         schema:
 *           type: string
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date-time
 *     responses:
 *       200:
 *         description: Paginated audit logs
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
 *                       userId:
 *                         type: string
 *                         nullable: true
 *                       action:
 *                         type: string
 *                       resource:
 *                         type: string
 *                       resourceId:
 *                         type: string
 *                         nullable: true
 *                       details:
 *                         type: object
 *                       ip:
 *                         type: string
 *                       userAgent:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                 meta:
 *                   $ref: '#/components/schemas/PaginationMeta'
 *       400:
 *         description: Invalid date parameters
 *       403:
 *         description: Insufficient permissions
 */
router.get('/', authenticate, authorize([Role.ADMIN]), async (req, res, next) => {
  try {
    const {
      page = '1',
      pageSize = '50',
      userId,
      action,
      resource,
      resourceId,
      dateFrom,
      dateTo,
    } = req.query

    // Validate date params
    const parsedDateFrom = dateFrom ? new Date(String(dateFrom)) : undefined
    const parsedDateTo = dateTo ? new Date(String(dateTo)) : undefined
    if (parsedDateFrom && isNaN(parsedDateFrom.getTime())) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid dateFrom' } })
    }
    if (parsedDateTo && isNaN(parsedDateTo.getTime())) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid dateTo' } })
    }

    const result = await auditService.getAuditLogs(
      {
        userId: userId as string,
        action: action as string,
        resource: resource as string,
        resourceId: resourceId as string,
        dateFrom: parsedDateFrom,
        dateTo: parsedDateTo,
      },
      { page: parseInt(String(page)) || 1, pageSize: safePageSize(pageSize as string) }
    )

    res.json({ success: true, ...result })
  } catch (err) {
    next(err)
  }
})

export default router
