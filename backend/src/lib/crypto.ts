import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'
import { config } from '../config'
import { logger } from './logger'

// Encrypts route secrets at rest with AES-256-GCM. Values are prefixed so we
// can transparently read legacy plaintext (pre-encryption) rows and migrate
// them on the next write.
const PREFIX = 'enc:v1:'
let cachedKey: Buffer | null = null

function getKey(): Buffer {
  if (cachedKey) return cachedKey
  let src = config.ENCRYPTION_KEY
  if (!src) {
    // config/index.ts refuses to start production without ENCRYPTION_KEY, so
    // this fallback can only be reached in dev/test. Guard anyway so a future
    // config change can't silently reintroduce the derived key in production.
    if (config.isProd) {
      throw new Error('ENCRYPTION_KEY is required in production')
    }
    logger.warn('ENCRYPTION_KEY not set — deriving secret-encryption key from JWT_SECRET (dev only). Set ENCRYPTION_KEY before going to production.')
    src = config.JWT_SECRET
  }
  cachedKey = scryptSync(src, 'clustergate-secret-encryption', 32)
  return cachedKey
}

export function encryptSecret<T extends string | null | undefined>(plain: T): T | string {
  if (plain == null || plain === '') return plain
  if (typeof plain === 'string' && plain.startsWith(PREFIX)) return plain // already encrypted
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv)
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return PREFIX + Buffer.concat([iv, tag, ct]).toString('base64')
}

export function decryptSecret(value: string | null | undefined): string | null {
  if (value == null) return null
  if (!value.startsWith(PREFIX)) return value // legacy plaintext — return as-is
  try {
    const raw = Buffer.from(value.slice(PREFIX.length), 'base64')
    const iv = raw.subarray(0, 12)
    const tag = raw.subarray(12, 28)
    const ct = raw.subarray(28)
    const decipher = createDecipheriv('aes-256-gcm', getKey(), iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
  } catch {
    return value
  }
}
