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
 * GET /api/analytics/overview
 * Returns p50/p95/p99 latency, total requests, error rate, avg response time.
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
 * GET /api/analytics/latency-trend
 * Time-series of p50/p95/p99 grouped by hour or day.
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
 * GET /api/analytics/error-trend
 * Time-series of error count vs total, grouped by hour.
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
 * GET /api/analytics/heatmap
 * 7x24 matrix (day-of-week x hour-of-day) of request counts.
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
 * GET /api/analytics/slowest
 * Top routes by avg response time.
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
 * GET /api/analytics/status-distribution
 * Count per status code bucket (2xx, 3xx, 4xx, 5xx).
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
