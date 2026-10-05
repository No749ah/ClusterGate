import zlib from 'zlib'

/**
 * Tee for streamed proxy responses: records a bounded prefix of the upstream
 * body for the request log while the stream is piped to the client untouched.
 *
 * `push()` runs on every chunk of the hot path, so it only copies bytes until
 * the capture budget is spent and counts the rest. Decoding (decompression,
 * binary detection, UTF-8) happens once in `finish()`, after the fact.
 */

// Compressed prefixes expand, so capture a larger slice of raw bytes when the
// upstream compresses; the decoded text is still cut to `limit`.
const COMPRESSED_RAW_FACTOR = 4

export const TRUNCATION_MARKER = '[… truncated'

export type CaptureEndState = 'complete' | 'open' | 'aborted'

const END_STATE_TEXT: Record<CaptureEndState, string> = {
  complete: 'complete',
  open: 'stream still open',
  aborted: 'stream aborted',
}

export interface StreamCaptureResult {
  body: string
  truncated: boolean
  totalBytes: number
  binary: boolean
}

export interface StreamCaptureOptions {
  /** Upstream Content-Type header, if any */
  contentType?: string
  /** Upstream Content-Encoding header, if any (the stream path does not decompress) */
  contentEncoding?: string
  /** Max characters of body to keep — matches the buffered path's log cap */
  limit: number
}

const TEXT_TYPES = [
  /^text\//,
  /^application\/(json|x-ndjson|ndjson|jsonl|x-jsonlines|xml|javascript|ecmascript|graphql|x-www-form-urlencoded|problem\+json|problem\+xml)\b/,
  /\+(json|xml)\b/,
]

export function isTextContentType(contentType: string | undefined): boolean | undefined {
  if (!contentType) return undefined
  const ct = contentType.toLowerCase().trim()
  return TEXT_TYPES.some((re) => re.test(ct))
}

// No Content-Type: treat as text only if the prefix has no NUL / control bytes
function looksLikeText(buf: Buffer): boolean {
  const n = Math.min(buf.length, 1024)
  for (let i = 0; i < n; i++) {
    const b = buf[i]
    if (b === 0) return false
    if (b < 0x09 || (b > 0x0d && b < 0x20)) return false
  }
  return true
}

function createDecoder(encoding: string): zlib.Gunzip | zlib.Inflate | zlib.InflateRaw | zlib.BrotliDecompress | null {
  // Sync flush so a truncated prefix still yields everything decodable so far
  const flush = { finishFlush: zlib.constants.Z_SYNC_FLUSH }
  if (encoding === 'gzip' || encoding === 'x-gzip') return zlib.createGunzip(flush)
  if (encoding === 'deflate') return zlib.createInflate(flush)
  if (encoding === 'deflate-raw') return zlib.createInflateRaw(flush)
  if (encoding === 'br') return zlib.createBrotliDecompress({ finishFlush: zlib.constants.BROTLI_OPERATION_FLUSH })
  return null
}

function inflatePrefix(raw: Buffer, encoding: string, maxOutput: number): Promise<Buffer | null> {
  const decoder = createDecoder(encoding)
  if (!decoder) return Promise.resolve(null) // unknown encoding
  return new Promise((resolve) => {
    const out: Buffer[] = []
    let size = 0
    let settled = false
    const settle = (value: Buffer | null) => {
      if (settled) return
      settled = true
      decoder.destroy()
      resolve(value)
    }
    decoder.on('data', (chunk: Buffer) => {
      out.push(chunk)
      size += chunk.length
      // Enough for the preview — stop inflating the rest
      if (size >= maxOutput) settle(Buffer.concat(out).subarray(0, maxOutput))
    })
    decoder.on('end', () => settle(Buffer.concat(out)))
    // Corrupt data after a valid prefix: keep what was decoded
    decoder.on('error', () => settle(size > 0 ? Buffer.concat(out) : null))
    decoder.end(raw)
  })
}

