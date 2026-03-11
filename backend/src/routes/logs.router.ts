import { Router } from 'express'
import { Role } from '@prisma/client'
import { authenticate, authorize } from '../middleware/authenticate'
import * as logService from '../services/logService'
import { config } from '../config'
import { safePageSize } from '../lib/security'

const router = Router()

// GET /api/logs
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { page = '1', pageSize = '50', routeId, method, statusType, dateFrom, dateTo } = req.query

    const result = await logService.getRouteLogs(
      {
        routeId: routeId as string,
        method: method as string,
        statusType: statusType as 'success' | 'error',
        dateFrom: dateFrom ? new Date(String(dateFrom)) : undefined,
        dateTo: dateTo ? new Date(String(dateTo)) : undefined,
      },
      { page: parseInt(String(page)) || 1, pageSize: safePageSize(pageSize as string) }
    )

    res.json({ success: true, ...result })
  } catch (err) {
    next(err)
  }
})

// GET /api/logs/errors
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

// GET /api/logs/daily
router.get('/daily', authenticate, async (req, res, next) => {
  try {
    const { routeId, days = '7' } = req.query
    const daily = await logService.getDailyRequestCounts(
      routeId as string,
      parseInt(String(days))
    )
    res.json({ success: true, data: daily })
  } catch (err) {
    next(err)
  }
})

// DELETE /api/logs/cleanup
router.delete('/cleanup', authenticate, authorize([Role.ADMIN]), async (_req, res, next) => {
  try {
    const count = await logService.cleanOldLogs(config.LOG_RETENTION_DAYS)
    res.json({ success: true, message: `Deleted ${count} old log entries` })
  } catch (err) {
    next(err)
  }
})

export default router
