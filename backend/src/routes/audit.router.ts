import { Router } from 'express'
import { Role } from '@prisma/client'
import { authenticate, authorize } from '../middleware/authenticate'
import * as auditService from '../services/auditService'
import { safePageSize } from '../lib/security'

const router = Router()

// GET /api/audit - List audit logs (admin only)
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
