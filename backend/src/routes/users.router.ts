import { Router } from 'express'
import { z } from 'zod'
import { Role } from '@prisma/client'
import { authenticate, authorize } from '../middleware/authenticate'
import * as userService from '../services/userService'
import { createInvite, getPendingInvites, revokeInvite } from '../services/inviteService'
import { safePageSize } from '../lib/security'

const router = Router()

/**
 * @openapi
 * /api/users:
 *   get:
 *     tags: [Users]
 *     summary: List users
 *     description: Returns a paginated list of all users. Requires ADMIN role.
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
 *           default: 20
 *     responses:
 *       200:
 *         description: Paginated user list
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
 *                     $ref: '#/components/schemas/User'
 *                 meta:
 *                   $ref: '#/components/schemas/PaginationMeta'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient permissions
 */
router.get('/', authenticate, authorize([Role.ADMIN]), async (req, res, next) => {
  try {
    const { page = '1', pageSize = '20', includeInactive } = req.query
    const result = await userService.getUsers({
      page: parseInt(String(page)) || 1,
      pageSize: safePageSize(pageSize as string),
    }, includeInactive === 'true')
    res.json({ success: true, ...result })
  } catch (err) {
    next(err)
  }
})

/**
 * @openapi
 * /api/users:
 *   post:
 *     tags: [Users]
 *     summary: Create user
 *     description: Creates a new user directly. Requires ADMIN role.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, name]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 8
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *               role:
 *                 type: string
 *                 enum: [ADMIN, OPERATOR, VIEWER]
 *                 default: VIEWER
 *     responses:
 *       201:
 *         description: User created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: Validation error or email already in use
 *       403:
 *         description: Insufficient permissions
 */
router.post('/', authenticate, authorize([Role.ADMIN]), async (req, res, next) => {
  try {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(8),
      name: z.string().min(1).max(100),
      role: z.nativeEnum(Role).default(Role.VIEWER),
    })
    const data = schema.parse(req.body)
    const user = await userService.createUser(data)
    res.status(201).json({ success: true, data: user })
  } catch (err) {
    next(err)
  }
})

/**
 * @openapi
 * /api/users/invite:
 *   post:
 *     tags: [Users]
 *     summary: Invite user
 *     description: Sends an invitation to a user by email. Requires ADMIN role.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               role:
 *                 type: string
 *                 enum: [ADMIN, OPERATOR, VIEWER]
 *                 default: VIEWER
 *     responses:
 *       201:
 *         description: Invitation created
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
 *                     email:
 *                       type: string
 *                     role:
 *                       type: string
 *                     token:
 *                       type: string
 *                     expiresAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Validation error
 *       403:
 *         description: Insufficient permissions
 */
router.post('/invite', authenticate, authorize([Role.ADMIN]), async (req, res, next) => {
  try {
    const schema = z.object({
      email: z.string().email(),
      role: z.nativeEnum(Role).default(Role.VIEWER),
    })
    const data = schema.parse(req.body)
    const invite = await createInvite(data.email, data.role, req.user!.userId)
    res.status(201).json({ success: true, data: invite })
  } catch (err) {
    next(err)
  }
})

/**
 * @openapi
 * /api/users/invites:
 *   get:
 *     tags: [Users]
 *     summary: List pending invites
 *     description: Returns all pending (unexpired, unused) invitations. Requires ADMIN role.
 *     responses:
 *       200:
 *         description: List of pending invites
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
 *                       email:
 *                         type: string
 *                       role:
 *                         type: string
 *                       expiresAt:
 *                         type: string
 *                         format: date-time
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *       403:
 *         description: Insufficient permissions
 */
router.get('/invites', authenticate, authorize([Role.ADMIN]), async (_req, res, next) => {
  try {
    const invites = await getPendingInvites()
    res.json({ success: true, data: invites })
  } catch (err) {
    next(err)
  }
})

/**
 * @openapi
 * /api/users/invites/{id}:
 *   delete:
 *     tags: [Users]
 *     summary: Revoke invite
 *     description: Revokes a pending invitation. Requires ADMIN role.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Invite revoked
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
 *         description: Invite not found
 */
router.delete('/invites/:id', authenticate, authorize([Role.ADMIN]), async (req, res, next) => {
  try {
    await revokeInvite(req.params.id)
    res.json({ success: true, message: 'Invite revoked' })
  } catch (err) {
    next(err)
  }
})

/**
 * @openapi
 * /api/users/{id}:
 *   put:
 *     tags: [Users]
 *     summary: Update user
 *     description: Updates a user's name, role, or active status. Requires ADMIN role.
 *     parameters:
 *       - in: path
 *         name: id
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
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *               role:
 *                 type: string
 *                 enum: [ADMIN, OPERATOR, VIEWER]
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: User updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/User'
 *       404:
 *         description: User not found
 */
router.put('/:id', authenticate, authorize([Role.ADMIN]), async (req, res, next) => {
  try {
    const schema = z.object({
      name: z.string().min(1).max(100).optional(),
      role: z.nativeEnum(Role).optional(),
      isActive: z.boolean().optional(),
    })
    const data = schema.parse(req.body)
    const user = await userService.updateUser(req.params.id, data)
    res.json({ success: true, data: user })
  } catch (err) {
    next(err)
  }
})

/**
 * @openapi
 * /api/users/{id}:
 *   delete:
 *     tags: [Users]
 *     summary: Delete user
 *     description: Deletes a user account. Cannot delete your own account. Requires ADMIN role.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: User deleted
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
 *         description: User not found
 */
router.delete('/:id', authenticate, authorize([Role.ADMIN]), async (req, res, next) => {
  try {
    await userService.deleteUser(req.params.id, req.user!.userId)
    res.json({ success: true, message: 'User deleted successfully' })
  } catch (err) {
    next(err)
  }
})

/**
 * @openapi
 * /api/users/{id}/reset-password:
 *   post:
 *     tags: [Users]
 *     summary: Admin reset password
 *     description: Resets a user's password (admin action). Requires ADMIN role.
 *     parameters:
 *       - in: path
 *         name: id
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
 *             required: [newPassword]
 *             properties:
 *               newPassword:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Password reset
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
 *         description: User not found
 */
router.post('/:id/restore', authenticate, authorize([Role.ADMIN]), async (req, res, next) => {
  try {
    const user = await userService.restoreUser(req.params.id)
    res.json({ success: true, data: user })
  } catch (err) {
    next(err)
  }
})

router.post('/:id/disable-2fa', authenticate, authorize([Role.ADMIN]), async (req, res, next) => {
  try {
    const user = await userService.adminDisable2FA(req.params.id)
    res.json({ success: true, data: user })
  } catch (err) {
    next(err)
  }
})

router.post('/:id/reset-password', authenticate, authorize([Role.ADMIN]), async (req, res, next) => {
  try {
    const schema = z.object({ newPassword: z.string().min(8) })
    const { newPassword } = schema.parse(req.body)
    await userService.adminResetPassword(req.params.id, newPassword)
    res.json({ success: true, message: 'Password reset successfully' })
  } catch (err) {
    next(err)
  }
})

export default router
