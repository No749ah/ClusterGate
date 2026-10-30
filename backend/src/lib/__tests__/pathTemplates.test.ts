import { describe, it, expect } from 'vitest'
import { BUILTIN_PATH_TEMPLATES } from '../pathTemplates'
import { validatePathPattern, normalizePathPattern, isPathAllowed } from '../pathAllowlist'

describe('built-in path templates', () => {
  it('have unique builtin:* ids', () => {
    const ids = BUILTIN_PATH_TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id.startsWith('builtin:')).toBe(true)
  })

  it('only contain valid, normalised, unique patterns', () => {
    for (const t of BUILTIN_PATH_TEMPLATES) {
      expect(t.paths.length).toBeGreaterThan(0)
      expect(new Set(t.paths).size).toBe(t.paths.length)
      for (const p of t.paths) {
        expect(validatePathPattern(p), `${t.id} ${p}`).toBeNull()
        expect(normalizePathPattern(p)).toBe(p)
      }
    }
  })

  it('OpenAI inference exposes chat but not files', () => {
    const t = BUILTIN_PATH_TEMPLATES.find((x) => x.id === 'builtin:openai-inference')!
    expect(isPathAllowed('/v1/chat/completions', t.paths)).toBe(true)
    expect(isPathAllowed('/v1/models/gpt-4o', t.paths)).toBe(true)
    expect(isPathAllowed('/v1/files', t.paths)).toBe(false)
  })

  it('Ollama inference keeps model management closed', () => {
    const t = BUILTIN_PATH_TEMPLATES.find((x) => x.id === 'builtin:ollama-inference')!
    expect(isPathAllowed('/api/chat', t.paths)).toBe(true)
    for (const p of ['/api/pull', '/api/delete', '/api/push', '/api/create', '/api/copy']) {
      expect(isPathAllowed(p, t.paths)).toBe(false)
    }
  })

  it('Gemini allows model:method style paths', () => {
    const t = BUILTIN_PATH_TEMPLATES.find((x) => x.id === 'builtin:gemini')!
    expect(isPathAllowed('/v1beta/models/gemini-2.5-pro:generateContent', t.paths)).toBe(true)
  })
})
