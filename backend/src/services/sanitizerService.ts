/**
 * Request Sanitizer Service
 *
 * Detects and masks PII patterns in request/response bodies before logging.
 * Runs after the proxy response but before data is stored in request_logs.
 */

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

// In-memory config (can be persisted via system settings later)
let config: SanitizerConfig = { ...DEFAULT_CONFIG }

// PII regex patterns
const patterns = {
  // email: user@domain.com → u***@domain.com
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,

  // credit card: 4111111111111111 → 4111********1111
  creditCard: /\b(?:\d[ -]*?){13,19}\b/g,

  // SSN: 123-45-6789 → ***-**-6789
  ssn: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,

  // phone: +1 (555) 123-4567 → +1 (555) ***-****
  phone: /(?:\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,

  // IBAN: DE89 3704 0044 0532 0130 00 → DE89 **** **** **** **** 00
  iban: /\b[A-Z]{2}\d{2}[\s]?[\dA-Z]{4}[\s]?[\dA-Z]{4}[\s]?[\dA-Z]{4}[\s]?[\dA-Z]{4}[\s]?[\dA-Z]{0,4}\b/g,
}

function maskEmail(match: string): string {
  const [local, domain] = match.split('@')
  if (!domain) return '[EMAIL]'
  return `${local[0]}***@${domain}`
}

function maskCreditCard(match: string): string {
  const digits = match.replace(/\D/g, '')
  if (digits.length < 13) return match // Not a real CC
  return `${digits.slice(0, 4)}${'*'.repeat(digits.length - 8)}${digits.slice(-4)}`
}

function maskSSN(match: string): string {
  const digits = match.replace(/\D/g, '')
  return `***-**-${digits.slice(-4)}`
}

function maskPhone(match: string): string {
  // Keep area code, mask the rest
  return match.replace(/\d{3}[-.\s]?\d{4}$/, '***-****')
}

function maskIBAN(match: string): string {
  const clean = match.replace(/\s/g, '')
  return `${clean.slice(0, 4)} ${'**** '.repeat(3).trim()} ${clean.slice(-2)}`
}

export function sanitizeText(text: string | null | undefined): string | null | undefined {
  if (!text || !config.enabled) return text

  let result = text

  if (config.maskEmails) {
    result = result.replace(patterns.email, maskEmail)
  }
  if (config.maskCreditCards) {
    result = result.replace(patterns.creditCard, (match) => {
      const digits = match.replace(/\D/g, '')
      // Validate Luhn check to avoid false positives on random number sequences
      if (digits.length >= 13 && digits.length <= 19 && luhnCheck(digits)) {
        return maskCreditCard(match)
      }
      return match
    })
  }
  if (config.maskSSNs) {
    result = result.replace(patterns.ssn, maskSSN)
  }
  if (config.maskPhoneNumbers) {
    result = result.replace(patterns.phone, maskPhone)
  }
  if (config.maskIBANs) {
    result = result.replace(patterns.iban, maskIBAN)
  }

  // Apply custom patterns
  for (const custom of config.customPatterns) {
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

export function getConfig(): SanitizerConfig {
  return { ...config }
}

export function updateConfig(update: Partial<SanitizerConfig>): SanitizerConfig {
  config = { ...config, ...update }
  return { ...config }
}
