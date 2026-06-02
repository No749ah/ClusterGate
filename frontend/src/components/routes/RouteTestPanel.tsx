'use client'

import { useState, useEffect } from 'react'
import { Play, Loader2, Copy, Check, ChevronDown, ChevronUp, Plus, Trash2, ShieldCheck, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useTestRoute } from '@/hooks/useRoutes'
import { api } from '@/lib/api'
import { TestResult } from '@/types'
import { cn, getStatusColor, formatDuration, copyToClipboard, formatJsonForDisplay } from '@/lib/utils'
import { toast } from 'sonner'

interface RouteTestPanelProps {
  routeId: string
  defaultPath?: string
  methods?: string[]
  requireAuth?: boolean
  authType?: string
  streamResponse?: boolean
  targetType?: string
}

// Extract human-readable text from a streamed chunk. Handles n8n-style NDJSON
// ({type:'item', content:'...'}) and plain text, so the test panel shows the
// assembled message rather than raw protocol frames.
function extractStreamText(line: string): string {
  const trimmed = line.trim()
  if (!trimmed) return ''
  try {
    const obj = JSON.parse(trimmed)
    if (typeof obj.content === 'string') return obj.content
    if (typeof obj.delta === 'string') return obj.delta
    if (typeof obj.text === 'string') return obj.text
    return ''
  } catch {
    return line
  }
}

