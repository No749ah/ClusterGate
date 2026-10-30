import { describe, it, expect } from 'vitest'
import { isPathAllowed, routeSubPath, validatePathPattern, normalizePathPattern } from '../pathAllowlist'

describe('isPathAllowed', () => {
  const allow = ['/foo1', '/foo2']

  it('allows everything when the allowlist is empty', () => {
    expect(isPathAllowed('/anything/at/all', [])).toBe(true)
    expect(isPathAllowed('/x', null)).toBe(true)
  })

  it('allows listed paths and rejects others', () => {
    expect(isPathAllowed('/foo1', allow)).toBe(true)
    expect(isPathAllowed('/foo2', allow)).toBe(true)
    expect(isPathAllowed('/foo3', allow)).toBe(false)
    expect(isPathAllowed('/', allow)).toBe(false)
  })

  it('treats exact entries as exact (no sub-paths, no prefix overlap)', () => {
    expect(isPathAllowed('/foo1/', allow)).toBe(true)
    expect(isPathAllowed('/foo1/bar', allow)).toBe(false)
    expect(isPathAllowed('/foo10', allow)).toBe(false)
  })

  it('supports a trailing /* for a whole subtree', () => {
    const list = ['/v1/models/*']
    expect(isPathAllowed('/v1/models', list)).toBe(true)
    expect(isPathAllowed('/v1/models/gpt-4o', list)).toBe(true)
    expect(isPathAllowed('/v1/models/a/b', list)).toBe(true)
    expect(isPathAllowed('/v1/modelsx', list)).toBe(false)
  })

  it('supports * as a single segment in the middle', () => {
    const list = ['/v1/threads/*/runs']
    expect(isPathAllowed('/v1/threads/abc/runs', list)).toBe(true)
    expect(isPathAllowed('/v1/threads/abc/def/runs', list)).toBe(false)
    expect(isPathAllowed('/v1/threads/abc/messages', list)).toBe(false)
  })

  it('accepts entries without a leading slash or with a trailing slash', () => {
    expect(isPathAllowed('/foo1', ['foo1/'])).toBe(true)
  })

  it('allows the base path itself only via "/"', () => {
    expect(isPathAllowed('/', ['/'])).toBe(true)
    expect(isPathAllowed('/foo1', ['/'])).toBe(false)
  })

  it('rejects traversal and ambiguous paths', () => {
    expect(isPathAllowed('/foo1/../foo3', ['/foo1/*'])).toBe(false)
    expect(isPathAllowed('/foo1/%2e%2e/foo3', ['/foo1/*'])).toBe(false)
    expect(isPathAllowed('/foo1%2F..%2Ffoo3', ['/foo1/*'])).toBe(false)
    expect(isPathAllowed('/foo1/./x', ['/foo1/*'])).toBe(false)
    expect(isPathAllowed('/foo1\\..\\foo3', ['/foo1/*'])).toBe(false)
    expect(isPathAllowed('//foo1', allow)).toBe(false)
    expect(isPathAllowed('/foo1/%E0%A4%A', ['/foo1/*'])).toBe(false)
  })

  it('matches percent-encoded segments by their decoded value', () => {
    expect(isPathAllowed('/caf%C3%A9', ['/café'])).toBe(true)
    expect(isPathAllowed('/café', ['/caf%C3%A9'])).toBe(true)
  })

  it('is case-sensitive', () => {
    expect(isPathAllowed('/FOO1', allow)).toBe(false)
  })
})

describe('routeSubPath', () => {
  it('strips the wildcard base', () => {
    expect(routeSubPath('/r/foo/*', '/r/foo/foo1')).toBe('/foo1')
    expect(routeSubPath('/r/foo/*', '/r/foo')).toBe('/')
    expect(routeSubPath('/r/foo', '/r/foo/a/b')).toBe('/a/b')
  })
})

describe('validatePathPattern', () => {
  it('accepts normal patterns', () => {
    for (const p of ['/', '/v1/chat/completions', 'v1/models/*', '/v1/threads/*/runs']) {
      expect(validatePathPattern(p)).toBeNull()
    }
  })

  it('rejects bad patterns', () => {
    for (const p of ['/a/../b', '/a b', '/a?x=1', '/a*', '/a//b', '/a\\b']) {
      expect(validatePathPattern(p)).not.toBeNull()
    }
  })

  it('normalizes slashes', () => {
    expect(normalizePathPattern(' v1/models/ ')).toBe('/v1/models')
  })
})
