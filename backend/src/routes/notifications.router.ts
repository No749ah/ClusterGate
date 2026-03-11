import { Router } from 'express'
import { authenticate } from '../middleware/authenticate'
import * as notificationService from '../services/notificationService'

const router = Router()

/**
 * @openapi
 * /api/notifications:
 *   get:
 *     tags: [Notifications]
 *     summary: List notifications
 *     description: Returns the current user's notifications, optionally filtered to unread only.
 *     parameters:
 *       - in: query
 *         name: unreadOnly
 *         schema:
 *           type: string
 *           enum: ['true', 'false']
 *         description: If "true", return only unread notifications
 *     responses:
 *       200:
 *         description: List of notifications
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
 *                       type:
 *                         type: string
 *                       title:
 *                         type: string
 *                       message:
 *                         type: string
 *                       isRead:
 *                         type: boolean
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Not authenticated
 */
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

/**
 * @openapi
 * /api/notifications/count:
 *   get:
 *     tags: [Notifications]
 *     summary: Get unread count
 *     description: Returns the number of unread notifications for the current user.
 *     responses:
 *       200:
 *         description: Unread notification count
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
 *                     count:
 *                       type: integer
 *       401:
 *         description: Not authenticated
 */
router.get('/count', authenticate, async (req, res, next) => {
  try {
    const count = await notificationService.getUnreadCount(req.user!.userId)
    res.json({ success: true, data: { count } })
  } catch (err) {
    next(err)
  }
})

/**
 * @openapi
 * /api/notifications/{id}/read:
 *   post:
 *     tags: [Notifications]
 *     summary: Mark notification as read
 *     description: Marks a single notification as read.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Notification marked as read
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
 *         description: Notification not found
 */
router.post('/:id/read', authenticate, async (req, res, next) => {
  try {
    await notificationService.markAsRead(req.params.id, req.user!.userId)
    res.json({ success: true, message: 'Notification marked as read' })
  } catch (err) {
    next(err)
  }
})

/**
 * @openapi
 * /api/notifications/read-all:
 *   post:
 *     tags: [Notifications]
 *     summary: Mark all as read
 *     description: Marks all notifications as read for the current user.
 *     responses:
 *       200:
 *         description: All notifications marked as read
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       401:
 *         description: Not authenticated
 */
router.post('/read-all', authenticate, async (req, res, next) => {
  try {
    await notificationService.markAllAsRead(req.user!.userId)
    res.json({ success: true, message: 'All notifications marked as read' })
  } catch (err) {
    next(err)
  }
})

export default router
