import { logger } from '../lib/logger'
import { AppError } from '../lib/errors'
import { prisma } from '../lib/prisma'
import { decryptSecret } from '../lib/crypto'

export interface BackupMeta {
  filename: string
  size: number
  tags: string[]
  note: string | null
  createdAt: string
}

// All models to export, in dependency order (parents before children)
const BACKUP_MODELS = [
  'systemSetting',
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
  'incident',
  'incidentEvent',
  'changeRequest',
  'achievement',
  'inviteToken',
] as const

/**
 * Create a new database backup stored in the database itself.
 * Exports all tables as JSON — survives container restarts.
 */
export async function createBackup(options?: { tags?: string[]; note?: string }): Promise<BackupMeta> {
  const now = new Date()
  const timestamp = now
    .toISOString()
    .replace(/T/, '_')
    .replace(/:/g, '-')
    .replace(/\..+/, '')
  const filename = `clustergate_backup_${timestamp}.json`

  try {
    const data: Record<string, any[]> = {}

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

    const json = JSON.stringify(data)
    const size = Buffer.byteLength(json, 'utf-8')

    const tags = options?.tags ?? []
    const note = options?.note ?? null

    await prisma.backup.create({
      data: { filename, data: data as any, size, tags, note },
    })

    logger.info('Database backup created', { filename, size })

    return { filename, size, tags, note, createdAt: now.toISOString() }
  } catch (err) {
    logger.error('Backup creation failed', { error: (err as Error).message })
    throw AppError.internal(`Backup failed: ${(err as Error).message}`)
  }
}

/**
 * List all backups with metadata.
 */
export async function listBackups(): Promise<BackupMeta[]> {
  const backups = await prisma.backup.findMany({
    select: { filename: true, size: true, tags: true, note: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })

  return backups.map((b) => ({
    filename: b.filename,
    size: b.size,
    tags: b.tags,
    note: b.note,
    createdAt: b.createdAt.toISOString(),
  }))
}

/**
 * Restore a database from a backup stored in the database.
 * Clears all tables and re-inserts data in dependency order.
 */
export async function restoreBackup(filename: string): Promise<void> {
  if (!filename || !/^[a-zA-Z0-9_\-]+\.json$/.test(filename)) {
    throw AppError.badRequest('Invalid backup filename')
  }

  const backup = await prisma.backup.findUnique({ where: { filename } })
  if (!backup) throw AppError.notFound('Backup')

  try {
    const data = backup.data as Record<string, any[]>
    const deleteOrder = [...BACKUP_MODELS].reverse()
    let secretsCleared = 0

    await prisma.$transaction(async (tx: any) => {
      for (const model of deleteOrder) {
        const delegate = (tx as any)[model]
        if (delegate && typeof delegate.deleteMany === 'function') {
          await delegate.deleteMany()
        }
      }

      for (const model of BACKUP_MODELS) {
        const records = data[model]
        if (!records || !Array.isArray(records) || records.length === 0) continue

        const delegate = (tx as any)[model]
        if (delegate && typeof delegate.createMany === 'function') {
          const processed = records.map((record) => {
            const converted: any = { ...record }
            for (const [key, value] of Object.entries(converted)) {
              if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
                converted[key] = new Date(value)
              }
            }
            // Restoring on an instance with a different encryption key would
            // leave undecryptable ciphertext that gets used as a literal secret.
            // Clear such values so they fail safe and can be re-entered.
            if (model === 'route') {
              for (const f of ['authValue', 'upstreamAuthValue', 'webhookSecret']) {
                const v = converted[f]
                if (typeof v === 'string' && v.startsWith('enc:v1:') && decryptSecret(v) === v) {
                  converted[f] = null
                  secretsCleared++
                }
              }
            }
            return converted
          })

          await delegate.createMany({ data: processed, skipDuplicates: true })
        }
      }
    }, { timeout: 300000 })

    logger.info('Database restored from backup', { filename, secretsCleared })
    if (secretsCleared > 0) {
      logger.warn(`${secretsCleared} route secret(s) could not be decrypted with this instance's key and were cleared — re-enter them`, { filename })
    }
  } catch (err) {
    logger.error('Backup restore failed', { filename, error: (err as Error).message })
    throw AppError.internal(`Restore failed: ${(err as Error).message}`)
  }
}

