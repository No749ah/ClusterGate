import { Router } from 'express'
import { z } from 'zod'
import { Role } from '@prisma/client'
import { authenticate, authorize } from '../middleware/authenticate'
import * as userService from '../services/userService'
import { createInvite, getPendingInvites, revokeInvite } from '../services/inviteService'
import { safePageSize } from '../lib/security'

const router = Router()

// GET /api/users
router.get('/', authenticate, authorize([Role.ADMIN]), async (req, res, next) => {
  try {
    const { page = '1', pageSize = '20' } = req.query
    const result = await userService.getUsers({
      page: parseInt(String(page)) || 1,
      pageSize: safePageSize(pageSize as string),
    })
    res.json({ success: true, ...result })
  } catch (err) {
    next(err)
  }
})

// POST /api/users — create user directly (kept for backwards compat)
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

// POST /api/users/invite — invite user by email
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

// GET /api/users/invites — list pending invites
router.get('/invites', authenticate, authorize([Role.ADMIN]), async (_req, res, next) => {
  try {
    const invites = await getPendingInvites()
    res.json({ success: true, data: invites })
  } catch (err) {
    next(err)
  }
})

// DELETE /api/users/invites/:id — revoke invite
router.delete('/invites/:id', authenticate, authorize([Role.ADMIN]), async (req, res, next) => {
  try {
    await revokeInvite(req.params.id)
    res.json({ success: true, message: 'Invite revoked' })
  } catch (err) {
    next(err)
  }
})

// PUT /api/users/:id
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

// DELETE /api/users/:id
router.delete('/:id', authenticate, authorize([Role.ADMIN]), async (req, res, next) => {
  try {
    await userService.deleteUser(req.params.id, req.user!.userId)
    res.json({ success: true, message: 'User deleted successfully' })
  } catch (err) {
    next(err)
  }
})

// POST /api/users/:id/reset-password
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
