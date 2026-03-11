'use client'

import { useState } from 'react'
import { Play, Loader2, Copy, Check, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useTestRoute } from '@/hooks/useRoutes'
import { TestResult } from '@/types'
import { cn, getStatusColor, formatDuration, copyToClipboard, formatJsonForDisplay } from '@/lib/utils'
import { toast } from 'sonner'

interface RouteTestPanelProps {
  routeId: string
  defaultPath?: string
  methods?: string[]
}

export function RouteTestPanel({ routeId, defaultPath = '/', methods }: RouteTestPanelProps) {
  const [method, setMethod] = useState(methods?.[0] ?? 'GET')
  const [path, setPath] = useState(defaultPath)
  const [body, setBody] = useState('')
  const [headers, setHeaders] = useState<{ key: string; value: string }[]>([])
  const [result, setResult] = useState<TestResult | null>(null)
  const [showRequestHeaders, setShowRequestHeaders] = useState(false)
  const [showResponseHeaders, setShowResponseHeaders] = useState(false)
  const [copied, setCopied] = useState(false)

  const testMutation = useTestRoute(routeId)

  const handleTest = async () => {
    const headerMap = Object.fromEntries(
      headers.filter((h) => h.key).map((h) => [h.key, h.value])
    )
    const res = await testMutation.mutateAsync({
      method,
      path,
      headers: headerMap,
      body: body || undefined,
    })
    setResult(res.data)
  }

  const handleCopy = async () => {
    if (result?.body) {
      await copyToClipboard(result.body)
      setCopied(true)
      toast.success('Copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const statusColor = result ? getStatusColor(result.status) : ''

  return (
    <div className="space-y-4">
      {/* Request config */}
      <div className="space-y-3">
        <div className="flex gap-2">
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(methods ?? ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']).map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="/api/test"
            className="flex-1 font-mono text-sm"
          />
        </div>

        {/* Custom Headers */}
        <div>
          <button
            type="button"
            onClick={() => setShowRequestHeaders(!showRequestHeaders)}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showRequestHeaders ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            Custom Headers {headers.length > 0 && `(${headers.length})`}
          </button>
          {showRequestHeaders && (
            <div className="mt-2 space-y-2">
              {headers.map((h, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={h.key}
                    onChange={(e) => setHeaders(prev => prev.map((item, idx) => idx === i ? { ...item, key: e.target.value } : item))}
                    placeholder="X-Custom-Header"
                    className="flex-1 text-xs"
                  />
                  <Input
                    value={h.value}
                    onChange={(e) => setHeaders(prev => prev.map((item, idx) => idx === i ? { ...item, value: e.target.value } : item))}
                    placeholder="header-value"
                    className="flex-1 text-xs"
                  />
                  <Button variant="ghost" size="icon-sm" onClick={() => setHeaders(prev => prev.filter((_, idx) => idx !== i))}>
                    <Trash2 className="w-3 h-3 text-destructive" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setHeaders(prev => [...prev, { key: '', value: '' }])}>
                <Plus className="w-3 h-3 mr-1" /> Add Header
              </Button>
            </div>
          )}
        </div>

        {/* Body (for POST/PUT/PATCH) */}
        {['POST', 'PUT', 'PATCH'].includes(method) && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">Request Body (JSON)</p>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder='{"message": "Hello, World!"}'
              rows={4}
              className="font-mono text-sm"
            />
          </div>
        )}

        <Button onClick={handleTest} disabled={testMutation.isPending} className="w-full">
          {testMutation.isPending ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending...</>
          ) : (
            <><Play className="w-4 h-4 mr-2" /> Send Request</>
          )}
        </Button>
      </div>

      {/* Response */}
      {result && (
        <div className="rounded-lg border border-border/50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b border-border/50">
            <div className="flex items-center gap-4">
              <span className={cn('text-lg font-bold', statusColor)}>
                {result.status}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatDuration(result.duration)}
              </span>
              {result.error && (
                <span className="text-xs text-destructive">Error: {result.error}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* Response headers toggle */}
              <button
                onClick={() => setShowResponseHeaders(!showResponseHeaders)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Headers {showResponseHeaders ? '▲' : '▼'}
              </button>
              <Button variant="ghost" size="icon-sm" onClick={handleCopy}>
                {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
              </Button>
            </div>
          </div>

          {showResponseHeaders && Object.keys(result.headers).length > 0 && (
            <div className="px-4 py-2 border-b border-border/50 bg-muted/10">
              <p className="text-xs font-medium text-muted-foreground mb-1">Response Headers</p>
              <div className="space-y-0.5">
                {Object.entries(result.headers).map(([key, value]) => (
                  <div key={key} className="flex gap-2 text-xs font-mono">
                    <span className="text-muted-foreground min-w-[150px]">{key}:</span>
                    <span className="text-foreground break-all">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="p-4 max-h-96 overflow-auto">
            {result.body ? (
              <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-all">
                {formatJsonForDisplay(result.body)}
              </pre>
            ) : (
              <p className="text-xs text-muted-foreground italic">No response body</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