/**
 * Delete a specific backup.
 */
export async function deleteBackup(filename: string): Promise<void> {
  if (!filename || !/^[a-zA-Z0-9_\-]+\.json$/.test(filename)) {
    throw AppError.badRequest('Invalid backup filename')
  }

  const backup = await prisma.backup.findUnique({ where: { filename } })
  if (!backup) throw AppError.notFound('Backup')

  await prisma.backup.delete({ where: { filename } })
  logger.info('Backup deleted', { filename })
}

/**
 * Update backup tags and/or note.
 */
export async function updateBackup(filename: string, data: { tags?: string[]; note?: string | null }): Promise<BackupMeta> {
  if (!filename || !/^[a-zA-Z0-9_\-]+\.json$/.test(filename)) {
    throw AppError.badRequest('Invalid backup filename')
  }

  const backup = await prisma.backup.findUnique({ where: { filename } })
  if (!backup) throw AppError.notFound('Backup')

  const updated = await prisma.backup.update({
    where: { filename },
    data,
    select: { filename: true, size: true, tags: true, note: true, createdAt: true },
  })

  return {
    filename: updated.filename,
    size: updated.size,
    tags: updated.tags,
    note: updated.note,
    createdAt: updated.createdAt.toISOString(),
  }
}

/**
 * Enforce retention policy by deleting oldest backups beyond the limit.
 */
export async function enforceRetentionPolicy(maxBackups: number): Promise<number> {
  const backups = await listBackups()
  if (backups.length <= maxBackups) return 0

  const toDelete = backups.slice(maxBackups) // already sorted newest-first
  let deleted = 0
  for (const backup of toDelete) {
    try {
      await deleteBackup(backup.filename)
      deleted++
    } catch (err) {
      logger.error(`Failed to delete old backup ${backup.filename}`, { error: (err as Error).message })
    }
  }
  return deleted
}

// Credential material that must never leave the system in a downloadable
// export. Restores run from the backup stored in the database (full data),
// so redacting the download loses nothing.
const DOWNLOAD_REDACTED_FIELDS: Record<string, string[]> = {
  user: ['passwordHash', 'twoFactorSecret', 'recoveryCodes'],
  apiKey: ['keyHash'],
}

function sanitizeBackupForDownload(data: Record<string, any[]>): Record<string, any[]> {
  const sanitized: Record<string, any[]> = { ...data }
  for (const [model, fields] of Object.entries(DOWNLOAD_REDACTED_FIELDS)) {
    const records = sanitized[model]
    if (!Array.isArray(records)) continue
    sanitized[model] = records.map((record) => {
      const cleaned: any = { ...record }
      for (const field of fields) {
        if (cleaned[field] != null) {
          cleaned[field] = Array.isArray(cleaned[field]) ? [] : '[REDACTED]'
        }
      }
      return cleaned
    })
  }
  return sanitized
}

/**
 * Returns backup data as a JSON string for download. Credential material
 * (password hashes, 2FA secrets, recovery codes, API-key hashes) is redacted;
 * restore always uses the full copy stored in the database, so the download
 * export doesn't need it.
 */
export async function downloadBackup(filename: string): Promise<string> {
  if (!filename || !/^[a-zA-Z0-9_\-]+\.json$/.test(filename)) {
    throw AppError.badRequest('Invalid backup filename')
  }

  const backup = await prisma.backup.findUnique({ where: { filename } })
  if (!backup) throw AppError.notFound('Backup')

  const sanitized = sanitizeBackupForDownload(backup.data as Record<string, any[]>)
  return JSON.stringify(sanitized, null, 2)
}
