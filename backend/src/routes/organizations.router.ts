import { Router } from 'express'
import { z } from 'zod'
import { Role } from '@prisma/client'
import { authenticate, authorize } from '../middleware/authenticate'
import * as orgService from '../services/organizationService'
import { achievementService } from '../services/achievementService'

const router = Router()

const orgSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  description: z.string().max(500).optional(),
})

// ============================================================================
// Organizations
// ============================================================================

// List organizations
router.get('/', authenticate, async (req, res, next) => {
  try {
    const orgs = req.user?.role === 'ADMIN'
      ? await orgService.getOrganizations()
      : await orgService.getOrganizations(req.user!.userId)
    res.json({ success: true, data: orgs })
  } catch (err) {
    next(err)
  }
})

// Get organization by ID
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const org = await orgService.getOrganizationById(req.params.id)
    res.json({ success: true, data: org })
  } catch (err) {
    next(err)
  }
})

// Create organization
router.post('/', authenticate, authorize([Role.ADMIN]), async (req, res, next) => {
  try {
    const data = orgSchema.parse(req.body)
    const org = await orgService.createOrganization(data, req.user!.userId)
    res.status(201).json({ success: true, data: org })
  } catch (err) {
    next(err)
  }
})

// Update organization
router.put('/:id', authenticate, authorize([Role.ADMIN]), async (req, res, next) => {
  try {
    const data = orgSchema.partial().extend({
      changeRequestsEnabled: z.boolean().optional(),
      crBypassRoles: z.array(z.enum(['OWNER', 'ADMIN', 'MEMBER'])).optional(),
      crApproverRoles: z.array(z.enum(['OWNER', 'ADMIN', 'MEMBER'])).optional(),
    }).parse(req.body)
    const org = await orgService.updateOrganization(req.params.id, data as any)
    res.json({ success: true, data: org })
  } catch (err) {
    next(err)
  }
})

// Delete organization
router.delete('/:id', authenticate, authorize([Role.ADMIN]), async (req, res, next) => {
  try {
    await orgService.deleteOrganization(req.params.id)
    res.json({ success: true, message: 'Organization deleted' })
  } catch (err) {
    next(err)
  }
})

// ============================================================================
// Organization Members
// ============================================================================

// Add member
router.post('/:id/members', authenticate, authorize([Role.ADMIN, Role.OPERATOR]), async (req, res, next) => {
  try {
    const { userId, role } = z.object({
      userId: z.string(),
      role: z.enum(['OWNER', 'ADMIN', 'MEMBER']).default('MEMBER'),
    }).parse(req.body)

    // Only existing org OWNERs can assign the OWNER role
    if (role === 'OWNER') {
      const requesterMembership = await orgService.getOrgMembership(req.params.id, req.user!.userId)
      if (!requesterMembership || requesterMembership.role !== 'OWNER') {
        return res.status(403).json({
          success: false,
          error: { message: 'Only organization owners can assign the OWNER role' },
        })
      }
    }

    const member = await orgService.addOrgMember(req.params.id, userId, role)

    // Achievement: Team Player (join an organization)
    achievementService.checkTeamPlayer(userId).catch(() => {})

    res.status(201).json({ success: true, data: member })
  } catch (err) {
    next(err)
  }
})

// Update member role
router.put('/:id/members/:userId', authenticate, authorize([Role.ADMIN, Role.OPERATOR]), async (req, res, next) => {
  try {
    const { role } = z.object({
      role: z.enum(['OWNER', 'ADMIN', 'MEMBER']),
    }).parse(req.body)

    // Only existing org OWNERs can assign the OWNER role
    if (role === 'OWNER') {
      const requesterMembership = await orgService.getOrgMembership(req.params.id, req.user!.userId)
      if (!requesterMembership || requesterMembership.role !== 'OWNER') {
        return res.status(403).json({
          success: false,
          error: { message: 'Only organization owners can assign the OWNER role' },
        })
      }
    }

    const member = await orgService.updateOrgMemberRole(req.params.id, req.params.userId, role)
    res.json({ success: true, data: member })
  } catch (err) {
    next(err)
  }
})

// Remove member
router.delete('/:id/members/:userId', authenticate, authorize([Role.ADMIN]), async (req, res, next) => {
  try {
    await orgService.removeOrgMember(req.params.id, req.params.userId)
    res.json({ success: true, message: 'Member removed' })
  } catch (err) {
    next(err)
  }
})

// ============================================================================
// Teams
// ============================================================================

// List teams for organization
router.get('/:id/teams', authenticate, async (req, res, next) => {
  try {
    const teams = await orgService.getTeams(req.params.id)
    res.json({ success: true, data: teams })
  } catch (err) {
    next(err)
  }
})

// Get team by ID
router.get('/:orgId/teams/:teamId', authenticate, async (req, res, next) => {
  try {
    const team = await orgService.getTeamById(req.params.teamId)
    res.json({ success: true, data: team })
  } catch (err) {
    next(err)
  }
})

// Create team
router.post('/:id/teams', authenticate, authorize([Role.ADMIN]), async (req, res, next) => {
  try {
    const data = z.object({
      name: z.string().min(1).max(100),
      description: z.string().max(500).optional(),
    }).parse(req.body)
    const team = await orgService.createTeam(req.params.id, data)
    res.status(201).json({ success: true, data: team })
  } catch (err) {
    next(err)
  }
})

// Update team
router.put('/:orgId/teams/:teamId', authenticate, authorize([Role.ADMIN]), async (req, res, next) => {
  try {
    const data = z.object({
      name: z.string().min(1).max(100).optional(),
      description: z.string().max(500).optional().nullable(),
    }).parse(req.body)
    const team = await orgService.updateTeam(req.params.teamId, data as any)
    res.json({ success: true, data: team })
  } catch (err) {
    next(err)
  }
})

// Delete team
router.delete('/:orgId/teams/:teamId', authenticate, authorize([Role.ADMIN]), async (req, res, next) => {
  try {
    await orgService.deleteTeam(req.params.teamId)
    res.json({ success: true, message: 'Team deleted' })
  } catch (err) {
    next(err)
  }
})

// Add team member
router.post('/:orgId/teams/:teamId/members', authenticate, authorize([Role.ADMIN]), async (req, res, next) => {
  try {
    const { userId } = z.object({ userId: z.string() }).parse(req.body)
    const member = await orgService.addTeamMember(req.params.teamId, userId)
    res.status(201).json({ success: true, data: member })
  } catch (err) {
    next(err)
  }
})

// Remove team member
router.delete('/:orgId/teams/:teamId/members/:userId', authenticate, authorize([Role.ADMIN]), async (req, res, next) => {
  try {
    await orgService.removeTeamMember(req.params.teamId, req.params.userId)
    res.json({ success: true, message: 'Team member removed' })
  } catch (err) {
    next(err)
  }
})

export default router