async function decode(raw: Buffer, encoding: string | undefined, maxOutput: number): Promise<Buffer | null> {
  const enc = (encoding || '').toLowerCase().trim()
  if (!enc || enc === 'identity') return raw
  const decoded = await inflatePrefix(raw, enc, maxOutput)
  // zlib-wrapped vs raw deflate is ambiguous in practice; try raw as fallback
  if (decoded === null && enc === 'deflate') return inflatePrefix(raw, 'deflate-raw', maxOutput)
  return decoded
}

export class StreamCapture {
  private chunks: Buffer[] = []
  private captured = 0
  private total = 0
  private readonly rawBudget: number
  private readonly compressed: boolean

  constructor(private readonly opts: StreamCaptureOptions) {
    const enc = (opts.contentEncoding || '').toLowerCase().trim()
    this.compressed = !!enc && enc !== 'identity'
    // UTF-8 is at most 4 bytes/char; capturing `limit` bytes of identity
    // content always covers `limit` chars of ASCII-heavy protocol text.
    this.rawBudget = this.compressed ? opts.limit * COMPRESSED_RAW_FACTOR : opts.limit
  }

  push(chunk: Buffer | string): void {
    const len = typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length
    this.total += len
    const remaining = this.rawBudget - this.captured
    if (remaining <= 0) return
    const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
    const slice = buf.length <= remaining ? buf : buf.subarray(0, remaining)
    // Copy so we never pin a large upstream chunk in memory
    this.chunks.push(Buffer.from(slice))
    this.captured += slice.length
  }

  /** True once the capture budget is spent; later chunks are only counted */
  get full(): boolean {
    return this.captured >= this.rawBudget
  }

  get totalBytes(): number {
    return this.total
  }

  /**
   * Decode what was captured. `state` says how the capture ended: the stream
   * completed, is still open (budget spent, so the log is written early and the
   * total size is unknown), or was aborted (client gone or upstream error).
   */
  async finish(state: CaptureEndState = 'complete'): Promise<StreamCaptureResult> {
    const complete = state === 'complete'
    const raw = Buffer.concat(this.chunks)
    const total = this.total
    const limit = this.opts.limit
    const typeIsText = isTextContentType(this.opts.contentType)

    if (total === 0) return { body: '', truncated: false, totalBytes: 0, binary: false }

    const rawTruncated = !complete || total > this.captured
    const maxDecoded = limit * 4
    const decoded = await decode(raw, this.opts.contentEncoding, maxDecoded)

    if (decoded === null) {
      return {
        body: `[stream: ${total} bytes, ${this.opts.contentEncoding} encoded — not decodable for preview]`,
        truncated: rawTruncated,
        totalBytes: total,
        binary: true,
      }
    }

    const binary = typeIsText === false || (typeIsText === undefined && !looksLikeText(decoded))
    if (binary) {
      return {
        body: `[binary stream: ${complete ? `${total} bytes` : `${total}+ bytes, ${END_STATE_TEXT[state]}`}${this.opts.contentType ? `, ${this.opts.contentType}` : ''}]`,
        truncated: false,
        totalBytes: total,
        binary: true,
      }
    }

    let text = decoded.toString('utf8')
    let truncated = rawTruncated || decoded.length >= maxDecoded
    if (text.length > limit) {
      text = text.slice(0, limit)
      truncated = true
    }
    // A multi-byte char split at the cut decodes to U+FFFD — drop it
    if (truncated) text = text.replace(/�+$/, '')

    if (truncated) {
      const shown = Buffer.byteLength(text)
      text += complete
        ? `\n\n${TRUNCATION_MARKER}: showing first ${shown} of ${total} bytes${this.compressed ? ' (compressed size)' : ''}]`
        : `\n\n${TRUNCATION_MARKER}: showing first ${shown} bytes, ${END_STATE_TEXT[state]}]`
    }
    return { body: text, truncated, totalBytes: total, binary: false }
  }
}
