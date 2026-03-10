import { Router } from 'express'
import { Role } from '@prisma/client'
import { authenticate, authorize } from '../middleware/authenticate'
import * as auditService from '../services/auditService'

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

    const result = await auditService.getAuditLogs(
      {
        userId: userId as string,
        action: action as string,
        resource: resource as string,
        resourceId: resourceId as string,
        dateFrom: dateFrom ? new Date(String(dateFrom)) : undefined,
        dateTo: dateTo ? new Date(String(dateTo)) : undefined,
      },
      { page: parseInt(String(page)), pageSize: parseInt(String(pageSize)) }
    )

    res.json({ success: true, ...result })
  } catch (err) {
    next(err)
  }
})

export default router
