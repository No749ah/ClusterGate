import fs from 'fs'
import path from 'path'
import { logger } from '../lib/logger'
import { AppError } from '../lib/errors'
import { prisma } from '../lib/prisma'

const fsPromises = fs.promises

// Backup directory inside the app
const BACKUPS_DIR = path.resolve(process.cwd(), 'backups')

// Strict filename validation: alphanumeric, dashes, underscores, dots only
const SAFE_FILENAME_RE = /^[a-zA-Z0-9_\-]+\.json$/

interface BackupMeta {
  filename: string
  size: number
  createdAt: string
}

// All models to export, in dependency order (parents before children)
const BACKUP_MODELS = [
  'user',
  'organization',
  'orgMembership',
  'team',
  'teamMembership',
  'routeGroup',
  'route',
  'routeTarget',
  'transformRule',
  'routeVersion',
  'requestLog',
  'apiKey',
  'auditLog',
  'healthCheck',
  'notification',
  'inviteToken',
] as const

function validateFilename(filename: string): void {
  if (!filename || !SAFE_FILENAME_RE.test(filename)) {
    throw AppError.badRequest('Invalid backup filename. Only alphanumeric characters, dashes, underscores, and .json extension are allowed.')
  }
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    throw AppError.badRequest('Invalid backup filename')
  }
}

async function ensureBackupsDir(): Promise<void> {
  try {
    await fsPromises.mkdir(BACKUPS_DIR, { recursive: true })
  } catch (err) {
    logger.error('Failed to create backups directory', { error: (err as Error).message })
    throw AppError.internal('Failed to create backups directory')
  }
}

/**
 * Create a new database backup using Prisma.
 * Exports all tables as JSON — no pg_dump binary needed.
 */
export async function createBackup(): Promise<BackupMeta> {
  await ensureBackupsDir()

  const now = new Date()
  const timestamp = now
    .toISOString()
    .replace(/T/, '_')
    .replace(/:/g, '-')
    .replace(/\..+/, '')
  const filename = `clustergate_backup_${timestamp}.json`
  const filePath = path.join(BACKUPS_DIR, filename)

  try {
    const data: Record<string, any[]> = {}

    // Export each model
    for (const model of BACKUP_MODELS) {
      const delegate = (prisma as any)[model]
      if (delegate && typeof delegate.findMany === 'function') {
        data[model] = await delegate.findMany()
      }
    }

    data._meta = [{
      version: '1.0',
      createdAt: now.toISOString(),
      models: BACKUP_MODELS as unknown as string[],
    }]

    await fsPromises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
    const stat = await fsPromises.stat(filePath)

    logger.info('Database backup created', { filename, size: stat.size })

    return {
      filename,
      size: stat.size,
      createdAt: now.toISOString(),
    }
  } catch (err) {
    try { await fsPromises.unlink(filePath) } catch {}
    logger.error('Backup creation failed', { error: (err as Error).message })
    throw AppError.internal(`Backup failed: ${(err as Error).message}`)
  }
}

/**
 * List all backup files with metadata.
 */
export async function listBackups(): Promise<BackupMeta[]> {
  await ensureBackupsDir()

  const files = await fsPromises.readdir(BACKUPS_DIR)
  const backupFiles = files.filter((f) => f.endsWith('.json') || f.endsWith('.sql'))

  const backups: BackupMeta[] = []
  for (const file of backupFiles) {
    const filePath = path.join(BACKUPS_DIR, file)
    const stat = await fsPromises.stat(filePath)
    backups.push({
      filename: file,
      size: stat.size,
      createdAt: stat.birthtime.toISOString(),
    })
  }

  backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  return backups
}

/**
 * Restore a database from a JSON backup file.
 * Clears all tables and re-inserts data in dependency order.
 */
