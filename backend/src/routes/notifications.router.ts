import { Router } from 'express'
import { authenticate } from '../middleware/authenticate'
import * as notificationService from '../services/notificationService'

const router = Router()

// GET /api/notifications
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { unreadOnly } = req.query
    const notifications = await notificationService.getNotifications(
      req.user!.userId,
      unreadOnly === 'true'
    )
    res.json({ success: true, data: notifications })
  } catch (err) {
    next(err)
  }
})

// GET /api/notifications/count
router.get('/count', authenticate, async (req, res, next) => {
  try {
    const count = await notificationService.getUnreadCount(req.user!.userId)
    res.json({ success: true, data: { count } })
  } catch (err) {
    next(err)
  }
})

// POST /api/notifications/:id/read
router.post('/:id/read', authenticate, async (req, res, next) => {
  try {
    await notificationService.markAsRead(req.params.id, req.user!.userId)
    res.json({ success: true, message: 'Notification marked as read' })
  } catch (err) {
    next(err)
  }
})

// POST /api/notifications/read-all
router.post('/read-all', authenticate, async (req, res, next) => {
  try {
    await notificationService.markAllAsRead(req.user!.userId)
    res.json({ success: true, message: 'All notifications marked as read' })
  } catch (err) {
    next(err)
  }
})

export default router
