import { describe, it, expect } from 'vitest'
import zlib from 'zlib'
import { StreamCapture, isTextContentType, TRUNCATION_MARKER } from '../streamCapture'

function feed(capture: StreamCapture, data: Buffer, chunkSize = 7) {
  for (let i = 0; i < data.length; i += chunkSize) capture.push(data.subarray(i, i + chunkSize))
}

describe('StreamCapture', () => {
  it('captures a small SSE stream verbatim', async () => {
    const sse = 'event: message\ndata: {"content":"Hel"}\n\ndata: {"content":"lo"}\n\ndata: [DONE]\n\n'
    const c = new StreamCapture({ contentType: 'text/event-stream; charset=utf-8', limit: 5000 })
    feed(c, Buffer.from(sse))
    const r = await c.finish('complete')
    expect(r).toEqual({ body: sse, truncated: false, totalBytes: Buffer.byteLength(sse), binary: false })
  })

  it('caps at the limit, counts all bytes and marks truncation', async () => {
    const payload = Buffer.from('x'.repeat(12000))
    const c = new StreamCapture({ contentType: 'application/x-ndjson', limit: 5000 })
    feed(c, payload, 1024)
    expect(c.full).toBe(true)
    expect(c.totalBytes).toBe(12000)
    const r = await c.finish('complete')
    expect(r.truncated).toBe(true)
    expect(r.body.startsWith('x'.repeat(5000))).toBe(true)
    expect(r.body).toContain(`${TRUNCATION_MARKER}: showing first 5000 of 12000 bytes]`)
  })

  it('says the stream is still open when flushed early', async () => {
    const c = new StreamCapture({ contentType: 'text/plain', limit: 10 })
    c.push(Buffer.from('0123456789abcdef'))
    const r = await c.finish('open')
    expect(r.body).toBe(`0123456789\n\n${TRUNCATION_MARKER}: showing first 10 bytes, stream still open]`)
  })

  it('does not keep bytes past the budget', () => {
    const c = new StreamCapture({ contentType: 'text/plain', limit: 4 })
    c.push(Buffer.from('abcdef'))
    c.push(Buffer.from('ghij'))
    expect((c as any).captured).toBe(4)
    expect(c.totalBytes).toBe(10)
  })

  it('decompresses gzip-encoded streams (the stream path forwards them compressed)', async () => {
    const text = 'data: {"delta":"hi"}\n\n'.repeat(50)
    const c = new StreamCapture({ contentType: 'text/event-stream', contentEncoding: 'gzip', limit: 5000 })
    feed(c, zlib.gzipSync(text))
    const r = await c.finish('complete')
    expect(r.body).toBe(text)
    expect(r.truncated).toBe(false)
  })

  it('decodes a truncated gzip prefix as far as possible', async () => {
    const text = Array.from({ length: 4000 }, (_, i) => `line ${i}`).join('\n')
    const gz = zlib.gzipSync(text)
    const c = new StreamCapture({ contentType: 'text/plain', contentEncoding: 'gzip', limit: 100 })
    feed(c, gz, 64)
    const r = await c.finish('complete')
    expect(r.truncated).toBe(true)
    expect(r.body.startsWith('line 0\nline 1\n')).toBe(true)
    expect(r.body).toContain('(compressed size)')
  })

  it('decompresses brotli', async () => {
    const text = '{"type":"item","content":"ok"}\n'.repeat(10)
    const c = new StreamCapture({ contentType: 'application/x-ndjson', contentEncoding: 'br', limit: 5000 })
    feed(c, zlib.brotliCompressSync(Buffer.from(text)))
    expect((await c.finish('complete')).body).toBe(text)
  })

  it('skips binary content types', async () => {
    const c = new StreamCapture({ contentType: 'application/octet-stream', limit: 5000 })
    c.push(Buffer.from([0, 1, 2, 3, 255]))
    const r = await c.finish('complete')
    expect(r.binary).toBe(true)
    expect(r.body).toBe('[binary stream: 5 bytes, application/octet-stream]')
  })

  it('sniffs binary when no content type is given', async () => {
    const bin = new StreamCapture({ limit: 5000 })
    bin.push(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]))
    expect((await bin.finish('complete')).binary).toBe(true)

    const txt = new StreamCapture({ limit: 5000 })
    txt.push(Buffer.from('plain text\n'))
    expect((await txt.finish('complete')).body).toBe('plain text\n')
  })

  it('drops a multi-byte char split at the cut', async () => {
    const c = new StreamCapture({ contentType: 'text/plain; charset=utf-8', limit: 3 })
    c.push(Buffer.from('ab€€'))
    const r = await c.finish('complete')
    expect(r.body.startsWith('ab\n\n')).toBe(true)
  })

  it('returns an empty body for an empty stream', async () => {
    const r = await new StreamCapture({ contentType: 'text/plain', limit: 10 }).finish('complete')
    expect(r.body).toBe('')
  })
})

describe('isTextContentType', () => {
  it.each([
    ['text/event-stream', true],
    ['application/json; charset=utf-8', true],
    ['application/x-ndjson', true],
    ['application/vnd.api+json', true],
    ['application/octet-stream', false],
    ['image/png', false],
    ['audio/mpeg', false],
  ])('%s → %s', (ct, expected) => {
    expect(isTextContentType(ct)).toBe(expected)
  })
  it('is undefined without a content type', () => {
    expect(isTextContentType(undefined)).toBeUndefined()
  })
})
