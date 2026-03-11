import { Router, Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { login, getCurrentUser, changePassword, isSetupComplete, setupInitialAdmin } from '../services/authService'
import { validateInvite, acceptInvite } from '../services/inviteService'
import { generateSetup, verifyAndEnable, verifyToken as verify2FAToken, disable as disable2FA } from '../services/twoFactorService'
import { authenticate } from '../middleware/authenticate'
import { authLimiter } from '../middleware/rateLimiter'
import { config } from '../config'
import { signToken, signShortLivedToken, verifyShortLivedToken } from '../lib/jwt'
import { createAuditLog } from '../services/auditService'
import { AppError } from '../lib/errors'
import { prisma } from '../lib/prisma'

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

    res.cookie('cg_session', result.token, COOKIE_OPTIONS)

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

    res.cookie('cg_session', result.token, COOKIE_OPTIONS)

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

    // Check if user has 2FA enabled
    if (result.user.twoFactorEnabled) {
      // Don't set session cookie — issue a short-lived temp token instead
      const tempToken = signShortLivedToken({ userId: result.user.id, purpose: '2fa' })

      createAuditLog({
        userId: result.user.id,
        action: 'auth.login_2fa_pending',
        resource: 'auth',
        resourceId: result.user.id,
        details: { email },
        ip: req.ip || req.socket.remoteAddress,
        userAgent: req.get('user-agent'),
      })

      res.json({
        success: true,
        data: { requiresTwoFactor: true, tempToken },
      })
      return
    }

    res.cookie('cg_session', result.token, COOKIE_OPTIONS)

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

// POST /api/auth/2fa/verify — verify 2FA code during login
router.post('/2fa/verify', authLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      tempToken: z.string().min(1, 'Temporary token is required'),
      code: z.string().min(1, 'Verification code is required'),
    })

    const { tempToken, code } = schema.parse(req.body)

    let payload
    try {
      payload = verifyShortLivedToken(tempToken, '2fa')
    } catch {
      throw AppError.unauthorized('Invalid or expired 2FA token')
    }

    const valid = await verify2FAToken(payload.userId, code)
    if (!valid) {
      createAuditLog({
        userId: payload.userId,
        action: 'auth.2fa_failed',
        resource: 'auth',
        resourceId: payload.userId,
        ip: req.ip || req.socket.remoteAddress,
        userAgent: req.get('user-agent'),
      })
      throw AppError.unauthorized('Invalid verification code')
    }

    // 2FA verified — issue real session
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        twoFactorEnabled: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    if (!user || !user.isActive) {
      throw AppError.unauthorized('Account not found or deactivated')
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    })

    const token = signToken({ userId: user.id, email: user.email, role: user.role })
    res.cookie('cg_session', token, COOKIE_OPTIONS)

    createAuditLog({
      userId: user.id,
      action: 'auth.login',
      resource: 'auth',
      resourceId: user.id,
      details: { email: user.email, twoFactor: true },
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.get('user-agent'),
    })

    res.json({
      success: true,
      data: { user },
    })
  } catch (err) {
    next(err)
  }
})

// POST /api/auth/2fa/setup — initiate 2FA setup (authenticated)
router.post('/2fa/setup', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await generateSetup(req.user!.userId)

    createAuditLog({
      userId: req.user!.userId,
      action: 'auth.2fa_setup',
      resource: 'auth',
      resourceId: req.user!.userId,
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.get('user-agent'),
    })

    res.json({
      success: true,
      data: { uri: result.uri, secret: result.secret },
    })
  } catch (err) {
    next(err)
  }
})

// POST /api/auth/2fa/enable — verify token and enable 2FA (authenticated)
router.post('/2fa/enable', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      token: z.string().min(6, 'Verification code must be at least 6 characters'),
    })

    const { token } = schema.parse(req.body)
    const recoveryCodes = await verifyAndEnable(req.user!.userId, token)

    createAuditLog({
      userId: req.user!.userId,
      action: 'auth.2fa_enabled',
      resource: 'auth',
      resourceId: req.user!.userId,
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.get('user-agent'),
    })

    res.json({
      success: true,
      data: { recoveryCodes },
    })
  } catch (err) {
    next(err)
  }
})

// POST /api/auth/2fa/disable — disable 2FA (authenticated, requires password)
router.post('/2fa/disable', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      password: z.string().min(1, 'Password is required'),
    })

    const { password } = schema.parse(req.body)
    await disable2FA(req.user!.userId, password)

    createAuditLog({
      userId: req.user!.userId,
      action: 'auth.2fa_disabled',
      resource: 'auth',
      resourceId: req.user!.userId,
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.get('user-agent'),
    })

    res.json({
      success: true,
      message: 'Two-factor authentication has been disabled.',
    })
  } catch (err) {
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

  res.clearCookie('cg_session', { path: '/' })
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
    res.clearCookie('cg_session', { path: '/' })

    res.json({
      success: true,
      message: 'Password changed successfully. Please login again.',
    })
  } catch (err) {
    next(err)
  }
})

export default router
