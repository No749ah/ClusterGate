import { Router } from 'express'
import { z } from 'zod'
import { Role } from '@prisma/client'
import { authenticate, authorize } from '../middleware/authenticate'
import { attachRouteParamResolver } from '../middleware/resolveRouteParam'
import { requireRouteManage } from '../middleware/routeAccess'
import * as routeGroupService from '../services/routeGroupService'
import { getUserOrgIds, isOrgMember, canManageOrgRoutes } from '../services/orgAccessService'
import { prisma } from '../lib/prisma'
import { AppError } from '../lib/errors'
import type { Request } from 'express'

const router = Router()

// Route groups are tenant-scoped through their team's organization. Groups
// carry change-request bypass/approver policies and config defaults, so
// touching one is a management action on that org; groups without a team are
// admin-only. Denials are 404s so group existence isn't leaked.
async function assertGroupAccess(req: Request, groupId: string, manage: boolean) {
  if (req.user!.role === 'ADMIN') return
  const group = await prisma.routeGroup.findUnique({
    where: { id: groupId },
    select: { team: { select: { organizationId: true } } },
  })
  const orgId = group?.team?.organizationId
  if (!orgId) throw AppError.notFound('Route group')
  const ok = manage
    ? await canManageOrgRoutes(req.user!.userId, req.user!.role, orgId)
    : await isOrgMember(req.user!.userId, req.user!.role, orgId)
  if (!ok) throw AppError.notFound('Route group')
}

// A team assigned to a group must belong to an org the caller manages
async function assertTeamManageable(req: Request, teamId: string | null | undefined) {
  if (req.user!.role === 'ADMIN') return
  if (!teamId) throw AppError.forbidden('A team is required so the group belongs to an organization')
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { organizationId: true } })
  if (!team || !(await canManageOrgRoutes(req.user!.userId, req.user!.role, team.organizationId))) {
    throw AppError.notFound('Team')
  }
}
attachRouteParamResolver(router, 'routeId')

// Accept either a cuid id or a URL slug as :id on every handler below.
import { looksLikeCuid } from '../lib/slug'
router.param('id', async (req, _res, next, value) => {
  try {
    if (typeof value === 'string' && value && !looksLikeCuid(value)) {
      const real = await routeGroupService.resolveGroupId(value)
      if (real) req.params.id = real
    }
  } catch { /* fall through */ }
  next()
})

/**
 * @openapi
 * /api/route-groups:
 *   get:
 *     tags: [Route Groups]
 *     summary: List route groups
 *     responses: { 200: { description: List of route groups } }
 *   post:
 *     tags: [Route Groups]
 *     summary: Create a route group (admin/operator)
 *     responses: { 201: { description: Created } }
 * /api/route-groups/{id}:
 *   get:
 *     tags: [Route Groups]
 *     summary: Get a route group
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses: { 200: { description: Route group } }
 *   put:
 *     tags: [Route Groups]
 *     summary: Update a route group (admin/operator)
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses: { 200: { description: Updated } }
 *   delete:
 *     tags: [Route Groups]
 *     summary: Delete a route group (admin)
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses: { 200: { description: Deleted } }
 * /api/route-groups/{id}/routes/{routeId}:
 *   post:
 *     tags: [Route Groups]
 *     summary: Assign a route to a group (admin/operator)
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *       - { in: path, name: routeId, required: true, schema: { type: string } }
 *     responses: { 200: { description: Assigned } }
 *   delete:
 *     tags: [Route Groups]
 *     summary: Remove a route from a group (admin/operator)
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *       - { in: path, name: routeId, required: true, schema: { type: string } }
 *     responses: { 200: { description: Removed } }
 */

const routeGroupSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  pathPrefix: z.string().min(3).startsWith('/r/'),
  teamId: z.string().optional(),
  defaultTimeout: z.number().int().min(1000).max(120000).optional(),
  defaultRetryCount: z.number().int().min(0).max(5).optional(),
  defaultRateLimitEnabled: z.boolean().optional(),
  defaultRateLimitMax: z.number().int().min(1).optional(),
  defaultRateLimitWindow: z.number().int().min(1000).optional(),
  defaultAuthType: z.enum(['NONE', 'API_KEY', 'BASIC', 'BEARER']).optional(),
  defaultAuthValue: z.string().optional(),
  defaultAddHeaders: z.record(z.string()).optional(),
  defaultRemoveHeaders: z.array(z.string()).optional(),
  defaultCorsEnabled: z.boolean().optional(),
  defaultCorsOrigins: z.array(z.string()).optional(),
  defaultIpAllowlist: z.array(z.string()).optional(),
  // Change request policy
  changeRequestsEnabled: z.boolean().nullable().optional(),
  crBypassRoles: z.array(z.enum(['OWNER', 'ADMIN', 'MEMBER'])).optional(),
  crApproverRoles: z.array(z.enum(['OWNER', 'ADMIN', 'MEMBER'])).optional(),
})

// List route groups
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { teamId, search } = req.query
    const groups = await routeGroupService.getRouteGroups({
      teamId: teamId as string,
      search: search as string,
      organizationIds: req.user!.role === 'ADMIN' ? undefined : await getUserOrgIds(req.user!.userId),
    })
    res.json({ success: true, data: groups })
  } catch (err) {
    next(err)
  }
})

// Get route group by ID
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    await assertGroupAccess(req, req.params.id, false)
    const group = await routeGroupService.getRouteGroupById(req.params.id)
    res.json({ success: true, data: group })
  } catch (err) {
    next(err)
  }
})

// Create route group
router.post('/', authenticate, authorize([Role.ADMIN, Role.OPERATOR]), async (req, res, next) => {
  try {
    const data = routeGroupSchema.parse(req.body)
    await assertTeamManageable(req, data.teamId)
    const group = await routeGroupService.createRouteGroup(data)
    res.status(201).json({ success: true, data: group })
  } catch (err) {
    next(err)
  }
})

// Update route group
router.put('/:id', authenticate, authorize([Role.ADMIN, Role.OPERATOR]), async (req, res, next) => {
  try {
    await assertGroupAccess(req, req.params.id, true)
    const data = routeGroupSchema.partial().parse(req.body)
    // Re-homing a group to another team must not escape the caller's orgs
    if (data.teamId !== undefined) await assertTeamManageable(req, data.teamId)
    const group = await routeGroupService.updateRouteGroup(req.params.id, data as any)
    res.json({ success: true, data: group })
  } catch (err) {
    next(err)
  }
})

// Delete route group
router.delete('/:id', authenticate, authorize([Role.ADMIN]), async (req, res, next) => {
  try {
    await routeGroupService.deleteRouteGroup(req.params.id)
    res.json({ success: true, message: 'Route group deleted' })
  } catch (err) {
    next(err)
  }
})

// Assign route to group — needs manage rights on both the route and the group
router.post('/:id/routes/:routeId', authenticate, authorize([Role.ADMIN, Role.OPERATOR]), requireRouteManage('routeId'), async (req, res, next) => {
  try {
    await assertGroupAccess(req, req.params.id, true)
    const route = await routeGroupService.assignRouteToGroup(req.params.routeId, req.params.id)
    res.json({ success: true, data: route })
  } catch (err) {
    next(err)
  }
})

// Remove route from group
router.delete('/:id/routes/:routeId', authenticate, authorize([Role.ADMIN, Role.OPERATOR]), requireRouteManage('routeId'), async (req, res, next) => {
  try {
    await assertGroupAccess(req, req.params.id, true)
    const route = await routeGroupService.assignRouteToGroup(req.params.routeId, null)
    res.json({ success: true, data: route })
  } catch (err) {
    next(err)
  }
})

export default router
