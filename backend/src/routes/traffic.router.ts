import { Router } from 'express'
import { authenticate, authorize } from '../middleware/authenticate'
import { Role } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { getConfig, updateConfig, sanitizeText } from '../services/sanitizerService'
import { z } from 'zod'

const router = Router()

// ============================================================================
// Live Traffic SSE
// ============================================================================

router.get('/live', authenticate, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  // Send recent traffic every 2 seconds
  const interval = setInterval(async () => {
    try {
      const since = new Date(Date.now() - 3000) // last 3 seconds
      const logs = await prisma.requestLog.findMany({
        where: { createdAt: { gte: since } },
        select: {
          id: true,
          method: true,
          path: true,
          responseStatus: true,
          duration: true,
          geoCountry: true,
          geoCity: true,
          geoLatitude: true,
          geoLongitude: true,
          ip: true,
          createdAt: true,
          route: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      })

      if (logs.length > 0) {
        res.write(`data: ${JSON.stringify(logs)}\n\n`)
      }
    } catch {
      // Client disconnected
    }
  }, 2000)

  // Send heartbeat every 15s
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n')
  }, 15000)

  req.on('close', () => {
    clearInterval(interval)
    clearInterval(heartbeat)
  })
})

// ============================================================================
// Traffic Map Data (snapshot)
// ============================================================================

router.get('/map', authenticate, async (req, res, next) => {
  try {
    const hours = parseInt(String(req.query.hours)) || 24
    const since = new Date(Date.now() - hours * 60 * 60 * 1000)

    // Get traffic grouped by country with coordinates
    const traffic = await prisma.$queryRaw<
      { geoCountry: string; geoLatitude: number; geoLongitude: number; count: bigint; avgDuration: number }[]
    >`
      SELECT "geoCountry", AVG("geoLatitude") as "geoLatitude", AVG("geoLongitude") as "geoLongitude",
             COUNT(*) as count, AVG("duration") as "avgDuration"
      FROM "request_logs"
      WHERE "geoCountry" IS NOT NULL AND "createdAt" >= ${since}
      GROUP BY "geoCountry"
      ORDER BY count DESC
      LIMIT 100
    `

    // Get top cities
    const cities = await prisma.$queryRaw<
      { geoCity: string; geoCountry: string; geoLatitude: number; geoLongitude: number; count: bigint }[]
    >`
      SELECT "geoCity", "geoCountry", AVG("geoLatitude") as "geoLatitude", AVG("geoLongitude") as "geoLongitude",
             COUNT(*) as count
      FROM "request_logs"
      WHERE "geoCity" IS NOT NULL AND "geoCountry" IS NOT NULL AND "createdAt" >= ${since}
      GROUP BY "geoCity", "geoCountry"
      ORDER BY count DESC
      LIMIT 50
    `

    // Total requests in period
    const total = await prisma.requestLog.count({
      where: { createdAt: { gte: since } },
    })

    res.json({
      success: true,
      data: {
        countries: traffic.map((t) => ({
          country: t.geoCountry,
          lat: Number(t.geoLatitude),
          lng: Number(t.geoLongitude),
          count: Number(t.count),
          avgDuration: Math.round(Number(t.avgDuration)),
        })),
        cities: cities.map((c) => ({
          city: c.geoCity,
          country: c.geoCountry,
          lat: Number(c.geoLatitude),
          lng: Number(c.geoLongitude),
          count: Number(c.count),
        })),
        total,
        hours,
      },
    })
  } catch (err) {
    next(err)
  }
})

// ============================================================================
// Sanitizer Config
// ============================================================================

router.get('/sanitizer', authenticate, authorize([Role.ADMIN]), async (_req, res, next) => {
  try {
    const config = await getConfig()
    res.json({ success: true, data: config })
  } catch (err) {
    next(err)
  }
})

router.put('/sanitizer', authenticate, authorize([Role.ADMIN]), async (req, res, next) => {
  try {
    const data = z.object({
      enabled: z.boolean().optional(),
      maskEmails: z.boolean().optional(),
      maskCreditCards: z.boolean().optional(),
      maskSSNs: z.boolean().optional(),
      maskPhoneNumbers: z.boolean().optional(),
      maskIBANs: z.boolean().optional(),
      customPatterns: z.array(z.object({
        name: z.string(),
        pattern: z.string(),
        replacement: z.string(),
      })).optional(),
    }).parse(req.body)

    const config = await updateConfig(data)
    res.json({ success: true, data: config })
  } catch (err) {
    next(err)
  }
})

// Test sanitizer — preview what masking looks like on sample text
router.post('/sanitizer/test', authenticate, authorize([Role.ADMIN]), async (req, res, next) => {
  try {
    const { text } = z.object({ text: z.string().max(10000) }).parse(req.body)
    const sanitized = sanitizeText(text)
    res.json({ success: true, data: { original: text, sanitized: sanitized ?? text } })
  } catch (err) {
    next(err)
  }
})

export default router
