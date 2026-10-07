// Readable text from streamed bodies: OpenAI-style SSE (data: {...} frames
// with choices[].delta.content), n8n-style NDJSON ({type:'item', content:'...'})
// and plain text, so views show the assembled message instead of frames.

// Pull the text field out of one parsed frame
function textOfFrame(obj: unknown): string {
  if (!obj || typeof obj !== 'object') return ''
  const o = obj as Record<string, any>
  // OpenAI chat.completion chunks (streaming) and full responses
  const choice = Array.isArray(o.choices) ? o.choices[0] : undefined
  if (typeof choice?.delta?.content === 'string') return choice.delta.content
  if (typeof choice?.message?.content === 'string') return choice.message.content
  if (typeof choice?.text === 'string') return choice.text
  if (typeof o.content === 'string') return o.content
  if (typeof o.delta === 'string') return o.delta
  if (typeof o.text === 'string') return o.text
  return ''
}

// Extract human-readable text from one streamed line (used live by the test panel)
export function extractStreamText(line: string): string {
  let trimmed = line.trim()
  if (!trimmed) return ''
  // SSE framing: strip the field prefix; comments/other fields carry no text
  if (trimmed.startsWith('data:')) trimmed = trimmed.slice(5).trim()
  else if (/^(event|id|retry):/.test(trimmed)) return ''
  if (!trimmed || trimmed === '[DONE]') return ''
  try {
    return textOfFrame(JSON.parse(trimmed))
  } catch {
    return line
  }
}

// Marker the backend appends when a logged body was cut
export const TRUNCATION_MARKER = '[… truncated'

/** Split a logged body into its content and the backend's truncation note */
export function splitTruncation(raw: string): { body: string; note: string | null } {
  const at = raw.lastIndexOf('\n\n' + TRUNCATION_MARKER)
  if (at < 0) return { body: raw, note: null }
  const note = raw.slice(at + 2).trim().replace(/^\[…\s*/, '').replace(/\]$/, '')
  return { body: raw.slice(0, at), note: note.charAt(0).toUpperCase() + note.slice(1) }
}

// Best effort for a frame cut off mid-way by the log limit: recover the text
// field written so far rather than showing a raw JSON fragment.
function textOfPartialFrame(fragment: string): string {
  const m = fragment.match(/"(?:content|delta|text)"\s*:\s*"((?:[^"\\]|\\.)*)(\\)?$/)
    ?? fragment.match(/"(?:content|delta|text)"\s*:\s*"((?:[^"\\]|\\.)*)"/)
  if (!m) return ''
  try {
    return JSON.parse(`"${m[1]}"`)
  } catch {
    return ''
  }
}

// Top-level JSON objects in a string, newline-delimited or glued together
// ("}{"). Anything after the last complete object is returned as `rest`.
function scanObjects(s: string): { objects: string[]; rest: string; stray: boolean } {
  const objects: string[] = []
  let depth = 0
  let start = -1
  let inString = false
  let escaped = false
  let stray = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inString) {
      if (escaped) escaped = false
      else if (c === '\\') escaped = true
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') { if (depth > 0) inString = true; else stray = true; continue }
    if (c === '{') {
      if (depth === 0) start = i
      depth++
    } else if (c === '}') {
      if (depth === 0) { stray = true; continue }
      depth--
      if (depth === 0) {
        objects.push(s.slice(start, i + 1))
        start = -1
      }
    } else if (depth === 0 && !/\s/.test(c)) {
      stray = true
    }
  }
  return { objects, rest: start >= 0 ? s.slice(start) : '', stray }
}

/**
 * Assemble the readable text of a whole logged SSE / NDJSON body. Returns ''
 * when the body is not framed or no frame carried extractable text.
 */
export function assembleStreamText(raw: string): string {
  const { body } = splitTruncation(raw)

  // SSE: one field per line; only data lines carry content
  if (/^(data|event|id|retry):/m.test(body)) {
    const dataLines = body.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('data:'))
    let text = ''
    dataLines.forEach((line, i) => {
      const payload = line.slice(5).trim()
      if (!payload || payload === '[DONE]') return
      try {
        text += textOfFrame(JSON.parse(payload))
      } catch {
        // A JSON frame cut by the log limit (last line) vs. a plain-text token
        text += payload.startsWith('{') ? (i === dataLines.length - 1 ? textOfPartialFrame(payload) : '') : payload
      }
    })
    return text
  }

  // NDJSON / concatenated JSON objects
  const { objects, rest, stray } = scanObjects(body)
  if (objects.length === 0 || stray) return ''
  let text = ''
  for (const frame of objects) {
    try {
      text += textOfFrame(JSON.parse(frame))
    } catch {
      // malformed frame — skip it
    }
  }
  if (rest) text += textOfPartialFrame(rest)
  return text
}

/** Several JSON objects in a row (NDJSON or glued "}{") — a framed stream body */
export function looksLikeJsonFrames(raw: string): boolean {
  const { objects, stray } = scanObjects(splitTruncation(raw).body)
  return !stray && objects.length >= 2
}

export function isStreamContentType(contentType: string | undefined): boolean {
  if (!contentType) return false
  const ct = contentType.toLowerCase()
  return ct.includes('text/event-stream') || ct.includes('ndjson') || ct.includes('jsonl')
}
