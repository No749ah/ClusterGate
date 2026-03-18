import { Router, Request, Response, NextFunction } from 'express'
import { authenticate } from '../middleware/authenticate'
import { authorize } from '../middleware/authenticate'
import { createAuditLog } from '../services/auditService'
import { config } from '../config'
import {
  createBackup,
  listBackups,
  restoreBackup,
  deleteBackup,
  downloadBackup,
  updateBackup,
} from '../services/backupService'
import { achievementService } from '../services/achievementService'

const router = Router()

// All backup routes require admin authentication
router.use(authenticate)
router.use(authorize(['ADMIN']))

/**
 * @openapi
 * /api/backups/schedule:
 *   get:
 *     tags: [Backups]
 *     summary: Get backup schedule
 *     description: Returns the current backup schedule configuration. Requires ADMIN role.
 *     responses:
 *       200:
 *         description: Backup schedule config
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
 *                     enabled:
 *                       type: boolean
 *                     schedule:
 *                       type: string
 *                     retentionCount:
 *                       type: integer
 */
router.get('/schedule', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      enabled: config.BACKUP_CRON_ENABLED,
      schedule: config.BACKUP_CRON_SCHEDULE,
      retentionCount: config.BACKUP_RETENTION_COUNT,
    },
  })
})

/**
 * @openapi
 * /api/backups:
 *   post:
 *     tags: [Backups]
 *     summary: Create backup
 *     description: Creates a new database backup. Requires ADMIN role.
 *     responses:
 *       200:
 *         description: Backup created
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
 *                     filename:
 *                       type: string
 *                     size:
 *                       type: integer
 *                       description: Backup file size in bytes
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient permissions
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tags, note } = req.body || {}
    const backup = await createBackup({ tags, note })

    createAuditLog({
      userId: req.user!.userId,
      action: 'backup.create',
      resource: 'backup',
      details: { filename: backup.filename, size: backup.size },
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.get('user-agent'),
    })

    achievementService.checkBackup(req.user!.userId).catch(() => {})

    res.json({ success: true, data: backup })
  } catch (err) {
    next(err)
  }
})

/**
 * @openapi
 * /api/backups:
 *   get:
 *     tags: [Backups]
 *     summary: List backups
 *     description: Returns all available database backups. Requires ADMIN role.
 *     responses:
 *       200:
 *         description: List of backups
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
 *                       filename:
 *                         type: string
 *                       size:
 *                         type: integer
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *       403:
 *         description: Insufficient permissions
 */
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const backups = await listBackups()
    res.json({ success: true, data: backups })
  } catch (err) {
    next(err)
  }
})

/**
 * @openapi
 * /api/backups/{filename}/restore:
 *   post:
 *     tags: [Backups]
 *     summary: Restore from backup
 *     description: Restores the database from a specific backup file. Requires ADMIN role.
 *     parameters:
 *       - in: path
 *         name: filename
 *         required: true
 *         schema:
 *           type: string
 *         description: Backup filename
 *     responses:
 *       200:
 *         description: Database restored
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       404:
 *         description: Backup file not found
 */
router.post('/:filename/restore', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { filename } = req.params

    await restoreBackup(filename)

    createAuditLog({
      userId: req.user!.userId,
      action: 'backup.restore',
      resource: 'backup',
      details: { filename },
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.get('user-agent'),
    })

    res.json({ success: true, message: `Database restored from ${filename}` })
  } catch (err) {
    next(err)
  }
})

/**
 * @openapi
 * /api/backups/{filename}/download:
 *   get:
 *     tags: [Backups]
 *     summary: Download backup
 *     description: Downloads a backup file. Requires ADMIN role.
 *     parameters:
 *       - in: path
 *         name: filename
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Backup file download
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Backup file not found
 */
router.get('/:filename/download', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { filename } = req.params
    const jsonData = await downloadBackup(filename)

    createAuditLog({
      userId: req.user!.userId,
      action: 'backup.download',
      resource: 'backup',
      details: { filename },
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.get('user-agent'),
    })

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Content-Type', 'application/json')
    res.send(jsonData)
  } catch (err) {
    next(err)
  }
})

/**
 * @openapi
 * /api/backups/{filename}:
 *   delete:
 *     tags: [Backups]
 *     summary: Delete backup
 *     description: Permanently deletes a backup file. Requires ADMIN role.
 *     parameters:
 *       - in: path
 *         name: filename
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Backup deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       404:
 *         description: Backup file not found
 */
router.delete('/:filename', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { filename } = req.params

    await deleteBackup(filename)

    createAuditLog({
      userId: req.user!.userId,
      action: 'backup.delete',
      resource: 'backup',
      details: { filename },
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.get('user-agent'),
    })

    res.json({ success: true, message: `Backup ${filename} deleted` })
  } catch (err) {
    next(err)
  }
})

// Update backup metadata (tags, note)
router.put('/:filename', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { filename } = req.params
    const { tags, note } = req.body
    const backup = await updateBackup(filename, { tags, note })
    res.json({ success: true, data: backup })
  } catch (err) {
    next(err)
  }
})

export default router
