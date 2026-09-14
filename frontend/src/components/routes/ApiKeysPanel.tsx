'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus, Trash2, Copy, Check, Key, Ban, Loader2, RefreshCw, X, ChevronRight, Share2, Unlink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { useApiKeys, useCreateApiKey, useRevokeApiKey, useDeleteApiKey, useSetApiKeyRoutes, useDetachApiKey } from '@/hooks/useApiKeys'
import { useRoutes } from '@/hooks/useRoutes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog'
import { formatRelativeTime, formatDate, copyToClipboard } from '@/lib/utils'
import { routeUrl } from '@/lib/urls'
import { toast } from 'sonner'
import type { ApiKey } from '@/types'

interface ApiKeysPanelProps {
  routeId: string
}

export function ApiKeysPanel({ routeId }: ApiKeysPanelProps) {
  const { data: keysData, isLoading } = useApiKeys(routeId)
  const createKey = useCreateApiKey(routeId)
  const revokeKey = useRevokeApiKey(routeId)
  const deleteKey = useDeleteApiKey(routeId)
  const setKeyRoutes = useSetApiKeyRoutes(routeId)
  const detachKey = useDetachApiKey(routeId)
  // Candidates for sharing a key with other routes (agent + documents case)
  const { data: allRoutesData } = useRoutes({ pageSize: 100 })
  const otherRoutes = (allRoutesData?.data ?? []).filter((r) => r.id !== routeId)

  const confirm = useConfirm()
  const [createOpen, setCreateOpen] = useState(false)
  const [keyName, setKeyName] = useState('')
  const [expiresInDays, setExpiresInDays] = useState('180')
  const [scope, setScope] = useState<'READ' | 'FULL'>('FULL')
  const [createRouteIds, setCreateRouteIds] = useState<string[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null)
  const [newKeyRouteCount, setNewKeyRouteCount] = useState(1)
  const [copied, setCopied] = useState(false)

  const keys = keysData?.data ?? []
  const ownedCount = keys.filter((k) => !k.isShared).length
  const sharedCount = keys.length - ownedCount

  const computeExpiry = (days: string) =>
    days !== '0' ? new Date(Date.now() + parseInt(days) * 86400000).toISOString() : undefined

  const handleCreate = async () => {
    const result = await createKey.mutateAsync({
      name: keyName,
      expiresAt: computeExpiry(expiresInDays),
      scope,
      routeIds: createRouteIds,
    })
    setNewKeyValue(result.data.key)
    setNewKeyRouteCount(1 + (result.data.sharedRoutes?.length ?? 0))
    setKeyName('')
    setExpiresInDays('180')
    setScope('FULL')
    setCreateRouteIds([])
    setCreateOpen(false)
  }

  // Regenerating keeps the key's scope and route set — only the secret changes
  const handleRegenerate = async (key: ApiKey) => {
    const ok = await confirm({
      title: 'Regenerate API Key',
      description: `Generate a new key for "${key.name}" and revoke the old one? The old key stops working immediately${(key.sharedRoutes?.length ?? 0) > 0 ? ' on all its routes' : ''}.`,
      confirmLabel: 'Regenerate',
      variant: 'destructive',
    })
    if (!ok) return
    const result = await createKey.mutateAsync({
      name: key.name,
      scope: key.scope,
      routeIds: (key.sharedRoutes ?? []).map((r) => r.id),
    })
    setNewKeyValue(result.data.key)
    setNewKeyRouteCount(1 + (result.data.sharedRoutes?.length ?? 0))
    revokeKey.mutate(key.id)
  }

  const handleCopy = async () => {
    if (newKeyValue) {
      await copyToClipboard(newKeyValue)
      setCopied(true)
      toast.success('API key copied — store it safely, it won’t be shown again')
      // Close the banner shortly after copying so it can't linger on screen
      setTimeout(() => { setCopied(false); setNewKeyValue(null) }, 1000)
    }
  }

  const toggleCreateRoute = (id: string, checked: boolean) =>
    setCreateRouteIds((prev) => (checked ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {ownedCount} API key{ownedCount !== 1 ? 's' : ''}
          {sharedCount > 0 && ` · ${sharedCount} shared from other route${sharedCount !== 1 ? 's' : ''}`}
        </p>
        <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="w-3 h-3 mr-1" /> Generate Key
        </Button>
      </div>

      {/* New key banner */}
      {newKeyValue && (
        <div className="p-3 rounded-lg border border-green-500/30 bg-green-500/5">
          <p className="text-xs font-medium text-green-500 mb-2">
            New API key created{newKeyRouteCount > 1 ? ` — valid for ${newKeyRouteCount} routes` : ''} — copy it now, it won&apos;t be shown again!
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono bg-muted px-2 py-1.5 rounded break-all">
              {newKeyValue}
            </code>
            <Button variant="outline" size="sm" onClick={handleCopy}>
              {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => setNewKeyValue(null)}
          >
            <X className="w-3.5 h-3.5 mr-1" />
            Done — I've copied it
          </Button>
        </div>
      )}

      {/* Keys list */}
      {isLoading ? (
        <div className="text-center py-4 text-muted-foreground text-sm">Loading...</div>
      ) : keys.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Key className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No API keys yet</p>
          <p className="text-xs mt-1">Generate a key to enable API key authentication for this route</p>
        </div>
      ) : (
        <div className="space-y-2">
          {keys.map((key) => {
            const shared = !!key.isShared
            const sharedRoutes = key.sharedRoutes ?? []
            return (
            <div key={key.id} className={cn('rounded-lg border hover:bg-muted/20', shared ? 'border-dashed border-border/70' : 'border-border/50')}>
              <div className="flex items-center justify-between p-3 gap-2">
                <button
                  type="button"
                  onClick={() => setExpandedId(expandedId === key.id ? null : key.id)}
                  className="flex items-center gap-2 min-w-0 flex-1 text-left"
                >
                  <ChevronRight className={cn('w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform', expandedId === key.id && 'rotate-90')} />
                  {shared ? <Share2 className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <Key className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-foreground truncate" title={key.name}>{key.name}</p>
                      {(() => {
                        const expired = !!key.expiresAt && new Date(key.expiresAt) < new Date()
                        if (!key.isActive) return <Badge variant="secondary">Revoked</Badge>
                        if (expired) return <Badge variant="outline" className="text-amber-500 border-amber-500/30">Expired</Badge>
                        return <Badge variant="success">Active</Badge>
                      })()}
                      {key.scope === 'READ' && <Badge variant="outline" className="text-xs">Read-only</Badge>}
                      {shared && key.ownerRoute && (
                        <Badge variant="outline" className="text-xs font-normal gap-1">
                          <Share2 className="w-3 h-3" /> Shared from {key.ownerRoute.name}
                        </Badge>
                      )}
                      {!shared && sharedRoutes.length > 0 && (
                        <Badge variant="outline" className="text-xs font-normal">
                          Valid for {sharedRoutes.length + 1} routes
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {!key.expiresAt
                        ? 'Never expires'
                        : new Date(key.expiresAt) < new Date()
                          ? `Expired ${formatDate(key.expiresAt)}`
                          : `Expires ${formatDate(key.expiresAt)}`}
                    </div>
                  </div>
                </button>
              <div className="flex items-center gap-1 flex-shrink-0">
                {shared ? (
                  // Shared-in keys are managed on their owner route; here you can only drop access
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Remove this key from this route"
                    onClick={async () => {
                      const ok = await confirm({
                        title: 'Remove key from this route',
                        description: `"${key.name}" will no longer authenticate requests to this route. It keeps working on ${key.ownerRoute?.name ?? 'its owner route'}${sharedRoutes.length > 1 ? ' and its other routes' : ''}.`,
                        confirmLabel: 'Remove',
                        variant: 'destructive',
                      })
                      if (ok) detachKey.mutate(key.id)
                    }}
                  >
                    <Unlink className="w-3.5 h-3.5 text-yellow-500" />
                  </Button>
                ) : (
                  <>
                    {key.isActive && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Regenerate key"
                        onClick={() => handleRegenerate(key)}
                      >
                        <RefreshCw className="w-3.5 h-3.5 text-blue-500" />
                      </Button>
                    )}
                    {key.isActive && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Revoke key"
                        onClick={async () => {
                          const ok = await confirm({
                            title: 'Revoke API Key',
                            description: `Revoke "${key.name}"? It will no longer authenticate requests${sharedRoutes.length > 0 ? ` on this or the ${sharedRoutes.length} other route${sharedRoutes.length !== 1 ? 's' : ''} it is shared with` : ''}.`,
                            confirmLabel: 'Revoke',
                            variant: 'destructive',
                          })
                          if (ok) revokeKey.mutate(key.id)
                        }}
                      >
                        <Ban className="w-3.5 h-3.5 text-yellow-500" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-destructive hover:text-destructive"
                      title="Delete key"
                      onClick={async () => {
                        const ok = await confirm({
                          title: 'Delete API Key',
                          description: `Permanently delete "${key.name}"? This action cannot be undone.`,
                          confirmLabel: 'Delete',
                          variant: 'destructive',
                        })
                        if (ok) deleteKey.mutate(key.id)
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </>
                )}
              </div>
              </div>

              {expandedId === key.id && (
                <div className="border-t border-border/50 px-3 py-2.5 space-y-1.5 text-xs">
                  {key.keyHint && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Key</span>
                      <code className="font-mono text-foreground">{key.keyHint}</code>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Uses</span>
                    <span className="text-foreground">{key.usageCount ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Created</span>
                    <span className="text-foreground">{formatDate(key.createdAt)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Last used</span>
                    <span className="text-foreground">
                      {key.lastUsedAt
                        ? `${formatRelativeTime(key.lastUsedAt)}${key.lastUsedIp ? ` · ${key.lastUsedIp}` : ''}`
                        : 'Never'}
                    </span>
                  </div>

                  {/* Route set: read-only for shared-in keys (managed on the owner),
                      editable for owned keys */}
                  <div className="pt-2 mt-1 border-t border-border/50">
                    {shared ? (
                      <>
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="text-muted-foreground">Managed on</span>
                          {key.ownerRoute && (
                            <Link href={routeUrl(key.ownerRoute)} className="text-primary hover:underline">
                              {key.ownerRoute.name}
                            </Link>
                          )}
                        </div>
                        <p className="text-muted-foreground mb-1.5">Valid for</p>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {key.ownerRoute && (
                            <Badge variant="secondary" className="font-normal" title={key.ownerRoute.publicPath}>{key.ownerRoute.name}</Badge>
                          )}
                          {sharedRoutes.map((r) => (
                            <Badge key={r.id} variant={r.id === routeId ? 'success' : 'secondary'} className="font-normal" title={r.publicPath}>
                              {r.name}{r.id === routeId ? ' (this route)' : ''}
                            </Badge>
                          ))}
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-muted-foreground mb-1.5">Also valid for</p>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {sharedRoutes.map((r) => (
                            <Badge key={r.id} variant="secondary" className="gap-1 font-normal" title={r.publicPath}>
                              {r.name}
                              <button
                                type="button"
                                title={`Remove ${r.name}`}
                                className="hover:text-destructive"
                                disabled={setKeyRoutes.isPending}
                                onClick={() =>
                                  setKeyRoutes.mutate({
                                    keyId: key.id,
                                    routeIds: sharedRoutes.map((s) => s.id).filter((id) => id !== r.id),
                                  })
                                }
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </Badge>
                          ))}
                          {sharedRoutes.length === 0 && (
                            <span className="text-muted-foreground italic">Only this route</span>
                          )}
                          {otherRoutes.some((r) => !sharedRoutes.some((s) => s.id === r.id)) && (
                            <Select
                              value=""
                              onValueChange={(newRouteId) =>
                                setKeyRoutes.mutate({
                                  keyId: key.id,
                                  routeIds: [...sharedRoutes.map((s) => s.id), newRouteId],
                                })
                              }
                            >
                              <SelectTrigger className="h-6 w-auto gap-1 px-2 text-xs border-dashed">
                                <Plus className="w-3 h-3" />
                                Add route
                              </SelectTrigger>
                              <SelectContent>
                                {otherRoutes
                                  .filter((r) => !sharedRoutes.some((s) => s.id === r.id))
                                  .map((r) => (
                                    <SelectItem key={r.id} value={r.id}>
                                      {r.name} <span className="text-muted-foreground font-mono">{r.publicPath}</span>
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
            )
          })}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate API Key</DialogTitle>
            <DialogDescription>
              Create a new API key for authenticating requests to this route.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Key Name</label>
              <Input
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                placeholder="My API Key"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Expires</label>
              <Select value={expiresInDays} onValueChange={setExpiresInDays}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                  <SelectItem value="180">6 months</SelectItem>
                  <SelectItem value="365">1 year</SelectItem>
                  <SelectItem value="0">Never</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Scope</label>
              <Select value={scope} onValueChange={(v) => setScope(v as 'READ' | 'FULL')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="FULL">Full (all methods)</SelectItem>
                  <SelectItem value="READ">Read-only (GET/HEAD)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {otherRoutes.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Also valid for</label>
                <p className="text-xs text-muted-foreground">
                  One key for several endpoints — the same key authenticates on every route you tick.
                </p>
                <div className="max-h-40 overflow-y-auto rounded-md border border-border/50 divide-y divide-border/50">
                  {otherRoutes.map((r) => (
                    <label key={r.id} className="flex items-center gap-2 px-2.5 py-1.5 text-sm cursor-pointer hover:bg-muted/30">
                      <Checkbox
                        checked={createRouteIds.includes(r.id)}
                        onCheckedChange={(c) => toggleCreateRoute(r.id, c === true)}
                      />
                      <span className="truncate">{r.name}</span>
                      <span className="ml-auto text-xs font-mono text-muted-foreground truncate">{r.publicPath}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={!keyName.trim() || createKey.isPending}
            >
              {createKey.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...</>
              ) : (
                createRouteIds.length > 0 ? `Generate for ${createRouteIds.length + 1} routes` : 'Generate'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
