import { Router } from 'express'
import { authenticate } from '../middleware/authenticate'
import { authorize } from '../middleware/authenticate'
import { checkForUpdates, pullAndRestart } from '../services/updateService'

const router = Router()

// All system routes require admin
router.use(authenticate)
router.use(authorize(['ADMIN']))

/**
 * GET /api/system/version
 * Returns the current running version.
 */
router.get('/version', (_req, res) => {
  res.json({
    success: true,
    data: {
      version: process.env.npm_package_version || '1.0.0',
    },
  })
})

/**
 * GET /api/system/update-check
 * Check GHCR for newer images.
 */
router.get('/update-check', async (_req, res, next) => {
  try {
    const result = await checkForUpdates()
    res.json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
})

/**
 * POST /api/system/update
 * Pull latest images via Docker socket.
 */
router.post('/update', async (_req, res, next) => {
  try {
    const result = await pullAndRestart()
    res.json({
      success: result.success,
      data: result,
    })
  } catch (err) {
    next(err)
  }
})

export default router
