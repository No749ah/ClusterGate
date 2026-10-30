import { Router } from 'express'
import type { Request } from 'express'
import { z } from 'zod'
import { Role } from '@prisma/client'
import { authenticate, authorize } from '../middleware/authenticate'
import { getUserOrgIds, isOrgMember, canManageOrgRoutes } from '../services/orgAccessService'
import { createAuditLog } from '../services/auditService'
import { prisma } from '../lib/prisma'
import { AppError } from '../lib/errors'
import { BUILTIN_PATH_TEMPLATES } from '../lib/pathTemplates'
import { normalizePathPattern, validatePathPattern, PATH_ALLOWLIST_MAX_ENTRIES } from '../lib/pathAllowlist'

const router = Router()

/**
 * @openapi
 * /api/path-templates:
 *   get:
 *     tags: [Routes]
 *     summary: List path allowlist templates (built-in + the caller's custom ones)
 *     responses: { 200: { description: "Templates; built-ins have builtin: true and a builtin:* id" } }
 *   post:
 *     tags: [Routes]
 *     summary: Create a custom template (admin/operator; non-admins need OWNER/ADMIN in the organization)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, paths]
 *             properties:
 *               name: { type: string }
 *               description: { type: string }
 *               paths: { type: array, items: { type: string } }
 *               organizationId: { type: string, nullable: true }
 *     responses: { 201: { description: Template created } }
 * /api/path-templates/{id}:
 *   put:
 *     tags: [Routes]
 *     summary: Update a custom template
 *     responses: { 200: { description: Updated } }
 *   delete:
 *     tags: [Routes]
 *     summary: Delete a custom template
 *     responses: { 200: { description: Deleted } }
 */

const pathsSchema = z
  .array(
    z.string().trim().min(1).superRefine((v, ctx) => {
      const err = validatePathPattern(v)
      if (err) ctx.addIssue({ code: 'custom', message: `${v}: ${err}` })
    }).transform(normalizePathPattern)
  )
  .min(1)
  .max(PATH_ALLOWLIST_MAX_ENTRIES)
  .transform((list) => Array.from(new Set(list)))

const templateSelect = {
  id: true, name: true, description: true, paths: true, organizationId: true, createdAt: true, updatedAt: true,
} as const

async function loadTemplate(id: string) {
  const tpl = await prisma.pathTemplate.findUnique({ where: { id }, select: templateSelect })
  if (!tpl) throw AppError.notFound('Template')
  return tpl
}

// Same tenancy model as folders: org templates belong to their organization,
// global ones (no organization) are readable by everyone but admin-managed.
// Denials are 404s so template existence isn't leaked across tenants.
async function assertTemplateManage(req: Request, tpl: { organizationId: string | null }) {
  if (req.user!.role === 'ADMIN') return
  if (!tpl.organizationId) throw AppError.forbidden('Only admins can change global templates')
  if (!(await isOrgMember(req.user!.userId, req.user!.role, tpl.organizationId))) throw AppError.notFound('Template')
  if (!(await canManageOrgRoutes(req.user!.userId, req.user!.role, tpl.organizationId))) {
    throw AppError.forbidden('You need Owner or Admin role in this organization to manage templates')
  }
}

router.get('/', authenticate, async (req, res, next) => {
  try {
    const orgIds = req.user!.role === 'ADMIN' ? undefined : await getUserOrgIds(req.user!.userId)
    const custom = await prisma.pathTemplate.findMany({
      where: orgIds ? { OR: [{ organizationId: null }, { organizationId: { in: orgIds } }] } : {},
      select: templateSelect,
      orderBy: { name: 'asc' },
    })
    res.json({
      success: true,
      data: [
        ...BUILTIN_PATH_TEMPLATES.map((t) => ({ ...t, builtin: true, organizationId: null })),
        ...custom.map((t) => ({ ...t, builtin: false })),
      ],
    })
  } catch (err) {
    next(err)
  }
})

router.post('/', authenticate, authorize([Role.ADMIN, Role.OPERATOR]), async (req, res, next) => {
  try {
    const data = z.object({
      name: z.string().trim().min(1).max(100),
      description: z.string().trim().max(500).optional(),
      paths: pathsSchema,
      organizationId: z.string().nullable().optional(),
    }).parse(req.body)

    if (req.user!.role !== 'ADMIN') {
      if (!data.organizationId) throw AppError.badRequest('Organization is required')
      if (!(await canManageOrgRoutes(req.user!.userId, req.user!.role, data.organizationId))) {
        throw AppError.forbidden('You need Owner or Admin role in this organization to create templates')
      }
    } else if (data.organizationId) {
      const org = await prisma.organization.findUnique({ where: { id: data.organizationId }, select: { id: true } })
      if (!org) throw AppError.notFound('Organization')
    }

    const tpl = await prisma.pathTemplate.create({
      data: {
        name: data.name,
        description: data.description || null,
        paths: data.paths,
        organizationId: data.organizationId ?? null,
        createdById: req.user!.userId,
      },
      select: templateSelect,
    })
    createAuditLog({
      userId: req.user!.userId, action: 'path_template.create', resource: 'path_template', resourceId: tpl.id,
      details: { name: tpl.name, organizationId: tpl.organizationId, paths: tpl.paths.length },
      ip: req.ip || req.socket.remoteAddress, userAgent: req.get('user-agent'),
    })
    res.status(201).json({ success: true, data: { ...tpl, builtin: false } })
  } catch (err) {
    next(err)
  }
})

router.put('/:id', authenticate, authorize([Role.ADMIN, Role.OPERATOR]), async (req, res, next) => {
  try {
    if (req.params.id.startsWith('builtin:')) throw AppError.badRequest('Built-in templates cannot be changed')
    const tpl = await loadTemplate(req.params.id)
    await assertTemplateManage(req, tpl)
    const data = z.object({
      name: z.string().trim().min(1).max(100).optional(),
      description: z.string().trim().max(500).nullable().optional(),
      paths: pathsSchema.optional(),
    }).parse(req.body)
    const updated = await prisma.pathTemplate.update({ where: { id: tpl.id }, data, select: templateSelect })
    createAuditLog({
      userId: req.user!.userId, action: 'path_template.update', resource: 'path_template', resourceId: tpl.id,
      details: { name: updated.name },
      ip: req.ip || req.socket.remoteAddress, userAgent: req.get('user-agent'),
    })
    res.json({ success: true, data: { ...updated, builtin: false } })
  } catch (err) {
    next(err)
  }
})

router.delete('/:id', authenticate, authorize([Role.ADMIN, Role.OPERATOR]), async (req, res, next) => {
  try {
    if (req.params.id.startsWith('builtin:')) throw AppError.badRequest('Built-in templates cannot be deleted')
    const tpl = await loadTemplate(req.params.id)
    await assertTemplateManage(req, tpl)
    await prisma.pathTemplate.delete({ where: { id: tpl.id } })
    createAuditLog({
      userId: req.user!.userId, action: 'path_template.delete', resource: 'path_template', resourceId: tpl.id,
      details: { name: tpl.name },
      ip: req.ip || req.socket.remoteAddress, userAgent: req.get('user-agent'),
    })
    res.json({ success: true, message: 'Template deleted' })
  } catch (err) {
    next(err)
  }
})

export default router
