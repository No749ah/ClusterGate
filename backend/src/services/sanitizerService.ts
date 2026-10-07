/**
 * Request Sanitizer Service
 *
 * Detects and masks PII patterns in request/response bodies before logging.
 * Config is persisted to DB (system_settings table) and cached in memory.
 */

import { prisma } from '../lib/prisma'

export interface SanitizerConfig {
  enabled: boolean
  maskEmails: boolean
  maskCreditCards: boolean
  maskSSNs: boolean
  maskPhoneNumbers: boolean
  maskIBANs: boolean
  customPatterns: { name: string; pattern: string; replacement: string }[]
}

const DEFAULT_CONFIG: SanitizerConfig = {
  enabled: true,
  maskEmails: true,
  maskCreditCards: true,
  maskSSNs: true,
  maskPhoneNumbers: true,
  maskIBANs: true,
  customPatterns: [],
}

// In-memory cache (loaded from DB on first access)
let configCache: SanitizerConfig | null = null

// PII regex patterns
const patterns = {
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  creditCard: /\b(?:\d[ -]*?){13,19}\b/g,
  ssn: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
  // Must not start or end inside a longer token: without the guards the last
  // 10 digits of any long digit run (13-digit timestamps, UUID tails) matched
  phone: /(?<![\w.+-])(?:\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}(?![\w-])/g,
  iban: /\b[A-Z]{2}\d{2}[\s]?[\dA-Z]{4}[\s]?[\dA-Z]{4}[\s]?[\dA-Z]{4}[\s]?[\dA-Z]{4}[\s]?[\dA-Z]{0,4}\b/g,
}

/**
 * A bare JSON number (`"created":1759830000`) is left alone: masking its
 * digits with '*' turns the logged JSON / NDJSON / SSE frame into invalid
 * JSON, and these are numeric ids and timestamps in practice. Phone, card and
 * social security numbers in JSON are strings and are still masked.
 */
function isBareJsonNumber(text: string, offset: number, match: string): boolean {
  if (!/^\d+$/.test(match)) return false
  let i = offset - 1
  while (i >= 0 && (text[i] === ' ' || text[i] === '\t')) i--
  let j = offset + match.length
  while (j < text.length && (text[j] === ' ' || text[j] === '\t')) j++
  const before = i >= 0 ? text[i] : ''
  const after = j < text.length ? text[j] : ''
  if (!(after === '' || /[,}\]\r\n]/.test(after))) return false
  if (before === '[') return true
  if (before !== ':' && before !== ',') return false
  // Prose like "SSN: 123456789" is not JSON: a value follows `"key":`, and an
  // array element follows another value
  let k = i - 1
  while (k >= 0 && /\s/.test(text[k])) k--
  const prev = k >= 0 ? text[k] : ''
  return before === ':' ? prev === '"' : /["\d}\]el]/.test(prev)
}

// Wrap a masker so bare JSON numbers pass through unchanged
function unlessJsonNumber(mask: (match: string) => string) {
  return (match: string, ...rest: unknown[]): string => {
    const offset = rest[rest.length - 2] as number
    const text = rest[rest.length - 1] as string
    return isBareJsonNumber(text, offset, match) ? match : mask(match)
  }
}

function maskEmail(match: string): string {
  const [local, domain] = match.split('@')
  if (!domain) return '[EMAIL]'
  return `${local[0]}***@${domain}`
}

function maskCreditCard(match: string): string {
  const digits = match.replace(/\D/g, '')
  if (digits.length < 13) return match
  return `${digits.slice(0, 4)}${'*'.repeat(digits.length - 8)}${digits.slice(-4)}`
}

function maskSSN(match: string): string {
  const digits = match.replace(/\D/g, '')
  return `***-**-${digits.slice(-4)}`
}

function maskPhone(match: string): string {
  return match.replace(/\d{3}[-.\s]?\d{4}$/, '***-****')
}

function maskIBAN(match: string): string {
  const clean = match.replace(/\s/g, '')
  return `${clean.slice(0, 4)} ${'**** '.repeat(3).trim()} ${clean.slice(-2)}`
}

async function loadConfig(): Promise<SanitizerConfig> {
  if (configCache) return configCache

  try {
    const row = await prisma.systemSetting.findUnique({ where: { key: 'sanitizer' } })
    if (row && row.value) {
      configCache = { ...DEFAULT_CONFIG, ...(row.value as unknown as Partial<SanitizerConfig>) }
    } else {
      configCache = { ...DEFAULT_CONFIG }
    }
  } catch {
    // DB not ready yet (e.g., during startup before migration)
    configCache = { ...DEFAULT_CONFIG }
  }

  return configCache
}

export function sanitizeText(text: string | null | undefined): string | null | undefined {
  // Use cached config synchronously (falls back to defaults if not loaded yet)
  const cfg = configCache || DEFAULT_CONFIG
  if (!text || !cfg.enabled) return text

  let result = text

  if (cfg.maskEmails) {
    result = result.replace(patterns.email, maskEmail)
  }
  if (cfg.maskCreditCards) {
    result = result.replace(patterns.creditCard, unlessJsonNumber((match) => {
      const digits = match.replace(/\D/g, '')
      if (digits.length >= 13 && digits.length <= 19 && luhnCheck(digits)) {
        return maskCreditCard(match)
      }
      return match
    }))
  }
  if (cfg.maskSSNs) {
    result = result.replace(patterns.ssn, unlessJsonNumber(maskSSN))
  }
  if (cfg.maskPhoneNumbers) {
    result = result.replace(patterns.phone, unlessJsonNumber(maskPhone))
  }
  if (cfg.maskIBANs) {
    result = result.replace(patterns.iban, maskIBAN)
  }

  for (const custom of cfg.customPatterns) {
    try {
      const regex = new RegExp(custom.pattern, 'g')
      result = result.replace(regex, custom.replacement)
    } catch {
      // Invalid regex, skip
    }
  }

  return result
}

// Luhn algorithm to validate credit card numbers
function luhnCheck(num: string): boolean {
  let sum = 0
  let double = false
  for (let i = num.length - 1; i >= 0; i--) {
    let digit = parseInt(num[i])
    if (double) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
    double = !double
  }
  return sum % 10 === 0
}

export async function getConfig(): Promise<SanitizerConfig> {
  return loadConfig()
}

export async function updateConfig(update: Partial<SanitizerConfig>): Promise<SanitizerConfig> {
  const current = await loadConfig()
  const newConfig = { ...current, ...update }

  await prisma.systemSetting.upsert({
    where: { key: 'sanitizer' },
    create: { key: 'sanitizer', value: newConfig as any },
    update: { value: newConfig as any },
  })

  configCache = newConfig
  return { ...newConfig }
}

// Pre-load config on module import (non-blocking)
loadConfig().catch(() => {})
