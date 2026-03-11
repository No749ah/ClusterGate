import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'
import { config } from '../config'
import { logger } from '../lib/logger'
import { AppError } from '../lib/errors'

const execFileAsync = promisify(execFile)
const fsPromises = fs.promises

// Backup directory inside the app
const BACKUPS_DIR = path.resolve(process.cwd(), 'backups')

// Strict filename validation: alphanumeric, dashes, underscores, dots only
const SAFE_FILENAME_RE = /^[a-zA-Z0-9_\-]+\.sql$/

interface BackupMeta {
  filename: string
  size: number
  createdAt: string
}

/**
 * Parse DATABASE_URL to extract connection parameters.
 * Format: postgresql://user:password@host:port/database?schema=...
 */
function parseDatabaseUrl(): {
  host: string
  port: string
  user: string
  password: string
  database: string
} {
  const url = config.DATABASE_URL
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw AppError.internal('Invalid DATABASE_URL format')
  }

  const host = parsed.hostname || 'localhost'
  const port = parsed.port || '5432'
  const user = decodeURIComponent(parsed.username || 'postgres')
  const password = decodeURIComponent(parsed.password || '')
  const database = parsed.pathname.replace(/^\//, '') || 'clustergate'

  return { host, port, user, password, database }
}

function validateFilename(filename: string): void {
  if (!filename || !SAFE_FILENAME_RE.test(filename)) {
    throw AppError.badRequest('Invalid backup filename. Only alphanumeric characters, dashes, underscores, and .sql extension are allowed.')
  }
  // Extra path traversal protection
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
 * Create a new database backup using pg_dump.
 */
export async function createBackup(): Promise<BackupMeta> {
  await ensureBackupsDir()

  const now = new Date()
  const timestamp = now
    .toISOString()
    .replace(/T/, '_')
    .replace(/:/g, '-')
    .replace(/\..+/, '')
  const filename = `clustergate_backup_${timestamp}.sql`
  const filePath = path.join(BACKUPS_DIR, filename)

  const db = parseDatabaseUrl()

  try {
    await execFileAsync('pg_dump', [
      '-h', db.host,
      '-p', db.port,
      '-U', db.user,
      '-d', db.database,
      '--no-owner',
      '--no-acl',
      '-f', filePath,
    ], {
      env: { ...process.env, PGPASSWORD: db.password },
      timeout: 120000, // 2 minutes
    })

    const stat = await fsPromises.stat(filePath)

    logger.info('Database backup created', { filename, size: stat.size })

    return {
      filename,
      size: stat.size,
      createdAt: now.toISOString(),
    }
  } catch (err) {
    // Clean up partial file
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
  const sqlFiles = files.filter((f) => f.endsWith('.sql'))

  const backups: BackupMeta[] = []
  for (const file of sqlFiles) {
    const filePath = path.join(BACKUPS_DIR, file)
    const stat = await fsPromises.stat(filePath)
    backups.push({
      filename: file,
      size: stat.size,
      createdAt: stat.birthtime.toISOString(),
    })
  }

  // Sort newest first
  backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  return backups
}

/**
 * Restore a database from a backup file.
 * Drops existing schema and restores from the SQL dump.
 */
export async function restoreBackup(filename: string): Promise<void> {
  validateFilename(filename)

  const filePath = path.join(BACKUPS_DIR, filename)

  try {
    await fsPromises.access(filePath)
  } catch {
    throw AppError.notFound('Backup file')
  }

  const db = parseDatabaseUrl()
  const env = { ...process.env, PGPASSWORD: db.password }

  try {
    // Drop and recreate the public schema to get a clean slate
    await execFileAsync('psql', [
      '-h', db.host,
      '-p', db.port,
      '-U', db.user,
      '-d', db.database,
      '-c', 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;',
    ], { env, timeout: 30000 })

    // Restore from backup file
    await execFileAsync('psql', [
      '-h', db.host,
      '-p', db.port,
      '-U', db.user,
      '-d', db.database,
      '-f', filePath,
    ], { env, timeout: 300000 }) // 5 minutes

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
  validateFilename(filename)

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
export async function downloadBackup(filename: string): Promise<string> {
  validateFilename(filename)

  const filePath = path.join(BACKUPS_DIR, filename)

  try {
    await fsPromises.access(filePath)
  } catch {
    throw AppError.notFound('Backup file')
  }

  return filePath
}
