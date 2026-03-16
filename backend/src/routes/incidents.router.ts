import { Router } from 'express'
import { z } from 'zod'
import { Role } from '@prisma/client'
import { authenticate, authorize } from '../middleware/authenticate'
import { incidentService } from '../services/incidentService'
import { achievementService } from '../services/achievementService'

const router = Router()

/**
 * @openapi
 * /api/incidents:
 *   get:
 *     tags: [Incidents]
 *     summary: List incidents
 *     description: Returns a paginated list of incidents, optionally filtered by status or route.
 *     parameters:
 *       - name: status
 *         in: query
 *         schema:
 *           type: string
 *           enum: [ACTIVE, INVESTIGATING, RESOLVED, DISMISSED]
 *       - name: routeId
 *         in: query
 *         schema:
 *           type: string
 *       - name: page
 *         in: query
 *         schema:
 *           type: integer
 *           default: 1
 *       - name: pageSize
 *         in: query
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Paginated list of incidents
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { status, routeId, page = '1', pageSize = '20' } = req.query
    const result = await incidentService.list({
      status: status as any,
      routeId: routeId as string,
      page: parseInt(String(page)) || 1,
      pageSize: Math.min(parseInt(String(pageSize)) || 20, 100),
    })
    res.json({ success: true, ...result })
  } catch (err) {
    next(err)
  }
})

/**
 * @openapi
 * /api/incidents/{id}:
 *   get:
 *     tags: [Incidents]
 *     summary: Get incident by ID
 *     description: Returns a single incident with its timeline events.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Incident with events
 *       404:
 *         description: Incident not found
 */
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const incident = await incidentService.getById(req.params.id)
    if (!incident) {
      return res.status(404).json({ success: false, error: { message: 'Incident not found' } })
    }
    res.json({ success: true, data: incident })
  } catch (err) {
    next(err)
  }
})

/**
 * @openapi
 * /api/incidents:
 *   post:
 *     tags: [Incidents]
 *     summary: Create incident
 *     description: Manually create a new incident. Requires ADMIN or OPERATOR role.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title]
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               severity:
 *                 type: string
 *                 enum: [LOW, MEDIUM, HIGH, CRITICAL]
 *                 default: MEDIUM
 *               routeId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Incident created
 */
router.post('/', authenticate, authorize([Role.ADMIN, Role.OPERATOR]), async (req, res, next) => {
  try {
    const data = z.object({
      title: z.string().min(1).max(200),
      description: z.string().max(2000).optional(),
      severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
      routeId: z.string().optional(),
    }).parse(req.body)

    const incident = await incidentService.create(data)
    res.status(201).json({ success: true, data: incident })
  } catch (err) {
    next(err)
  }
})

/**
 * @openapi
 * /api/incidents/{id}/status:
 *   patch:
 *     tags: [Incidents]
 *     summary: Update incident status
 *     description: Change the status of an incident. Requires ADMIN or OPERATOR role.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, INVESTIGATING, RESOLVED, DISMISSED]
 *     responses:
 *       200:
 *         description: Updated incident
 */
router.patch('/:id/status', authenticate, authorize([Role.ADMIN, Role.OPERATOR]), async (req, res, next) => {
  try {
    const { status } = z.object({
      status: z.enum(['ACTIVE', 'INVESTIGATING', 'RESOLVED', 'DISMISSED']),
    }).parse(req.body)

    const incident = await incidentService.updateStatus(req.params.id, status, req.user!.userId)

    // Achievement: first incident resolved
    if (status === 'RESOLVED') {
      achievementService.checkIncidentResolved(req.user!.userId).catch(() => {})
    }

    res.json({ success: true, data: incident })
  } catch (err) {
    next(err)
  }
})

/**
 * @openapi
 * /api/incidents/{id}/events:
 *   post:
 *     tags: [Incidents]
 *     summary: Add event to incident
 *     description: Add a timeline event (note, status change, etc.) to an incident. Requires ADMIN or OPERATOR role.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type, title]
 *             properties:
 *               type:
 *                 type: string
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               metadata:
 *                 type: object
 *     responses:
 *       201:
 *         description: Event created
 */
router.post('/:id/events', authenticate, authorize([Role.ADMIN, Role.OPERATOR]), async (req, res, next) => {
  try {
    const data = z.object({
      type: z.string().min(1).max(50),
      title: z.string().min(1).max(200),
      description: z.string().max(2000).optional(),
      metadata: z.record(z.any()).optional(),
    }).parse(req.body)

    const event = await incidentService.addEvent(req.params.id, {
      ...data,
      createdById: req.user!.userId,
    })
    res.status(201).json({ success: true, data: event })
  } catch (err) {
    next(err)
  }
})

/**
 * @openapi
 * /api/incidents/{id}/dismiss:
 *   patch:
 *     tags: [Incidents]
 *     summary: Dismiss incident
 *     description: Mark an incident as a false positive. Requires ADMIN or OPERATOR role.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Incident dismissed
 */
router.patch('/:id/dismiss', authenticate, authorize([Role.ADMIN, Role.OPERATOR]), async (req, res, next) => {
  try {
    const incident = await incidentService.updateStatus(req.params.id, 'DISMISSED' as any, req.user!.userId)
    res.json({ success: true, data: incident })
  } catch (err) {
    next(err)
  }
})

/**
 * @openapi
 * /api/incidents/{id}:
 *   delete:
 *     tags: [Incidents]
 *     summary: Delete incident
 *     description: Permanently delete an incident and all its events. Requires ADMIN role.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Incident deleted
 */
router.delete('/:id', authenticate, authorize([Role.ADMIN]), async (req, res, next) => {
  try {
    await incidentService.deleteIncident(req.params.id)
    res.json({ success: true, message: 'Incident deleted' })
  } catch (err) {
    next(err)
  }
})

export default router
