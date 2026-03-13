import { Router } from 'express'
import { authenticate } from '../middleware/authenticate'
import { achievementService } from '../services/achievementService'

const router = Router()

// Get current user's achievements
router.get('/', authenticate, async (req, res, next) => {
  try {
    const achievements = await achievementService.getUserAchievements(req.user!.userId)
    res.json({ success: true, data: achievements })
  } catch (err) {
    next(err)
  }
})

// Get unlocked count for current user
router.get('/count', authenticate, async (req, res, next) => {
  try {
    const count = await achievementService.getUnlockedCount(req.user!.userId)
    const total = achievementService.totalCount
    res.json({ success: true, data: { count, total } })
  } catch (err) {
    next(err)
  }
})

export default router