export function RouteTestPanel({ routeId, defaultPath = '/', methods, requireAuth, authType, streamResponse, targetType }: RouteTestPanelProps) {
  const [method, setMethod] = useState(methods?.[0] ?? 'GET')
  const [path, setPath] = useState(defaultPath)
  const [body, setBody] = useState('')
  const [bodyMode, setBodyMode] = useState<'json' | 'fields'>('fields')
  const [bodyFields, setBodyFields] = useState<{ key: string; value: string }[]>(
    targetType === 'N8N'
      ? [{ key: 'chatInput', value: 'Hello World!' }, { key: 'sessionId', value: 'test-session' }]
      : [{ key: '', value: '' }]
  )
  const [generatingKey, setGeneratingKey] = useState(false)

  // Switch body editor mode, carrying values across so nothing is lost
  const switchToJson = () => {
    const obj: Record<string, string> = {}
    for (const f of bodyFields) {
      if (f.key.trim()) obj[f.key.trim()] = f.value
    }
    if (Object.keys(obj).length) setBody(JSON.stringify(obj, null, 2))
    setBodyMode('json')
  }
  const switchToFields = () => {
    try {
      const parsed = JSON.parse(body)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const entries = Object.entries(parsed).map(([k, v]) => ({
          key: k,
          value: typeof v === 'string' ? v : JSON.stringify(v),
        }))
        setBodyFields(entries.length ? entries : [{ key: '', value: '' }])
      }
    } catch {
      // invalid JSON — keep the current fields
    }
    setBodyMode('fields')
  }

  // Build the request body from either the JSON textarea or the field rows
  const buildBody = (): string | undefined => {
    if (bodyMode === 'json') return body || undefined
    const obj: Record<string, string> = {}
    for (const f of bodyFields) {
      if (f.key.trim()) obj[f.key.trim()] = f.value
    }
    return Object.keys(obj).length ? JSON.stringify(obj) : undefined
  }
  const [headers, setHeaders] = useState<{ key: string; value: string }[]>([])

  // Saved test requests (persisted per route in localStorage)
  type SavedRequest = {
    name: string
    method: string
    path: string
    headers: { key: string; value: string }[]
    bodyMode: 'json' | 'fields'
    body: string
    bodyFields: { key: string; value: string }[]
  }
  const storageKey = `clustergate-test-requests-${routeId}`
  const [savedRequests, setSavedRequests] = useState<SavedRequest[]>([])
  const [saveName, setSaveName] = useState('')
  const [selectedSaved, setSelectedSaved] = useState('')

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) setSavedRequests(JSON.parse(raw))
    } catch { /* ignore */ }
  }, [storageKey])

  const persistSaved = (list: SavedRequest[]) => {
    setSavedRequests(list)
    try { localStorage.setItem(storageKey, JSON.stringify(list)) } catch { /* ignore */ }
  }

  const saveCurrentRequest = () => {
    const name = saveName.trim()
    if (!name) return
    const entry: SavedRequest = { name, method, path, headers, bodyMode, body, bodyFields }
    const list = [...savedRequests.filter((r) => r.name !== name), entry]
    persistSaved(list)
    setSaveName('')
    setSelectedSaved(name)
  }

  const loadSavedRequest = (name: string) => {
    const r = savedRequests.find((s) => s.name === name)
    if (!r) return
    setSelectedSaved(name)
    setMethod(r.method)
    setPath(r.path)
    setHeaders(r.headers ?? [])
    setBodyMode(r.bodyMode ?? 'fields')
    setBody(r.body ?? '')
    setBodyFields(r.bodyFields ?? [{ key: '', value: '' }])
  }

  const deleteSavedRequest = () => {
    if (!selectedSaved) return
    persistSaved(savedRequests.filter((r) => r.name !== selectedSaved))
    setSelectedSaved('')
  }

  const [result, setResult] = useState<TestResult | null>(null)
  // Briefly hide the previous result on every retest so the user always sees
  // the response area redraw — even when the round-trip is faster than the eye.
  const [reloading, setReloading] = useState(false)
  const [showRequestHeaders, setShowRequestHeaders] = useState(false)
  const [showResponseHeaders, setShowResponseHeaders] = useState(false)
  const [copied, setCopied] = useState(false)

  // Streaming test state
  const [streamText, setStreamText] = useState('')
  const [streamRaw, setStreamRaw] = useState('')
  const [showStreamRaw, setShowStreamRaw] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamError, setStreamError] = useState<string | null>(null)
  const [streamCopied, setStreamCopied] = useState(false)

  // Auth state
  const hasAuth = requireAuth === true && authType !== undefined && authType !== 'NONE'
  const [skipAuth, setSkipAuth] = useState(false)
  const [apiKeyValue, setApiKeyValue] = useState('')
  const [basicUsername, setBasicUsername] = useState('')
  const [basicPassword, setBasicPassword] = useState('')
  const [bearerToken, setBearerToken] = useState('')

  const testMutation = useTestRoute(routeId)

  const buildHeaderMap = () => {
    const headerMap = Object.fromEntries(
      headers.filter((h) => h.key).map((h) => [h.key, h.value])
    )
    // Inject auth credentials as headers when auth is configured and not skipped
    if (hasAuth && !skipAuth) {
      switch (authType) {
        case 'API_KEY':
          if (apiKeyValue) headerMap['X-API-Key'] = apiKeyValue
          break
        case 'BASIC':
          if (basicUsername || basicPassword) {
            headerMap['Authorization'] = `Basic ${btoa(`${basicUsername}:${basicPassword}`)}`
          }
          break
        case 'BEARER':
          if (bearerToken) headerMap['Authorization'] = `Bearer ${bearerToken}`
          break
      }
    }
    return headerMap
  }

  const handleGenerateTestKey = async () => {
    setGeneratingKey(true)
    try {
      const res = await api.apiKeys.create(routeId, { name: `test-${Date.now()}` })
      setApiKeyValue(res.data.key)
      toast.success('Test key generated and filled in')
    } catch {
      toast.error('Failed to generate key')
    } finally {
      setGeneratingKey(false)
    }
  }

  const handleTest = async () => {
    const headerMap = buildHeaderMap()
    const params = {
      method,
      path,
      headers: headerMap,
      body: ['POST', 'PUT', 'PATCH'].includes(method) ? buildBody() : undefined,
      skipAuth: hasAuth && skipAuth ? true : undefined,
    }

    if (streamResponse) {
      await handleStreamTest(params)
      return
    }

    // Force a visible reload animation even on sub-millisecond round-trips:
    // clear the previous result, then hold the loading state for at least 350ms.
    setReloading(true)
    setResult(null)
    const started = Date.now()
    try {
      const res = await testMutation.mutateAsync(params)
      const elapsed = Date.now() - started
      if (elapsed < 350) await new Promise((r) => setTimeout(r, 350 - elapsed))
      setResult(res.data)
    } finally {
      setReloading(false)
    }
  }

  const handleStreamTest = async (params: { method: string; path: string; headers: Record<string, string>; body?: string; skipAuth?: boolean }) => {
    setIsStreaming(true)
    setStreamText('')
    setStreamRaw('')
    setStreamError(null)
    setResult(null)
    try {
      const res = await api.routes.testStream(routeId, params)
      // Only responses actually piped by the proxy carry this marker. Anything
      // else is a pre-pipe JSON envelope (SSRF block / proxy error).
      if (res.headers.get('X-ClusterGate-Stream') !== '1') {
        const json = await res.json().catch(() => null)
        setStreamError(json?.data?.error || `Request failed (${res.status})`)
        return
      }
      if (!res.body) {
        setStreamError('No response stream')
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        buffer += chunk
        setStreamRaw((prev) => prev + chunk)
        // Process complete lines for readable text extraction
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          const text = extractStreamText(line)
          if (text) setStreamText((prev) => prev + text)
        }
      }
      if (buffer.trim()) {
        const text = extractStreamText(buffer)
        if (text) setStreamText((prev) => prev + text)
      }
    } catch (err) {
      setStreamError((err as Error).message)
    } finally {
      setIsStreaming(false)
    }
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
        {/* Saved requests */}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={selectedSaved} onValueChange={loadSavedRequest}>
            <SelectTrigger className="flex-1 min-w-[160px]">
              <SelectValue placeholder={savedRequests.length ? 'Load saved request…' : 'No saved requests'} />
            </SelectTrigger>
            <SelectContent>
              {savedRequests.map((r) => (
                <SelectItem key={r.name} value={r.name}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedSaved && (
            <Button variant="ghost" size="icon-sm" title="Delete saved request" onClick={deleteSavedRequest}>
              <Trash2 className="w-3.5 h-3.5 text-destructive" />
            </Button>
          )}
          <Input
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="Save current as…"
            className="flex-1 min-w-[140px] text-sm"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveCurrentRequest() } }}
          />
          <Button variant="outline" size="sm" onClick={saveCurrentRequest} disabled={!saveName.trim()}>
            <Save className="w-3.5 h-3.5 mr-1" /> Save
          </Button>
        </div>
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

        {/* Route Authentication */}
        {hasAuth && (
          <div className="rounded-lg border border-border/50 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium">
                <ShieldCheck className="w-4 h-4 text-amber-500" />
                Route Authentication
                <span className="text-xs text-muted-foreground font-normal">({authType})</span>
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="skip-auth-toggle" className="text-xs text-muted-foreground cursor-pointer">
                  Skip authentication for this test
                </label>
                <Switch
                  id="skip-auth-toggle"
                  checked={skipAuth}
                  onCheckedChange={setSkipAuth}
                />
              </div>
            </div>

            {!skipAuth && (
              <div className="space-y-2">
                {authType === 'API_KEY' && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs text-muted-foreground block">X-API-Key</label>
                      <button
                        type="button"
                        onClick={handleGenerateTestKey}
                        disabled={generatingKey}
                        className="text-xs text-primary hover:underline disabled:opacity-50"
                      >
                        {generatingKey ? 'Generating…' : 'Generate & use'}
                      </button>
                    </div>
                    <Input
                      value={apiKeyValue}
                      onChange={(e) => setApiKeyValue(e.target.value)}
                      placeholder="Paste a generated key or click Generate & use"
                      className="font-mono text-sm"
                      type="password"
                      autoComplete="off"
                    />
                  </div>
                )}

                {authType === 'BASIC' && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Username</label>
                      <Input
                        value={basicUsername}
                        onChange={(e) => setBasicUsername(e.target.value)}
                        placeholder="Username"
                        className="text-sm"
                        autoComplete="off"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Password</label>
                      <Input
                        value={basicPassword}
                        onChange={(e) => setBasicPassword(e.target.value)}
                        placeholder="Password"
                        className="text-sm"
                        type="password"
                        autoComplete="off"
                      />
                    </div>
                  </div>
                )}

                {authType === 'BEARER' && (
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Bearer Token</label>
                    <Input
                      value={bearerToken}
                      onChange={(e) => setBearerToken(e.target.value)}
                      placeholder="Enter bearer token"
                      className="font-mono text-sm"
                      type="password"
                      autoComplete="off"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

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
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-muted-foreground">Request Body</p>
              <div className="flex items-center gap-1 text-xs">
                <button
                  type="button"
                  onClick={switchToFields}
                  className={cn('px-2 py-0.5 rounded', bodyMode === 'fields' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground')}
                >
                  Fields
                </button>
                <button
                  type="button"
                  onClick={switchToJson}
                  className={cn('px-2 py-0.5 rounded', bodyMode === 'json' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground')}
                >
                  JSON
                </button>
              </div>
            </div>
            {bodyMode === 'json' ? (
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder='{"message": "Hello, World!"}'
                rows={4}
                className="font-mono text-sm"
              />
            ) : (
              <div className="space-y-2">
                {bodyFields.map((f, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      value={f.key}
                      onChange={(e) => setBodyFields((prev) => prev.map((item, idx) => idx === i ? { ...item, key: e.target.value } : item))}
                      placeholder="field"
                      className="flex-1 text-xs"
                    />
                    <Input
                      value={f.value}
                      onChange={(e) => setBodyFields((prev) => prev.map((item, idx) => idx === i ? { ...item, value: e.target.value } : item))}
                      placeholder="value"
                      className="flex-1 text-xs"
                    />
                    <Button variant="ghost" size="icon-sm" onClick={() => setBodyFields((prev) => prev.filter((_, idx) => idx !== i))}>
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setBodyFields((prev) => [...prev, { key: '', value: '' }])}>
                  <Plus className="w-3 h-3 mr-1" /> Add Field
                </Button>
              </div>
            )}
          </div>
        )}

        <Button onClick={handleTest} disabled={reloading || testMutation.isPending || isStreaming} className="w-full">
          {reloading || testMutation.isPending || isStreaming ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {isStreaming ? 'Streaming...' : 'Sending...'}</>
          ) : (
            <><Play className="w-4 h-4 mr-2" /> Send Request</>
          )}
        </Button>
      </div>

      {/* Streaming response */}
      {streamResponse && (isStreaming || streamText || streamRaw || streamError) && (
        <div className="rounded-lg border border-border/50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b border-border/50">
            <div className="flex items-center gap-2">
              {isStreaming && <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" />}
              <span className="text-sm font-medium">{isStreaming ? 'Streaming response' : 'Streamed response'}</span>
              {streamError && <span className="text-xs text-destructive">Error: {streamError}</span>}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowStreamRaw((v) => !v)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {showStreamRaw ? 'Show text' : 'Show raw (unstreamed)'}
              </button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={async () => {
                  await copyToClipboard(showStreamRaw ? streamRaw : streamText)
                  setStreamCopied(true)
                  toast.success('Copied to clipboard')
                  setTimeout(() => setStreamCopied(false), 2000)
                }}
              >
                {streamCopied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
              </Button>
            </div>
          </div>
          <div className="p-4 max-h-96 overflow-auto">
            {showStreamRaw ? (
              <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-all">{streamRaw || '—'}</pre>
            ) : (
              <p className="text-sm text-foreground whitespace-pre-wrap break-words">{streamText || (isStreaming ? '' : '—')}</p>
            )}
          </div>
        </div>
      )}

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
                Headers {showResponseHeaders ? '\u25B2' : '\u25BC'}
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
