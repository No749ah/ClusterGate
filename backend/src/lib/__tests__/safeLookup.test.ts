import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the dns module so safeLookup can be exercised without real resolution.
const lookupMock = vi.fn()
vi.mock('dns', async (importOriginal) => {
  const actual = await importOriginal<typeof import('dns')>()
  return { ...actual, lookup: (...args: any[]) => lookupMock(...args) }
})

import { safeLookup } from '../security'

function resolveWith(address: string, family: number) {
  // dns.lookup may be called as (hostname, cb) or (hostname, opts, cb); the
  // module also sees unrelated internal calls, so only answer real lookups.
  lookupMock.mockImplementation((...args: any[]) => {
    const cb = args[args.length - 1]
    if (typeof cb === 'function') cb(null, address, family)
  })
}

function callSafeLookup(hostname: string): Promise<{ err: Error | null; address: any }> {
  return new Promise((resolve) => {
    safeLookup(hostname, {}, (err, address) => resolve({ err, address }))
  })
}

describe('safeLookup', () => {
  beforeEach(() => lookupMock.mockReset())

  it('passes through normal IPv4 resolutions', async () => {
    resolveWith('93.184.216.34', 4)
    const { err, address } = await callSafeLookup('example.com')
    expect(err).toBeNull()
    expect(address).toBe('93.184.216.34')
  })

  it('blocks resolution to an IPv4 metadata IP', async () => {
    resolveWith('169.254.169.254', 4)
    const { err } = await callSafeLookup('rebind.attacker.example')
    expect(err?.message).toMatch(/Blocked SSRF/)
  })

  it('blocks resolution to an IPv6 link-local address', async () => {
    resolveWith('fe80::1', 6)
    const { err } = await callSafeLookup('rebind.attacker.example')
    expect(err?.message).toMatch(/Blocked SSRF/)
  })

  it('blocks resolution to an IPv6 unique-local address (AWS IMDSv6)', async () => {
    resolveWith('fd00:ec2::254', 6)
    const { err } = await callSafeLookup('rebind.attacker.example')
    expect(err?.message).toMatch(/Blocked SSRF/)
  })

  it('blocks resolution to an IPv4-mapped IPv6 metadata address', async () => {
    resolveWith('::ffff:169.254.169.254', 6)
    const { err } = await callSafeLookup('rebind.attacker.example')
    expect(err?.message).toMatch(/Blocked SSRF/)
  })

  it('passes through normal IPv6 resolutions', async () => {
    resolveWith('2606:4700:4700::1111', 6)
    const { err, address } = await callSafeLookup('example.com')
    expect(err).toBeNull()
    expect(address).toBe('2606:4700:4700::1111')
  })
})
