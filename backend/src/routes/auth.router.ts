import { Router, Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { login, getCurrentUser, changePassword } from '../services/authService'
import { authenticate } from '../middleware/authenticate'
import { authLimiter } from '../middleware/rateLimiter'
import { config } from '../config'

const router = Router()

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: config.isProd,
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/',
}

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

    res.json({
      success: true,
      data: { user: result.user },
    })
  } catch (err) {
    next(err)
  }
})

// POST /api/auth/logout
router.post('/logout', authenticate, (req: Request, res: Response) => {
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
