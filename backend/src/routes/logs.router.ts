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
