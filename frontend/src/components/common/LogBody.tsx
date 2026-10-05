'use client'

import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { assembleStreamText, isStreamContentType } from '@/lib/streamText'

// Placeholders the backend writes for streamed responses
const STREAMING = '[streaming…]'
const LEGACY_STREAMED = '[streamed]'

function formatJsonSafe(str: string): string {
  try {
    return JSON.stringify(JSON.parse(str), null, 2)
  } catch {
    return str
  }
}

function headerValue(headers: Record<string, unknown> | null | undefined, name: string): string | undefined {
  if (!headers) return undefined
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name)
  const v = key ? headers[key] : undefined
  return Array.isArray(v) ? v.join(', ') : typeof v === 'string' ? v : undefined
}

// Several lines, each its own JSON object — not one (possibly pretty-printed) document
function looksLikeNdjson(body: string): boolean {
  const lines = body.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('[… truncated'))
  if (lines.length < 2) return false
  return lines.every((l) => l.startsWith('{')) && lines.slice(0, -1).every((l) => l.endsWith('}'))
}

/**
 * Renders a logged response body. Streamed bodies (SSE / NDJSON) get a
 * Text / Raw toggle: the assembled message by default, the frames on demand.
 */
export function LogBody({ body, headers, className }: {
  body: string
  headers?: Record<string, unknown> | null
  className?: string
}) {
  const contentType = headerValue(headers, 'content-type')
  const assembled = useMemo(() => {
    if (body === STREAMING || body === LEGACY_STREAMED) return ''
    // n8n streams NDJSON as application/json, so look at the body too
    const framed = isStreamContentType(contentType) || /^(data|event):/m.test(body) || looksLikeNdjson(body)
    return framed ? assembleStreamText(body) : ''
  }, [body, contentType])
  const [showRaw, setShowRaw] = useState(false)

  if (body === STREAMING) {
    return <p className="text-xs text-muted-foreground italic">Stream still running. The body appears here once it ends or the capture limit is reached.</p>
  }
  if (body === LEGACY_STREAMED) {
    return <p className="text-xs text-muted-foreground italic">Streamed response, logged before stream bodies were captured.</p>
  }

  if (!assembled) {
    return <pre className={className}>{formatJsonSafe(body)}</pre>
  }

  return (
    <div className="space-y-1.5">
      <div className="inline-flex rounded-md border border-border/50 p-0.5 text-[11px]">
        {(['Text', 'Raw'] as const).map((label) => {
          const active = (label === 'Raw') === showRaw
          return (
            <button
              key={label}
              type="button"
              onClick={() => setShowRaw(label === 'Raw')}
              className={cn('px-2 py-0.5 rounded', active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              {label}
            </button>
          )
        })}
      </div>
      <pre className={className}>{showRaw ? body : assembled}</pre>
    </div>
  )
}
