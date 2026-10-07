'use client'

import { useMemo, useState } from 'react'
import { Copy, Check, Maximize2, Minimize2, Scissors } from 'lucide-react'
import { cn, copyToClipboard } from '@/lib/utils'
import { assembleStreamText, isStreamContentType, looksLikeJsonFrames, splitTruncation } from '@/lib/streamText'

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

/**
 * Renders a logged request or response body. Streamed bodies (SSE / NDJSON)
 * get a Text / Raw toggle: the assembled message by default, the frames on
 * demand. Long text wraps at word boundaries, the box can be expanded, the
 * shown view can be copied, and a body the log had to cut says so.
 *
 * `className` styles the box (background, border, padding); wrapping and
 * height are handled here.
 */
export function LogBody({ body, headers, className }: {
  body: string
  headers?: Record<string, unknown> | null
  className?: string
}) {
  const contentType = headerValue(headers, 'content-type')
  const { body: content, note } = useMemo(() => splitTruncation(body), [body])
  const assembled = useMemo(() => {
    if (body === STREAMING || body === LEGACY_STREAMED) return ''
    // n8n streams NDJSON as application/json, so look at the body too
    const framed = isStreamContentType(contentType) || /^(data|event):/m.test(content) || looksLikeJsonFrames(content)
    return framed ? assembleStreamText(body) : ''
  }, [body, content, contentType])
  const [showRaw, setShowRaw] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  if (body === STREAMING) {
    return <p className="text-xs text-muted-foreground italic">Stream still running. The body appears here once it ends or the capture limit is reached.</p>
  }
  if (body === LEGACY_STREAMED) {
    return <p className="text-xs text-muted-foreground italic">Streamed response, logged before stream bodies were captured.</p>
  }

  const isText = !!assembled && !showRaw
  const shown = isText ? assembled : assembled ? content : formatJsonSafe(content)

  const copy = async () => {
    await copyToClipboard(shown)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const toolButton = 'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors'

  return (
    <div className="space-y-1.5 min-w-0">
      <div className="flex items-center gap-2">
        {assembled && (
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
        )}
        <div className="ml-auto flex items-center gap-0.5">
          <button type="button" onClick={copy} className={toolButton} title={isText ? 'Copy text' : 'Copy body'}>
            {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button type="button" onClick={() => setExpanded((v) => !v)} className={toolButton} title={expanded ? 'Collapse' : 'Show more'}>
            {expanded ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
            {expanded ? 'Less' : 'More'}
          </button>
        </div>
      </div>
      {note && (
        <p className="flex items-start gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
          <Scissors className="w-3 h-3 mt-0.5 shrink-0" />
          <span>
            {note}. The log keeps a limited part of each body
            (LOG_BODY_LIMIT, LOG_STREAM_BODY_LIMIT for streams).
          </span>
        </p>
      )}
      <pre
        className={cn(
          className,
          'whitespace-pre-wrap [overflow-wrap:anywhere] overflow-auto',
          isText ? 'font-sans text-[13px] leading-relaxed' : 'font-mono text-[11px]',
          expanded ? 'max-h-[70vh]' : 'max-h-80'
        )}
      >
        {shown}
      </pre>
    </div>
  )
}
