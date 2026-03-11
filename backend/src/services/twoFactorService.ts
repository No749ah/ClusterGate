// NOTE: requires `npm install otpauth` — add "otpauth": "^9.3.1" to dependencies
import { TOTP, Secret } from 'otpauth'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { prisma } from '../lib/prisma'
import { AppError } from '../lib/errors'

const BCRYPT_ROUNDS = 12
const ISSUER = 'ClusterGate'
const RECOVERY_CODE_COUNT = 10

function createTOTP(secret: string, email: string): TOTP {
  return new TOTP({
    issuer: ISSUER,
    label: email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  })
}

/**
 * Generate a TOTP setup for a user. Stores the secret (not yet enabled).
 * Returns the otpauth:// URI and the base32 secret for manual entry.
 */
export async function generateSetup(userId: string): Promise<{ uri: string; secret: string }> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw AppError.notFound('User')

  if (user.twoFactorEnabled) {
    throw AppError.badRequest('Two-factor authentication is already enabled')
  }

  const secret = new Secret({ size: 20 })
  const base32Secret = secret.base32

  const totp = new TOTP({
    issuer: ISSUER,
    label: user.email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret,
  })

  const uri = totp.toString()

  // Store the secret (not yet enabled)
  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorSecret: base32Secret },
  })

  return { uri, secret: base32Secret }
}

/**
 * Verify a TOTP token and enable 2FA. Generates recovery codes.
 * Returns the plaintext recovery codes (only shown once).
 */
export async function verifyAndEnable(userId: string, token: string): Promise<string[]> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw AppError.notFound('User')

  if (user.twoFactorEnabled) {
    throw AppError.badRequest('Two-factor authentication is already enabled')
  }

  if (!user.twoFactorSecret) {
    throw AppError.badRequest('Two-factor setup has not been initiated')
  }

  const totp = createTOTP(user.twoFactorSecret, user.email)
  const delta = totp.validate({ token, window: 1 })

  if (delta === null) {
    throw AppError.badRequest('Invalid verification code')
  }

  // Generate recovery codes
  const plaintextCodes: string[] = []
  const hashedCodes: string[] = []

  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    const code = crypto.randomBytes(4).toString('hex') // 8-char hex
    plaintextCodes.push(code)
    const hashed = await bcrypt.hash(code, BCRYPT_ROUNDS)
    hashedCodes.push(hashed)
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      twoFactorEnabled: true,
      recoveryCodes: hashedCodes,
    },
  })

  return plaintextCodes
}

/**
 * Verify a TOTP token or recovery code for login.
 * If a recovery code is used, it is consumed (removed from the stored list).
 */
export async function verifyToken(userId: string, token: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw AppError.notFound('User')

  if (!user.twoFactorEnabled || !user.twoFactorSecret) {
    throw AppError.badRequest('Two-factor authentication is not enabled')
  }

  // Try TOTP verification first (6-digit codes)
  const totp = createTOTP(user.twoFactorSecret, user.email)
  const delta = totp.validate({ token, window: 1 })

  if (delta !== null) {
    return true
  }

  // Try recovery codes (8-char hex strings)
  for (let i = 0; i < user.recoveryCodes.length; i++) {
    const match = await bcrypt.compare(token, user.recoveryCodes[i])
    if (match) {
      // Remove the used recovery code
      const updatedCodes = [...user.recoveryCodes]
      updatedCodes.splice(i, 1)
      await prisma.user.update({
        where: { id: userId },
        data: { recoveryCodes: updatedCodes },
      })
      return true
    }
  }

  return false
}

/**
 * Disable 2FA for a user. Requires password verification.
 */
export async function disable(userId: string, password: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw AppError.notFound('User')

  if (!user.twoFactorEnabled) {
    throw AppError.badRequest('Two-factor authentication is not enabled')
  }

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) {
    throw AppError.badRequest('Invalid password')
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      twoFactorSecret: null,
      twoFactorEnabled: false,
      recoveryCodes: [],
    },
  })
}
