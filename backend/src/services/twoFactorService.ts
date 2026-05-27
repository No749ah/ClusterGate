// NOTE: requires `npm install otpauth` — add "otpauth": "^9.3.1" to dependencies
import { TOTP, Secret } from 'otpauth'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { prisma } from '../lib/prisma'
import { AppError } from '../lib/errors'

const BCRYPT_ROUNDS = 12
const ISSUER = 'ClusterGate'
const RECOVERY_CODE_COUNT = 10
const MAX_2FA_ATTEMPTS = 5
const LOCKOUT_MS = 15 * 60 * 1000 // 15 minutes

/**
 * Issue a fresh single-use challenge nonce for a pending 2FA login and store
 * it on the user. The nonce is embedded in the temp token and cleared on
 * successful verification, making the temp token single-use.
 */
export async function startLoginChallenge(userId: string): Promise<string> {
  const nonce = crypto.randomBytes(16).toString('hex')
  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorChallenge: nonce },
  })
  return nonce
}

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

  // Per-user lockout — independent of source IP, so rotating IPs can't evade it
  if (user.twoFactorLockedUntil && user.twoFactorLockedUntil.getTime() > Date.now()) {
    const mins = Math.ceil((user.twoFactorLockedUntil.getTime() - Date.now()) / 60000)
    throw AppError.tooManyRequests(`Too many failed 2FA attempts. Try again in ${mins} minute(s).`)
  }

  // Try TOTP verification first (6-digit codes)
  const totp = createTOTP(user.twoFactorSecret, user.email)
  const delta = totp.validate({ token, window: 1 })

  if (delta !== null) {
    await onVerifySuccess(userId, user.recoveryCodes)
    return true
  }

  // Try recovery codes (8-char hex strings)
  for (let i = 0; i < user.recoveryCodes.length; i++) {
    const match = await bcrypt.compare(token, user.recoveryCodes[i])
    if (match) {
      const updatedCodes = [...user.recoveryCodes]
      updatedCodes.splice(i, 1)
      await onVerifySuccess(userId, updatedCodes)
      return true
    }
  }

  await onVerifyFailure(userId, user.twoFactorFailedAttempts)
  return false
}

async function onVerifySuccess(userId: string, recoveryCodes: string[]): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      recoveryCodes,
      twoFactorFailedAttempts: 0,
      twoFactorLockedUntil: null,
      twoFactorChallenge: null, // consume the single-use challenge
    },
  })
}

async function onVerifyFailure(userId: string, currentAttempts: number): Promise<void> {
  const attempts = currentAttempts + 1
  if (attempts >= MAX_2FA_ATTEMPTS) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorFailedAttempts: 0,
        twoFactorLockedUntil: new Date(Date.now() + LOCKOUT_MS),
      },
    })
  } else {
    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorFailedAttempts: attempts },
    })
  }
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
