import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { partialUpdate } from '../zodPartial'

const schema = z.object({
  name: z.string().min(1),
  timeout: z.number().int().default(30000),
  headers: z.record(z.string(), z.string()).default({}),
  note: z.string().nullable().default(null),
  tags: z.array(z.string()).optional(),
})

describe('partialUpdate', () => {
  it('leaves omitted fields undefined instead of applying defaults', () => {
    expect(partialUpdate(schema).parse({ name: 'x' })).toEqual({ name: 'x' })
  })

  it('keeps validation of the fields that are sent', () => {
    expect(partialUpdate(schema).parse({ timeout: 5, note: null })).toEqual({ timeout: 5, note: null })
    expect(() => partialUpdate(schema).parse({ name: '' })).toThrow()
    expect(() => partialUpdate(schema).parse({ timeout: 'x' })).toThrow()
  })
})