export async function restoreBackup(filename: string): Promise<void> {
  // Accept both .json and legacy .sql filenames for validation
  if (!filename || (!/^[a-zA-Z0-9_\-]+\.json$/.test(filename) && !/^[a-zA-Z0-9_\-]+\.sql$/.test(filename))) {
    throw AppError.badRequest('Invalid backup filename')
  }
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    throw AppError.badRequest('Invalid backup filename')
  }

  if (filename.endsWith('.sql')) {
    throw AppError.badRequest('Legacy .sql backups cannot be restored. Please create a new backup first.')
  }

  const filePath = path.join(BACKUPS_DIR, filename)

  try {
    await fsPromises.access(filePath)
  } catch {
    throw AppError.notFound('Backup file')
  }

  try {
    const raw = await fsPromises.readFile(filePath, 'utf-8')
    const data: Record<string, any[]> = JSON.parse(raw)

    // Delete all data in reverse dependency order (children before parents)
    const deleteOrder = [...BACKUP_MODELS].reverse()

    await prisma.$transaction(async (tx: any) => {
      // Clear tables in reverse order
      for (const model of deleteOrder) {
        const delegate = (tx as any)[model]
        if (delegate && typeof delegate.deleteMany === 'function') {
          await delegate.deleteMany()
        }
      }

      // Re-insert in dependency order (parents first)
      for (const model of BACKUP_MODELS) {
        const records = data[model]
        if (!records || !Array.isArray(records) || records.length === 0) continue

        const delegate = (tx as any)[model]
        if (delegate && typeof delegate.createMany === 'function') {
          // Convert date strings back to Date objects
          const processed = records.map((record) => {
            const converted: any = { ...record }
            for (const [key, value] of Object.entries(converted)) {
              if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
                converted[key] = new Date(value)
              }
            }
            return converted
          })

          await delegate.createMany({ data: processed, skipDuplicates: true })
        }
      }
    }, { timeout: 300000 }) // 5 minute timeout

    logger.info('Database restored from backup', { filename })
  } catch (err) {
    logger.error('Backup restore failed', { filename, error: (err as Error).message })
    throw AppError.internal(`Restore failed: ${(err as Error).message}`)
  }
}

/**
 * Delete a specific backup file.
 */
export async function deleteBackup(filename: string): Promise<void> {
  // Accept both .json and .sql for deletion
  if (!filename || (!/^[a-zA-Z0-9_\-]+\.json$/.test(filename) && !/^[a-zA-Z0-9_\-]+\.sql$/.test(filename))) {
    throw AppError.badRequest('Invalid backup filename')
  }
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    throw AppError.badRequest('Invalid backup filename')
  }

  const filePath = path.join(BACKUPS_DIR, filename)

  try {
    await fsPromises.access(filePath)
  } catch {
    throw AppError.notFound('Backup file')
  }

  await fsPromises.unlink(filePath)
  logger.info('Backup deleted', { filename })
}

/**
 * Returns the absolute file path for a backup file (for streaming download).
 */
/**
 * Enforce retention policy by deleting oldest backups beyond the limit.
 * Returns the number of backups deleted.
 */
export async function enforceRetentionPolicy(maxBackups: number): Promise<number> {
  const backups = await listBackups()
  if (backups.length <= maxBackups) return 0

  // Sort newest first (by createdAt descending)
  const sorted = backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  const toDelete = sorted.slice(maxBackups)

  let deleted = 0
  for (const backup of toDelete) {
    try {
      await deleteBackup(backup.filename)
      deleted++
    } catch (err) {
      console.error(`Failed to delete old backup ${backup.filename}:`, err)
    }
  }
  return deleted
}

export async function downloadBackup(filename: string): Promise<string> {
  // Accept both .json and .sql for download
  if (!filename || (!/^[a-zA-Z0-9_\-]+\.json$/.test(filename) && !/^[a-zA-Z0-9_\-]+\.sql$/.test(filename))) {
    throw AppError.badRequest('Invalid backup filename')
  }
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    throw AppError.badRequest('Invalid backup filename')
  }

  const filePath = path.join(BACKUPS_DIR, filename)

  try {
    await fsPromises.access(filePath)
  } catch {
    throw AppError.notFound('Backup file')
  }

  return filePath
}
