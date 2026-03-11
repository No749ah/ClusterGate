import { Router } from 'express'
import { Role } from '@prisma/client'
import { authenticate, authorize } from '../middleware/authenticate'
import * as logService from '../services/logService'
import { config } from '../config'
import { safePageSize } from '../lib/security'

const router = Router()

/**
 * @openapi
 * /api/logs:
 *   get:
 *     tags: [Logs]
 *     summary: List request logs
 *     description: Returns paginated request logs with optional filtering by route, method, status, and date range.
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
 *         name: routeId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: method
 *         schema:
 *           type: string
 *       - in: query
 *         name: statusType
 *         schema:
 *           type: string
 *           enum: [success, error]
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
 *         description: Paginated request logs
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
 *                       routeId:
 *                         type: string
 *                       method:
 *                         type: string
 *                       path:
 *                         type: string
 *                       statusCode:
 *                         type: integer
 *                       responseTime:
 *                         type: integer
 *                       ip:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                 meta:
 *                   $ref: '#/components/schemas/PaginationMeta'
 *       400:
 *         description: Invalid date parameters
 *       401:
 *         description: Not authenticated
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { page = '1', pageSize = '50', routeId, method, statusType, dateFrom, dateTo } = req.query

    // Validate date params
    const parsedDateFrom = dateFrom ? new Date(String(dateFrom)) : undefined
    const parsedDateTo = dateTo ? new Date(String(dateTo)) : undefined
    if (parsedDateFrom && isNaN(parsedDateFrom.getTime())) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid dateFrom' } })
    }
    if (parsedDateTo && isNaN(parsedDateTo.getTime())) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid dateTo' } })
    }

    const result = await logService.getRouteLogs(
      {
        routeId: routeId as string,
        method: method as string,
        statusType: statusType as 'success' | 'error',
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

/**
 * @openapi
 * /api/logs/errors:
 *   get:
 *     tags: [Logs]
 *     summary: Get recent errors
 *     description: Returns recent error log entries, optionally filtered by route.
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           maximum: 100
 *       - in: query
 *         name: routeId
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Recent error logs
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
 */
router.get('/errors', authenticate, async (req, res, next) => {
  try {
    const { limit = '10', routeId } = req.query
    const errors = await logService.getRecentErrors(
      routeId as string,
      Math.min(parseInt(String(limit)) || 10, 100)
    )
    res.json({ success: true, data: errors })
  } catch (err) {
    next(err)
  }
})

/**
 * @openapi
 * /api/logs/daily:
 *   get:
 *     tags: [Logs]
 *     summary: Get daily request counts
 *     description: Returns daily aggregated request counts for charting.
 *     parameters:
 *       - in: query
 *         name: routeId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 7
 *           minimum: 1
 *           maximum: 365
 *     responses:
 *       200:
 *         description: Daily request counts
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
 *                       date:
 *                         type: string
 *                       count:
 *                         type: integer
 */
router.get('/daily', authenticate, async (req, res, next) => {
  try {
    const { routeId, days = '7' } = req.query
    const parsedDays = Math.min(Math.max(parseInt(String(days)) || 7, 1), 365)
    const daily = await logService.getDailyRequestCounts(
      routeId as string,
      parsedDays
    )
    res.json({ success: true, data: daily })
  } catch (err) {
    next(err)
  }
})

/**
 * @openapi
 * /api/logs/cleanup:
 *   delete:
 *     tags: [Logs]
 *     summary: Clean old logs
 *     description: Deletes request logs older than the configured retention period. Requires ADMIN role.
 *     responses:
 *       200:
 *         description: Cleanup result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                   example: Deleted 150 old log entries
 *       403:
 *         description: Insufficient permissions
 */
router.delete('/cleanup', authenticate, authorize([Role.ADMIN]), async (_req, res, next) => {
  try {
    const count = await logService.cleanOldLogs(config.LOG_RETENTION_DAYS)
    res.json({ success: true, message: `Deleted ${count} old log entries` })
  } catch (err) {
    next(err)
  }
})

export default router
