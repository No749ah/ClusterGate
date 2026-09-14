import { describe, it, expect } from 'vitest'
import { testPathAllowed } from '../security'

describe('testPathAllowed — route test panel path scoping', () => {
  it('accepts the public path itself and sub-paths of a wildcard route', () => {
    expect(testPathAllowed('/r/llm/*', '/r/llm')).toBe(true)
    expect(testPathAllowed('/r/llm/*', '/r/llm/v1/chat/completions')).toBe(true)
    expect(testPathAllowed('/r/llm/*', '/r/llm/v1/models?limit=5')).toBe(true)
  })

  it('accepts the exact path and sub-paths of a non-wildcard route (live proxy prefix-matches too)', () => {
    expect(testPathAllowed('/r/n8n', '/r/n8n')).toBe(true)
    expect(testPathAllowed('/r/n8n', '/r/n8n/hook')).toBe(true)
  })

  it('rejects paths outside the route (other routes, sibling prefixes, target root)', () => {
    expect(testPathAllowed('/r/n8n', '/r/other')).toBe(false)
    expect(testPathAllowed('/r/n8n', '/r/n8nx')).toBe(false)
    expect(testPathAllowed('/r/n8n', '/')).toBe(false)
    expect(testPathAllowed('/r/n8n', '/admin')).toBe(false)
  })

  it('rejects traversal and encoded separators an upstream might normalize', () => {
    expect(testPathAllowed('/r/n8n/*', '/r/n8n/../admin')).toBe(false)
    expect(testPathAllowed('/r/n8n/*', '/r/n8n/x/..')).toBe(false)
    expect(testPathAllowed('/r/n8n/*', '/r/n8n/%2e%2e/admin')).toBe(false)
    expect(testPathAllowed('/r/n8n/*', '/r/n8n/%2Fadmin')).toBe(false)
    expect(testPathAllowed('/r/n8n/*', '/r/n8n/\\admin')).toBe(false)
    expect(testPathAllowed('/r/n8n/*', '/r/n8n//admin')).toBe(false)
  })

  it('rejects non-string or relative input', () => {
    expect(testPathAllowed('/r/n8n', undefined)).toBe(false)
    expect(testPathAllowed('/r/n8n', 42)).toBe(false)
    expect(testPathAllowed('/r/n8n', 'r/n8n')).toBe(false)
  })
})
