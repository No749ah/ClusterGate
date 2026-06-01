import { describe, it, expect, vi } from 'vitest'

// proxyService transitively imports prisma + several services; mock the DB layer
// so importing it for the pure isIpAllowed helper has no side effects.
vi.mock('../../lib/prisma', () => ({ prisma: {} }))

import { isIpAllowed } from '../proxyService'

describe('isIpAllowed', () => {
  it('matches an exact IPv4 address', () => {
    expect(isIpAllowed('203.0.113.5', ['203.0.113.5'])).toBe(true)
    expect(isIpAllowed('203.0.113.6', ['203.0.113.5'])).toBe(false)
  })

  it('strips IPv4-mapped IPv6 prefixes before matching', () => {
    expect(isIpAllowed('::ffff:203.0.113.5', ['203.0.113.5'])).toBe(true)
  })

  it('matches addresses inside a CIDR range', () => {
    expect(isIpAllowed('10.0.5.20', ['10.0.0.0/16'])).toBe(true)
    expect(isIpAllowed('10.1.5.20', ['10.0.0.0/16'])).toBe(false)
  })

  it('honours a /24 boundary', () => {
    expect(isIpAllowed('192.168.1.50', ['192.168.1.0/24'])).toBe(true)
    expect(isIpAllowed('192.168.2.50', ['192.168.1.0/24'])).toBe(false)
  })

  it('returns false for an empty allowlist', () => {
    expect(isIpAllowed('8.8.8.8', [])).toBe(false)
  })

  it('checks every entry in the allowlist', () => {
    const allow = ['203.0.113.5', '10.0.0.0/8']
    expect(isIpAllowed('10.255.0.1', allow)).toBe(true)
    expect(isIpAllowed('203.0.113.5', allow)).toBe(true)
    expect(isIpAllowed('8.8.8.8', allow)).toBe(false)
  })
})
