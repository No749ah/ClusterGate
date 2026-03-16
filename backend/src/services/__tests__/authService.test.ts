import { describe, it, expect, vi } from 'vitest'

// Mock Prisma client before importing the service
vi.mock('../../lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

// Mock @prisma/client for the Role enum
vi.mock('@prisma/client', () => ({
  Role: { ADMIN: 'ADMIN', OPERATOR: 'OPERATOR', VIEWER: 'VIEWER' },
}))

import { validatePassword } from '../authService'

describe('validatePassword', () => {
  it('accepts a strong password', () => {
    const result = validatePassword('StrongP@ss1')

    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('accepts a password with various special characters', () => {
    expect(validatePassword('Abcdef1!').valid).toBe(true)
    expect(validatePassword('Abcdef1@').valid).toBe(true)
    expect(validatePassword('Abcdef1#').valid).toBe(true)
    expect(validatePassword('Abcdef1$').valid).toBe(true)
    expect(validatePassword('Abcdef1_').valid).toBe(true)
  })

  it('rejects a password that is too short', () => {
    const result = validatePassword('Aa1!xyz')

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Must be at least 8 characters')
  })

  it('rejects a password with no uppercase letter', () => {
    const result = validatePassword('lowercase1!')

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Must contain at least one uppercase letter')
  })

  it('rejects a password with no lowercase letter', () => {
    const result = validatePassword('UPPERCASE1!')

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Must contain at least one lowercase letter')
  })

  it('rejects a password with no numbers', () => {
    const result = validatePassword('NoNumbers!')

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Must contain at least one number')
  })

  it('rejects a password with no special characters', () => {
    const result = validatePassword('NoSpecial1')

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Must contain at least one special character')
  })

  it('returns multiple errors for a very weak password', () => {
    const result = validatePassword('abc')

    expect(result.valid).toBe(false)
    // Too short, no uppercase, no number, no special char
    expect(result.errors.length).toBeGreaterThanOrEqual(4)
    expect(result.errors).toContain('Must be at least 8 characters')
    expect(result.errors).toContain('Must contain at least one uppercase letter')
    expect(result.errors).toContain('Must contain at least one number')
    expect(result.errors).toContain('Must contain at least one special character')
  })

  it('accepts exactly 8 characters', () => {
    const result = validatePassword('Abcdef1!')

    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('rejects an empty string', () => {
    const result = validatePassword('')

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Must be at least 8 characters')
  })

  it('returns errors as an array of strings', () => {
    const result = validatePassword('weak')

    expect(Array.isArray(result.errors)).toBe(true)
    result.errors.forEach((err) => {
      expect(typeof err).toBe('string')
    })
  })
})
