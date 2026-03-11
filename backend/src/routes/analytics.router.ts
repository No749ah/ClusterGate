import { Router } from 'express'
import { authenticate } from '../middleware/authenticate'
import {
  getOverview,
  getLatencyTrend,
  getErrorRateTrend,
  getTrafficHeatmap,
  getSlowestRoutes,
  getStatusDistribution,
} from '../services/analyticsService'

const router = Router()

// All analytics routes require authentication
router.use(authenticate)

/**
 * @openapi
 * /api/analytics/overview:
 *   get:
 *     tags: [Analytics]
 *     summary: Analytics overview
 *     description: Returns p50/p95/p99 latency, total requests, error rate, and average response time.
 *     parameters:
 *       - in: query
 *         name: routeId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by route ID
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 7
 *     responses:
 *       200:
 *         description: Analytics overview data
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
 *                     totalRequests:
 *                       type: integer
 *                     errorRate:
 *                       type: number
 *                     avgResponseTime:
 *                       type: number
 *                     p50:
 *                       type: number
 *                     p95:
 *                       type: number
 *                     p99:
 *                       type: number
 *       401:
 *         description: Not authenticated
 */
router.get('/overview', async (req, res, next) => {
  try {
    const routeId = req.query.routeId as string | undefined
    const days = req.query.days ? parseInt(req.query.days as string, 10) : 7
    const data = await getOverview(routeId, days)
    res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
})

/**
 * @openapi
 * /api/analytics/latency-trend:
 *   get:
 *     tags: [Analytics]
 *     summary: Latency trend
 *     description: Time-series of p50/p95/p99 latency grouped by hour or day.
 *     parameters:
 *       - in: query
 *         name: routeId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 7
 *       - in: query
 *         name: granularity
 *         schema:
 *           type: string
 *           enum: [hour, day]
 *           default: hour
 *     responses:
 *       200:
 *         description: Latency trend data
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
 *                       time:
 *                         type: string
 *                         format: date-time
 *                       p50:
 *                         type: number
 *                       p95:
 *                         type: number
 *                       p99:
 *                         type: number
 */
router.get('/latency-trend', async (req, res, next) => {
  try {
    const routeId = req.query.routeId as string | undefined
    const days = req.query.days ? parseInt(req.query.days as string, 10) : 7
    const granularity = (req.query.granularity as 'hour' | 'day') || 'hour'
    const data = await getLatencyTrend(routeId, days, granularity)
    res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
})

/**
 * @openapi
 * /api/analytics/error-trend:
 *   get:
 *     tags: [Analytics]
 *     summary: Error rate trend
 *     description: Time-series of error count vs total requests, grouped by hour.
 *     parameters:
 *       - in: query
 *         name: routeId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 7
 *     responses:
 *       200:
 *         description: Error trend data
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
 *                       time:
 *                         type: string
 *                         format: date-time
 *                       total:
 *                         type: integer
 *                       errors:
 *                         type: integer
 */
router.get('/error-trend', async (req, res, next) => {
  try {
    const routeId = req.query.routeId as string | undefined
    const days = req.query.days ? parseInt(req.query.days as string, 10) : 7
    const data = await getErrorRateTrend(routeId, days)
    res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
})

/**
 * @openapi
 * /api/analytics/heatmap:
 *   get:
 *     tags: [Analytics]
 *     summary: Traffic heatmap
 *     description: Returns a 7x24 matrix (day-of-week x hour-of-day) of request counts for heatmap visualization.
 *     parameters:
 *       - in: query
 *         name: routeId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 28
 *     responses:
 *       200:
 *         description: Heatmap data
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
 *                       dayOfWeek:
 *                         type: integer
 *                       hour:
 *                         type: integer
 *                       count:
 *                         type: integer
 */
router.get('/heatmap', async (req, res, next) => {
  try {
    const routeId = req.query.routeId as string | undefined
    const days = req.query.days ? parseInt(req.query.days as string, 10) : 28
    const data = await getTrafficHeatmap(routeId, days)
    res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
})

/**
 * @openapi
 * /api/analytics/slowest:
 *   get:
 *     tags: [Analytics]
 *     summary: Slowest routes
 *     description: Returns the top routes ranked by average response time.
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Slowest routes list
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
 *                       routeId:
 *                         type: string
 *                       name:
 *                         type: string
 *                       avgResponseTime:
 *                         type: number
 *                       requestCount:
 *                         type: integer
 */
router.get('/slowest', async (req, res, next) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10
    const data = await getSlowestRoutes(limit)
    res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
})

/**
 * @openapi
 * /api/analytics/status-distribution:
 *   get:
 *     tags: [Analytics]
 *     summary: Status code distribution
 *     description: Returns counts grouped by HTTP status code bucket (2xx, 3xx, 4xx, 5xx).
 *     parameters:
 *       - in: query
 *         name: routeId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 7
 *     responses:
 *       200:
 *         description: Status distribution data
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
 *                       bucket:
 *                         type: string
 *                         description: e.g., "2xx", "4xx"
 *                       count:
 *                         type: integer
 */
router.get('/status-distribution', async (req, res, next) => {
  try {
    const routeId = req.query.routeId as string | undefined
    const days = req.query.days ? parseInt(req.query.days as string, 10) : 7
    const data = await getStatusDistribution(routeId, days)
    res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
})

export default router
