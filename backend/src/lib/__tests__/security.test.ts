import { describe, it, expect } from 'vitest'
import { isMetadataIp, isSafeRegex } from '../security'

describe('isMetadataIp', () => {
  it('blocks the whole 169.254.0.0/16 link-local range', () => {
    expect(isMetadataIp('169.254.169.254')).toBe(true) // AWS/GCP/Azure
    expect(isMetadataIp('169.254.170.2')).toBe(true) // ECS
    expect(isMetadataIp('169.254.0.1')).toBe(true)
    expect(isMetadataIp('169.254.255.255')).toBe(true)
  })

  it('blocks known provider metadata IPs', () => {
    expect(isMetadataIp('100.100.100.200')).toBe(true) // Alibaba/Oracle/DO
  })

  it('allows normal/internal addresses', () => {
    expect(isMetadataIp('10.0.0.5')).toBe(false)
    expect(isMetadataIp('192.168.1.10')).toBe(false)
    expect(isMetadataIp('8.8.8.8')).toBe(false)
    expect(isMetadataIp('169.253.1.1')).toBe(false)
    expect(isMetadataIp('not-an-ip')).toBe(false)
  })
})

describe('isSafeRegex', () => {
  it('rejects nested-quantifier (star-height) backtracking patterns', () => {
    expect(isSafeRegex('(a+)+$')).toBe(false)
    expect(isSafeRegex('(a*)*b')).toBe(false)
    expect(isSafeRegex('(.*a){10}')).toBe(false)
  })

  it('rejects invalid and overly long patterns', () => {
    expect(isSafeRegex('([')).toBe(false)
    expect(isSafeRegex('a'.repeat(600))).toBe(false)
  })

  it('accepts simple safe patterns', () => {
    expect(isSafeRegex('^/api/v1/')).toBe(true)
    expect(isSafeRegex('foo-[0-9]+')).toBe(true)
  })
})
