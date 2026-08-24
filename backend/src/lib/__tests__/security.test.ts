import { describe, it, expect } from 'vitest'
import { createHmac } from 'crypto'
import { isMetadataIp, isSafeRegex, validateWebhookSignature, timingSafeCompare } from '../security'

const sign = (body: string, secret: string) =>
  `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`

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

  it('blocks IPv6 link-local (fe80::/10)', () => {
    expect(isMetadataIp('fe80::1')).toBe(true)
    expect(isMetadataIp('FE80::1')).toBe(true)
    expect(isMetadataIp('fe80::1%eth0')).toBe(true) // zone index stripped
    expect(isMetadataIp('febf:ffff::1')).toBe(true) // end of the /10
    expect(isMetadataIp('fec0::1')).toBe(false) // outside the /10
  })

  it('blocks IPv6 unique-local (fc00::/7), incl. the AWS IPv6 metadata IP', () => {
    expect(isMetadataIp('fd00:ec2::254')).toBe(true) // AWS IMDS over IPv6
    expect(isMetadataIp('fc00::1')).toBe(true)
    expect(isMetadataIp('fdff:ffff::1')).toBe(true)
    expect(isMetadataIp('fb00::1')).toBe(false) // outside the /7
  })

  it('blocks IPv4-mapped IPv6 forms of metadata IPs', () => {
    expect(isMetadataIp('::ffff:169.254.169.254')).toBe(true)
    expect(isMetadataIp('::ffff:a9fe:a9fe')).toBe(true) // hex form of 169.254.169.254
    expect(isMetadataIp('::ffff:100.100.100.200')).toBe(true)
    expect(isMetadataIp('::ffff:8.8.8.8')).toBe(false)
  })

  it('handles bracketed IPv6 literals as produced by URL.hostname', () => {
    expect(isMetadataIp('[::ffff:169.254.169.254]')).toBe(true)
    expect(isMetadataIp('[fd00:ec2::254]')).toBe(true)
    expect(isMetadataIp('[2001:db8::1]')).toBe(false)
  })

  it('allows normal IPv6 addresses', () => {
    expect(isMetadataIp('::1')).toBe(false)
    expect(isMetadataIp('2001:db8::1')).toBe(false)
    expect(isMetadataIp('2606:4700:4700::1111')).toBe(false)
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

describe('validateWebhookSignature', () => {
  const secret = 'whsec_test_secret'
  const body = '{"event":"push","id":42}'

  it('accepts a correct sha256 HMAC signature', () => {
    expect(validateWebhookSignature(body, secret, sign(body, secret))).toBe(true)
  })

  it('rejects a signature produced with the wrong secret', () => {
    expect(validateWebhookSignature(body, secret, sign(body, 'wrong-secret'))).toBe(false)
  })

  it('rejects a signature when the body has been tampered with', () => {
    const good = sign(body, secret)
    expect(validateWebhookSignature('{"event":"push","id":43}', secret, good)).toBe(false)
  })

  it('rejects a missing or malformed signature', () => {
    expect(validateWebhookSignature(body, secret, '')).toBe(false)
    expect(validateWebhookSignature(body, secret, 'not-a-signature')).toBe(false)
    // bare hex without the sha256= prefix must not validate
    expect(validateWebhookSignature(body, secret, createHmac('sha256', secret).update(body).digest('hex'))).toBe(false)
  })
})

describe('timingSafeCompare', () => {
  it('returns true for identical strings', () => {
    expect(timingSafeCompare('abc123', 'abc123')).toBe(true)
  })

  it('returns false for different strings, including length mismatches', () => {
    expect(timingSafeCompare('abc123', 'abc124')).toBe(false)
    expect(timingSafeCompare('short', 'a-much-longer-value')).toBe(false)
  })
})
