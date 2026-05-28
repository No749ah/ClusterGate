import { describe, it, expect } from 'vitest'
import { looksLikeN8n, isN8nTarget } from '../targetDetect'

describe('looksLikeN8n', () => {
  it('detects n8n by hostname or webhook path', () => {
    expect(looksLikeN8n('https://n8n.example.com/x')).toBe(true)
    expect(looksLikeN8n('https://n8n-api.n8n.svc.cluster.local:5678/webhook/abc')).toBe(true)
    expect(looksLikeN8n('http://svc.local/webhook/123')).toBe(true)
  })

  it('returns false for unrelated targets and invalid URLs', () => {
    expect(looksLikeN8n('https://api.example.com/v1/chat')).toBe(false)
    expect(looksLikeN8n('not a url')).toBe(false)
  })
})

describe('isN8nTarget', () => {
  it('treats explicit N8N as n8n regardless of URL', () => {
    expect(isN8nTarget('N8N', 'https://api.example.com/v1')).toBe(true)
  })

  it('falls back to the URL heuristic otherwise', () => {
    expect(isN8nTarget('GENERIC', 'https://n8n.example.com/webhook/x')).toBe(true)
    expect(isN8nTarget(undefined, 'https://api.example.com/v1')).toBe(false)
    expect(isN8nTarget('GENERIC', 'https://api.example.com/v1')).toBe(false)
  })
})
