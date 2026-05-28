import { describe, it, expect } from 'vitest'
import { encryptSecret, decryptSecret } from '../crypto'

describe('secret encryption', () => {
  it('round-trips a value', () => {
    const enc = encryptSecret('super-secret-key') as string
    expect(enc.startsWith('enc:v1:')).toBe(true)
    expect(enc).not.toContain('super-secret-key')
    expect(decryptSecret(enc)).toBe('super-secret-key')
  })

  it('produces different ciphertext each time (random IV)', () => {
    expect(encryptSecret('abc')).not.toBe(encryptSecret('abc'))
  })

  it('does not double-encrypt', () => {
    const once = encryptSecret('x') as string
    expect(encryptSecret(once)).toBe(once)
  })

  it('passes through legacy plaintext on decrypt', () => {
    expect(decryptSecret('legacy-plaintext')).toBe('legacy-plaintext')
  })

  it('handles null/empty', () => {
    expect(encryptSecret(null)).toBe(null)
    expect(encryptSecret('')).toBe('')
    expect(decryptSecret(null)).toBe(null)
  })
})
