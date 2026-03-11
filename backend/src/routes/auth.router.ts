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

/**
 * @openapi
 * /api/auth/setup-status:
 *   get:
 *     tags: [Auth]
 *     summary: Check setup status
 *     description: Returns whether the initial admin setup has been completed. Public endpoint.
 *     security: []
 *     responses:
 *       200:
 *         description: Setup status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     isSetupComplete:
 *                       type: boolean
 */
router.get('/setup-status', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const setupDone = await isSetupComplete()
    res.json({ success: true, data: { isSetupComplete: setupDone } })
  } catch (err) {
    next(err)
  }
})

/**
 * @openapi
 * /api/auth/setup:
 *   post:
 *     tags: [Auth]
 *     summary: Initial admin setup
 *     description: Creates the first admin account. Only works when zero users exist in the database.
 *     security: []
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
 *     responses:
 *       200:
 *         description: Admin account created, session cookie set
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
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *       400:
 *         description: Validation error or setup already completed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
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

/**
 * @openapi
 * /api/auth/invite/{token}:
 *   get:
 *     tags: [Auth]
 *     summary: Validate invite token
 *     description: Validates an invitation token and returns invite details. Public endpoint.
 *     security: []
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Invitation token
 *     responses:
 *       200:
 *         description: Invite details
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
 *                     email:
 *                       type: string
 *                     role:
 *                       type: string
 *       404:
 *         description: Invalid or expired token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/invite/:token', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invite = await validateInvite(req.params.token)
    res.json({ success: true, data: invite })
  } catch (err) {
    next(err)
  }
})

/**
 * @openapi
 * /api/auth/accept-invite:
 *   post:
 *     tags: [Auth]
 *     summary: Accept invitation
 *     description: Accepts an invitation and creates a new user account. Public endpoint.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, name, password]
 *             properties:
 *               token:
 *                 type: string
 *               name:
 *                 type: string
 *                 minLength: 1
 *               password:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Account created, session cookie set
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
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *       400:
 *         description: Validation error
 *       404:
 *         description: Invalid or expired invitation token
 */
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

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login
 *     description: Authenticates a user with email and password. If 2FA is enabled, returns a temporary token for the 2FA verification step instead of a session cookie.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful or 2FA required
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
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *                     requiresTwoFactor:
 *                       type: boolean
 *                       description: Present and true when 2FA verification is needed
 *                     tempToken:
 *                       type: string
 *                       description: Short-lived token for 2FA verification step
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
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

/**
 * @openapi
 * /api/auth/2fa/verify:
 *   post:
 *     tags: [Auth]
 *     summary: Verify 2FA code during login
 *     description: Completes the login flow by verifying a TOTP code. Requires the temporary token received from the login endpoint.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tempToken, code]
 *             properties:
 *               tempToken:
 *                 type: string
 *                 description: Temporary token from login response
 *               code:
 *                 type: string
 *                 description: TOTP verification code
 *     responses:
 *       200:
 *         description: 2FA verified, session cookie set
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
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *       401:
 *         description: Invalid or expired token/code
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
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

/**
 * @openapi
 * /api/auth/2fa/setup:
 *   post:
 *     tags: [Auth]
 *     summary: Initiate 2FA setup
 *     description: Generates a TOTP secret and QR code URI for setting up two-factor authentication.
 *     responses:
 *       200:
 *         description: 2FA setup data
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
 *                     uri:
 *                       type: string
 *                       description: otpauth:// URI for QR code
 *                     secret:
 *                       type: string
 *                       description: Base32-encoded secret
 *       401:
 *         description: Not authenticated
 */
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

/**
 * @openapi
 * /api/auth/2fa/enable:
 *   post:
 *     tags: [Auth]
 *     summary: Enable 2FA
 *     description: Verifies a TOTP token and enables two-factor authentication. Returns recovery codes.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token:
 *                 type: string
 *                 minLength: 6
 *                 description: TOTP verification code
 *     responses:
 *       200:
 *         description: 2FA enabled, recovery codes returned
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
 *                     recoveryCodes:
 *                       type: array
 *                       items:
 *                         type: string
 *       401:
 *         description: Not authenticated or invalid code
 */
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

/**
 * @openapi
 * /api/auth/2fa/disable:
 *   post:
 *     tags: [Auth]
 *     summary: Disable 2FA
 *     description: Disables two-factor authentication. Requires the user's password for confirmation.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password]
 *             properties:
 *               password:
 *                 type: string
 *                 description: Current account password for confirmation
 *     responses:
 *       200:
 *         description: 2FA disabled
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
 *         description: Not authenticated or incorrect password
 */
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

/**
 * @openapi
 * /api/auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Logout
 *     description: Clears the session cookie and logs the user out.
 *     responses:
 *       200:
 *         description: Logged out
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

/**
 * @openapi
 * /api/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get current user
 *     description: Returns the profile of the currently authenticated user.
 *     responses:
 *       200:
 *         description: Current user data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         description: Not authenticated
 */
router.get('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await getCurrentUser(req.user!.userId)
    res.json({ success: true, data: user })
  } catch (err) {
    next(err)
  }
})

/**
 * @openapi
 * /api/auth/change-password:
 *   post:
 *     tags: [Auth]
 *     summary: Change password
 *     description: Changes the current user's password. Clears the session cookie, requiring re-login.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Password changed, session cleared
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated or incorrect current password
 */
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
