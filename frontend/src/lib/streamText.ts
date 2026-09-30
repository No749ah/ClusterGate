// Extract human-readable text from a streamed chunk. Handles OpenAI-style SSE
// (data: {...} frames with choices[].delta.content), n8n-style NDJSON
// ({type:'item', content:'...'}) and plain text, so views show the
// assembled message rather than raw protocol frames.
export function extractStreamText(line: string): string {
  let trimmed = line.trim()
  if (!trimmed) return ''
  // SSE framing: strip the field prefix; comments/other fields carry no text
  if (trimmed.startsWith('data:')) trimmed = trimmed.slice(5).trim()
  else if (/^(event|id|retry):/.test(trimmed)) return ''
  if (!trimmed || trimmed === '[DONE]') return ''
  try {
    const obj = JSON.parse(trimmed)
    // OpenAI chat.completion chunks (streaming) and full responses
    const choice = Array.isArray(obj.choices) ? obj.choices[0] : undefined
    if (typeof choice?.delta?.content === 'string') return choice.delta.content
    if (typeof choice?.message?.content === 'string') return choice.message.content
    if (typeof choice?.text === 'string') return choice.text
    if (typeof obj.content === 'string') return obj.content
    if (typeof obj.delta === 'string') return obj.delta
    if (typeof obj.text === 'string') return obj.text
    return ''
  } catch {
    return line
  }
}

// Marker the backend appends when a logged stream body was cut
export const TRUNCATION_MARKER = '[… truncated'

// Assemble the readable text of a whole logged SSE / NDJSON body. Returns ''
// when no frame carried extractable text.
export function assembleStreamText(raw: string): string {
  const markerAt = raw.lastIndexOf('\n\n' + TRUNCATION_MARKER)
  const body = markerAt >= 0 ? raw.slice(0, markerAt) : raw
  let text = ''
  let structured = false
  for (const line of body.split('\n')) {
    const t = line.trim()
    if (!t) continue
    // Only assemble when the body really is framed; plain text stays raw
    if (/^(data|event|id|retry):/.test(t) || t.startsWith('{')) structured = true
    text += extractStreamText(line)
  }
  return structured ? text : ''
}

export function isStreamContentType(contentType: string | undefined): boolean {
  if (!contentType) return false
  const ct = contentType.toLowerCase()
  return ct.includes('text/event-stream') || ct.includes('ndjson') || ct.includes('jsonl')
}
