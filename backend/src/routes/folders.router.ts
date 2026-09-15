import { Router } from 'express'
import type { Request } from 'express'
import { z } from 'zod'
import { Role } from '@prisma/client'
import { authenticate, authorize } from '../middleware/authenticate'
import { attachRouteParamResolver } from '../middleware/resolveRouteParam'
import { requireRouteManage } from '../middleware/routeAccess'
import { getUserOrgIds, isOrgMember, canManageOrgRoutes, canManageRoute } from '../services/orgAccessService'
import { invalidateApiKeyCaches } from '../services/apiKeyService'
import { createAuditLog } from '../services/auditService'
import { prisma } from '../lib/prisma'
import { AppError } from '../lib/errors'

const router = Router()
attachRouteParamResolver(router, 'routeId')

/**
 * @openapi
 * /api/folders:
 *   get:
 *     tags: [Routes]
 *     summary: List route folders (scoped to the caller's organizations)
 *     responses: { 200: { description: Folders with route counts } }
 *   post:
 *     tags: [Routes]
 *     summary: Create a route folder (admin/operator; non-admins need OWNER/ADMIN in the organization)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *               organizationId: { type: string, nullable: true }
 *     responses: { 201: { description: Folder created } }
 * /api/folders/{id}:
 *   put:
 *     tags: [Routes]
 *     summary: Rename / reorder a folder
 *     responses: { 200: { description: Updated } }
 *   delete:
 *     tags: [Routes]
 *     summary: Delete a folder (routes become unsorted, folder-bound keys lose the folder)
 *     responses: { 200: { description: Deleted } }
 * /api/folders/{id}/routes:
 *   post:
 *     tags: [Routes]
 *     summary: Move routes into the folder
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [routeIds]
 *             properties:
 *               routeIds: { type: array, items: { type: string } }
 *     responses: { 200: { description: "{ count }" } }
 * /api/folders/{id}/routes/{routeId}:
 *   delete:
 *     tags: [Routes]
 *     summary: Remove a route from the folder
 *     responses: { 200: { description: Removed } }
 */

const folderSelect = { id: true, name: true, organizationId: true, sortOrder: true, createdAt: true, updatedAt: true } as const

async function loadFolder(id: string) {
  const folder = await prisma.routeFolder.findUnique({ where: { id }, select: folderSelect })
  if (!folder) throw AppError.notFound('Folder')
  return folder
}

// Folders are tenant-scoped through their organization; folders without one
// are admin-only. Denials are 404s so folder existence isn't leaked.
async function assertFolderAccess(req: Request, folder: { organizationId: string | null }, manage: boolean) {
  if (req.user!.role === 'ADMIN') return
  if (!folder.organizationId) throw AppError.notFound('Folder')
  const ok = manage
    ? await canManageOrgRoutes(req.user!.userId, req.user!.role, folder.organizationId)
    : await isOrgMember(req.user!.userId, req.user!.role, folder.organizationId)
  if (!ok) throw AppError.notFound('Folder')
}

