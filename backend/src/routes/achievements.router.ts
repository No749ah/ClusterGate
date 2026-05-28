import { Router } from 'express'
import { authenticate } from '../middleware/authenticate'
import { achievementService } from '../services/achievementService'

const router = Router()

/**
 * @openapi
 * /api/achievements:
 *   get:
 *     tags: [Achievements]
 *     summary: List achievements with unlock status
 *     responses: { 200: { description: List of achievements } }
 * /api/achievements/count:
 *   get:
 *     tags: [Achievements]
 *     summary: Total and unlocked achievement counts
 *     responses: { 200: { description: Counts } }
 * /api/achievements/party:
 *   post:
 *     tags: [Achievements]
 *     summary: Trigger the party-mode achievement
 *     responses: { 200: { description: Triggered } }
 */

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

// Trigger party mode achievement
router.post('/party', authenticate, async (req, res, next) => {
  try {
    const result = await achievementService.checkPartyMode(req.user!.userId)
    res.json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
})

export default router
