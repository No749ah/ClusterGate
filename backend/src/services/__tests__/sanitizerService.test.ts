import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Prisma before importing the service
vi.mock('../../lib/prisma', () => ({
  prisma: {
    systemSetting: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
    },
  },
}))

import { sanitizeText, updateConfig, getConfig } from '../sanitizerService'
import type { SanitizerConfig } from '../sanitizerService'

// Helper to reset config to all-enabled defaults
async function resetConfig(overrides: Partial<SanitizerConfig> = {}) {
  await updateConfig({
    enabled: true,
    maskEmails: true,
    maskCreditCards: true,
    maskSSNs: true,
    maskPhoneNumbers: true,
    maskIBANs: true,
    customPatterns: [],
    ...overrides,
  })
}

describe('sanitizerService', () => {
  beforeEach(async () => {
    // Reset config to defaults before each test
    await resetConfig()
  })

  describe('sanitizeText — email masking', () => {
    it('masks a simple email address', () => {
      const result = sanitizeText('Contact us at john.doe@example.com for info')

      expect(result).not.toContain('john.doe@example.com')
      expect(result).toContain('j***@example.com')
    })

    it('masks multiple email addresses', () => {
      const result = sanitizeText('From alice@test.org to bob@company.co.uk')

      expect(result).not.toContain('alice@test.org')
      expect(result).not.toContain('bob@company.co.uk')
      expect(result).toContain('a***@test.org')
      expect(result).toContain('b***@company.co.uk')
    })

    it('does not mask emails when maskEmails is disabled', async () => {
      await resetConfig({ maskEmails: false })

      const result = sanitizeText('Email: test@example.com')
      expect(result).toContain('test@example.com')
    })
  })

  describe('sanitizeText — credit card masking', () => {
    it('masks a valid Visa card number', () => {
      // 4111111111111111 passes Luhn check
      const result = sanitizeText('Card: 4111111111111111')

      expect(result).not.toContain('4111111111111111')
      // Should show first 4 and last 4 digits
      expect(result).toContain('4111')
      expect(result).toContain('1111')
      expect(result).toContain('*')
    })

    it('masks a card number with spaces', () => {
      const result = sanitizeText('Card: 4111 1111 1111 1111')

      expect(result).not.toContain('4111 1111 1111 1111')
    })

    it('does not mask numbers that fail Luhn check', async () => {
      // Disable phone masking too, since the phone regex can match sub-sequences of digits
      await resetConfig({ maskPhoneNumbers: false })
      // 1234567890123456 does not pass Luhn
      const result = sanitizeText('Number: 1234567890123456')

      // Credit card regex matches but Luhn check fails, so digits are preserved
      expect(result).toContain('1234567890123456')
    })

    it('does not mask credit cards when maskCreditCards is disabled', async () => {
      // Also disable phone masking since phone regex can match sub-sequences of digits
      await resetConfig({ maskCreditCards: false, maskPhoneNumbers: false })

      const result = sanitizeText('Card: 4111111111111111')
      expect(result).toContain('4111111111111111')
    })
  })

  describe('sanitizeText — SSN masking', () => {
    it('masks SSN with dashes', () => {
      const result = sanitizeText('SSN: 123-45-6789')

      expect(result).not.toContain('123-45-6789')
      expect(result).toContain('***-**-6789')
    })

    it('masks SSN with spaces', () => {
      const result = sanitizeText('SSN: 123 45 6789')

      expect(result).not.toContain('123 45 6789')
      expect(result).toContain('***-**-6789')
    })

    it('masks SSN without separators', () => {
      const result = sanitizeText('SSN: 123456789')

      expect(result).not.toContain('123456789')
      expect(result).toContain('***-**-6789')
    })

    it('does not mask SSNs when maskSSNs is disabled', async () => {
      await resetConfig({ maskSSNs: false })

      const result = sanitizeText('SSN: 123-45-6789')
      expect(result).toContain('123-45-6789')
    })
  })

  describe('sanitizeText — phone number masking', () => {
    it('masks a US phone number', () => {
      const result = sanitizeText('Call: (555) 123-4567')

      expect(result).not.toContain('123-4567')
      expect(result).toContain('***-****')
    })

    it('masks a phone with country code', () => {
      const result = sanitizeText('Phone: +1-555-123-4567')

      expect(result).not.toContain('123-4567')
      expect(result).toContain('***-****')
    })

    it('does not mask phones when maskPhoneNumbers is disabled', async () => {
      await resetConfig({ maskPhoneNumbers: false })

      const result = sanitizeText('Call: (555) 123-4567')
      expect(result).toContain('123-4567')
    })
  })

  describe('sanitizeText — IBAN masking', () => {
    it('masks a German IBAN', () => {
      const result = sanitizeText('IBAN: DE89370400440532013000')

      expect(result).not.toContain('DE89370400440532013000')
      expect(result).toContain('DE89')
      expect(result).toContain('****')
    })

    it('masks an IBAN with spaces', () => {
      const result = sanitizeText('IBAN: GB29 NWBK 6016 1331 9268 19')

      expect(result).not.toContain('GB29 NWBK 6016 1331 9268 19')
      expect(result).toContain('GB29')
    })

    it('does not mask IBANs when maskIBANs is disabled', async () => {
      // Also disable phone masking since phone regex can match sub-sequences of digits
      await resetConfig({ maskIBANs: false, maskPhoneNumbers: false })

      const result = sanitizeText('IBAN: DE89370400440532013000')
      expect(result).toContain('DE89370400440532013000')
    })
  })

  describe('sanitizeText — custom patterns', () => {
    it('applies custom regex patterns', async () => {
      await resetConfig({
        customPatterns: [
          { name: 'API Key', pattern: 'sk_live_[A-Za-z0-9]+', replacement: '[REDACTED_KEY]' },
        ],
      })

      const result = sanitizeText('Key: sk_live_abc123XYZ')

      expect(result).not.toContain('sk_live_abc123XYZ')
      expect(result).toContain('[REDACTED_KEY]')
    })

    it('applies multiple custom patterns', async () => {
      await resetConfig({
        customPatterns: [
          { name: 'Token', pattern: 'token=[A-Za-z0-9]+', replacement: 'token=[REDACTED]' },
          { name: 'Secret', pattern: 'secret=[^&]+', replacement: 'secret=[REDACTED]' },
        ],
      })

      const result = sanitizeText('url?token=abc123&secret=xyz789')

      expect(result).toContain('token=[REDACTED]')
      expect(result).toContain('secret=[REDACTED]')
    })

    it('ignores invalid regex patterns gracefully', async () => {
      await resetConfig({
        customPatterns: [
          { name: 'Bad', pattern: '(?invalid[', replacement: 'X' },
        ],
      })

      // Should not throw, just skip the invalid pattern
      const result = sanitizeText('Some text')
      expect(result).toBe('Some text')
    })
  })

  describe('sanitizeText — disabled', () => {
    it('returns the original text when sanitizer is disabled', async () => {
      await resetConfig({ enabled: false })

      const input = 'Email: test@example.com SSN: 123-45-6789'
      const result = sanitizeText(input)

      expect(result).toBe(input)
    })
  })

  describe('sanitizeText — null/undefined handling', () => {
    it('returns null for null input', () => {
      expect(sanitizeText(null)).toBeNull()
    })

    it('returns undefined for undefined input', () => {
      expect(sanitizeText(undefined)).toBeUndefined()
    })

    it('returns empty string for empty input', () => {
      expect(sanitizeText('')).toBe('')
    })
  })
})