router.get('/', authenticate, async (req, res, next) => {
  try {
    const organizationIds = req.user!.role === 'ADMIN' ? undefined : await getUserOrgIds(req.user!.userId)
    const folders = await prisma.routeFolder.findMany({
      where: organizationIds ? { organizationId: { in: organizationIds } } : {},
      select: { ...folderSelect, _count: { select: { routes: { where: { deletedAt: null } }, apiKeys: true } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })
    res.json({
      success: true,
      data: folders.map(({ _count, ...f }) => ({ ...f, routeCount: _count.routes, keyCount: _count.apiKeys })),
    })
  } catch (err) {
    next(err)
  }
})

router.post('/', authenticate, authorize([Role.ADMIN, Role.OPERATOR]), async (req, res, next) => {
  try {
    const data = z.object({
      name: z.string().trim().min(1).max(100),
      organizationId: z.string().nullable().optional(),
    }).parse(req.body)

    if (req.user!.role !== 'ADMIN') {
      if (!data.organizationId) throw AppError.badRequest('Organization is required')
      if (!(await canManageOrgRoutes(req.user!.userId, req.user!.role, data.organizationId))) {
        throw AppError.forbidden('You need Owner or Admin role in this organization to create folders')
      }
    } else if (data.organizationId) {
      const org = await prisma.organization.findUnique({ where: { id: data.organizationId }, select: { id: true } })
      if (!org) throw AppError.notFound('Organization')
    }

    const folder = await prisma.routeFolder.create({
      data: { name: data.name, organizationId: data.organizationId ?? null },
      select: folderSelect,
    })
    createAuditLog({
      userId: req.user!.userId, action: 'folder.create', resource: 'folder', resourceId: folder.id,
      details: { name: folder.name, organizationId: folder.organizationId },
      ip: req.ip || req.socket.remoteAddress, userAgent: req.get('user-agent'),
    })
    res.status(201).json({ success: true, data: { ...folder, routeCount: 0, keyCount: 0 } })
  } catch (err) {
    next(err)
  }
})

router.put('/:id', authenticate, authorize([Role.ADMIN, Role.OPERATOR]), async (req, res, next) => {
  try {
    const folder = await loadFolder(req.params.id)
    await assertFolderAccess(req, folder, true)
    const data = z.object({
      name: z.string().trim().min(1).max(100).optional(),
      sortOrder: z.number().int().min(0).max(100000).optional(),
    }).parse(req.body)
    const updated = await prisma.routeFolder.update({ where: { id: folder.id }, data, select: folderSelect })
    res.json({ success: true, data: updated })
  } catch (err) {
    next(err)
  }
})

router.delete('/:id', authenticate, authorize([Role.ADMIN, Role.OPERATOR]), async (req, res, next) => {
  try {
    const folder = await loadFolder(req.params.id)
    await assertFolderAccess(req, folder, true)
    // Routes fall back to "unsorted" (FK SET NULL); folder-bound keys lose the
    // folder (join rows cascade) — so those keys must stop matching promptly.
    await prisma.routeFolder.delete({ where: { id: folder.id } })
    invalidateApiKeyCaches()
    createAuditLog({
      userId: req.user!.userId, action: 'folder.delete', resource: 'folder', resourceId: folder.id,
      details: { name: folder.name },
      ip: req.ip || req.socket.remoteAddress, userAgent: req.get('user-agent'),
    })
    res.json({ success: true, message: 'Folder deleted' })
  } catch (err) {
    next(err)
  }
})

// Move routes into a folder. Every route must be manageable by the caller and
// belong to the folder's organization — folder-bound keys grant access to all
// routes inside, so a folder must never span tenants.
router.post('/:id/routes', authenticate, authorize([Role.ADMIN, Role.OPERATOR]), async (req, res, next) => {
  try {
    const folder = await loadFolder(req.params.id)
    await assertFolderAccess(req, folder, true)
    const { routeIds } = z.object({ routeIds: z.array(z.string()).min(1).max(200) }).parse(req.body)
    const ids = [...new Set(routeIds)]

    for (const id of ids) {
      if (!(await canManageRoute(req.user!.userId, req.user!.role, id))) throw AppError.notFound('Route')
    }
    const routes = await prisma.route.findMany({ where: { id: { in: ids }, deletedAt: null }, select: { id: true, organizationId: true } })
    if (routes.length !== ids.length) throw AppError.notFound('Route')
    if (routes.some((r) => r.organizationId !== folder.organizationId)) {
      throw AppError.badRequest("Routes must belong to the folder's organization")
    }

    const { count } = await prisma.route.updateMany({ where: { id: { in: ids } }, data: { folderId: folder.id } })
    invalidateApiKeyCaches()
    createAuditLog({
      userId: req.user!.userId, action: 'folder.assign_routes', resource: 'folder', resourceId: folder.id,
      details: { routeIds: ids, count },
      ip: req.ip || req.socket.remoteAddress, userAgent: req.get('user-agent'),
    })
    res.json({ success: true, data: { count } })
  } catch (err) {
    next(err)
  }
})

router.delete('/:id/routes/:routeId', authenticate, authorize([Role.ADMIN, Role.OPERATOR]), requireRouteManage('routeId'), async (req, res, next) => {
  try {
    const folder = await loadFolder(req.params.id)
    await assertFolderAccess(req, folder, true)
    const { count } = await prisma.route.updateMany({
      where: { id: req.params.routeId, folderId: folder.id },
      data: { folderId: null },
    })
    if (count === 0) throw AppError.notFound('Route')
    invalidateApiKeyCaches()
    createAuditLog({
      userId: req.user!.userId, action: 'folder.remove_route', resource: 'folder', resourceId: folder.id,
      details: { routeId: req.params.routeId },
      ip: req.ip || req.socket.remoteAddress, userAgent: req.get('user-agent'),
    })
    res.json({ success: true, message: 'Route removed from folder' })
  } catch (err) {
    next(err)
  }
})

export default router
