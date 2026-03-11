'use client'

import { useState } from 'react'
import { Play, Loader2, Copy, Check, ChevronDown, ChevronUp, Plus, Trash2, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useTestRoute } from '@/hooks/useRoutes'
import { TestResult } from '@/types'
import { cn, getStatusColor, formatDuration, copyToClipboard, formatJsonForDisplay } from '@/lib/utils'
import { toast } from 'sonner'

interface RouteTestPanelProps {
  routeId: string
  defaultPath?: string
  methods?: string[]
  requireAuth?: boolean
  authType?: string
}

export function RouteTestPanel({ routeId, defaultPath = '/', methods, requireAuth, authType }: RouteTestPanelProps) {
  const [method, setMethod] = useState(methods?.[0] ?? 'GET')
  const [path, setPath] = useState(defaultPath)
  const [body, setBody] = useState('')
  const [headers, setHeaders] = useState<{ key: string; value: string }[]>([])
  const [result, setResult] = useState<TestResult | null>(null)
  const [showRequestHeaders, setShowRequestHeaders] = useState(false)
  const [showResponseHeaders, setShowResponseHeaders] = useState(false)
  const [copied, setCopied] = useState(false)

  // Auth state
  const hasAuth = requireAuth === true && authType !== undefined && authType !== 'NONE'
  const [skipAuth, setSkipAuth] = useState(false)
  const [apiKeyValue, setApiKeyValue] = useState('')
  const [basicUsername, setBasicUsername] = useState('')
  const [basicPassword, setBasicPassword] = useState('')
  const [bearerToken, setBearerToken] = useState('')

  const testMutation = useTestRoute(routeId)

  const handleTest = async () => {
    const headerMap = Object.fromEntries(
      headers.filter((h) => h.key).map((h) => [h.key, h.value])
    )

    // Inject auth credentials as headers when auth is configured and not skipped
    if (hasAuth && !skipAuth) {
      switch (authType) {
        case 'API_KEY':
          if (apiKeyValue) {
            headerMap['X-API-Key'] = apiKeyValue
          }
          break
        case 'BASIC':
          if (basicUsername || basicPassword) {
            const encoded = btoa(`${basicUsername}:${basicPassword}`)
            headerMap['Authorization'] = `Basic ${encoded}`
          }
          break
        case 'BEARER':
          if (bearerToken) {
            headerMap['Authorization'] = `Bearer ${bearerToken}`
          }
          break
      }
    }

    const res = await testMutation.mutateAsync({
      method,
      path,
      headers: headerMap,
      body: body || undefined,
      skipAuth: hasAuth && skipAuth ? true : undefined,
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
                    <label className="text-xs text-muted-foreground mb-1 block">X-API-Key</label>
                    <Input
                      value={apiKeyValue}
                      onChange={(e) => setApiKeyValue(e.target.value)}
                      placeholder="Enter API key"
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
