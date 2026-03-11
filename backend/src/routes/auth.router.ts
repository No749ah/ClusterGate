import { Router, Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { login, getCurrentUser, changePassword, isSetupComplete, setupInitialAdmin } from '../services/authService'
import { validateInvite, acceptInvite } from '../services/inviteService'
import { authenticate } from '../middleware/authenticate'
import { authLimiter } from '../middleware/rateLimiter'
import { config } from '../config'
import { createAuditLog } from '../services/auditService'

const router = Router()

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: config.isProd,
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/',
}

// GET /api/auth/setup-status — public, no auth required
router.get('/setup-status', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const setupDone = await isSetupComplete()
    res.json({ success: true, data: { isSetupComplete: setupDone } })
  } catch (err) {
    next(err)
  }
})

// POST /api/auth/setup — create first admin, only works when 0 users exist
router.post('/setup', authLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      email: z.string().email('Invalid email address'),
      password: z.string().min(8, 'Password must be at least 8 characters'),
      name: z.string().min(1, 'Name is required'),
    })

    const data = schema.parse(req.body)
    const result = await setupInitialAdmin(data)

    res.cookie('token', result.token, COOKIE_OPTIONS)

    createAuditLog({
      userId: result.user.id,
      action: 'auth.setup',
      resource: 'auth',
      details: { email: data.email, name: data.name },
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.get('user-agent'),
    })

    res.json({
      success: true,
      data: { user: result.user },
    })
  } catch (err) {
    next(err)
  }
})

// GET /api/auth/invite/:token — validate invite token (public)
router.get('/invite/:token', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invite = await validateInvite(req.params.token)
    res.json({ success: true, data: invite })
  } catch (err) {
    next(err)
  }
})

// POST /api/auth/accept-invite — accept invite and create account (public)
router.post('/accept-invite', authLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      token: z.string().min(1, 'Token is required'),
      name: z.string().min(1, 'Name is required'),
      password: z.string().min(8, 'Password must be at least 8 characters'),
    })

    const data = schema.parse(req.body)
    const result = await acceptInvite(data.token, { name: data.name, password: data.password })

    res.cookie('token', result.token, COOKIE_OPTIONS)

    createAuditLog({
      userId: result.user.id,
      action: 'auth.accept_invite',
      resource: 'auth',
      resourceId: result.user.id,
      details: { name: data.name, email: result.user.email },
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.get('user-agent'),
    })

    res.json({ success: true, data: { user: result.user } })
  } catch (err) {
    next(err)
  }
})

// POST /api/auth/login
router.post('/login', authLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      email: z.string().email('Invalid email address'),
      password: z.string().min(1, 'Password is required'),
    })

    const { email, password } = schema.parse(req.body)
    const result = await login(email, password)

    res.cookie('token', result.token, COOKIE_OPTIONS)

    createAuditLog({
      userId: result.user.id,
      action: 'auth.login',
      resource: 'auth',
      resourceId: result.user.id,
      details: { email },
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.get('user-agent'),
    })

    res.json({
      success: true,
      data: { user: result.user },
    })
  } catch (err) {
    // Log failed login attempt
    const attemptEmail = req.body?.email
    if (attemptEmail) {
      createAuditLog({
        action: 'auth.login_failed',
        resource: 'auth',
        details: { email: attemptEmail },
        ip: req.ip || req.socket.remoteAddress,
        userAgent: req.get('user-agent'),
      })
    }
    next(err)
  }
})

// POST /api/auth/logout
router.post('/logout', authenticate, (req: Request, res: Response) => {
  createAuditLog({
    userId: req.user!.userId,
    action: 'auth.logout',
    resource: 'auth',
    resourceId: req.user!.userId,
    ip: req.ip || req.socket.remoteAddress,
    userAgent: req.get('user-agent'),
  })

  res.clearCookie('token', { path: '/' })
  res.json({ success: true, message: 'Logged out successfully' })
})

// GET /api/auth/me
router.get('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await getCurrentUser(req.user!.userId)
    res.json({ success: true, data: user })
  } catch (err) {
    next(err)
  }
})

// POST /api/auth/change-password
router.post('/change-password', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      currentPassword: z.string().min(1, 'Current password is required'),
      newPassword: z.string().min(8, 'New password must be at least 8 characters'),
    })

    const { currentPassword, newPassword } = schema.parse(req.body)
    await changePassword(req.user!.userId, currentPassword, newPassword)

    createAuditLog({
      userId: req.user!.userId,
      action: 'auth.change_password',
      resource: 'auth',
      resourceId: req.user!.userId,
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.get('user-agent'),
    })

    // Invalidate session by clearing cookie
    res.clearCookie('token', { path: '/' })

    res.json({
      success: true,
      message: 'Password changed successfully. Please login again.',
    })
  } catch (err) {
    next(err)
  }
})

export default router
