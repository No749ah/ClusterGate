'use client'

import { useState } from 'react'
import { Plus, Trash2, Copy, Check, Key, Ban, Loader2, RefreshCw, X } from 'lucide-react'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { useApiKeys, useCreateApiKey, useRevokeApiKey, useDeleteApiKey } from '@/hooks/useApiKeys'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog'
import { formatRelativeTime, formatDate, copyToClipboard } from '@/lib/utils'
import { toast } from 'sonner'

interface ApiKeysPanelProps {
  routeId: string
}

export function ApiKeysPanel({ routeId }: ApiKeysPanelProps) {
  const { data: keysData, isLoading } = useApiKeys(routeId)
  const createKey = useCreateApiKey(routeId)
  const revokeKey = useRevokeApiKey(routeId)
  const deleteKey = useDeleteApiKey(routeId)

  const confirm = useConfirm()
  const [createOpen, setCreateOpen] = useState(false)
  const [keyName, setKeyName] = useState('')
  const [expiresInDays, setExpiresInDays] = useState('0')
  const [scope, setScope] = useState<'READ' | 'FULL'>('FULL')
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const keys = keysData?.data ?? []

  const computeExpiry = (days: string) =>
    days !== '0' ? new Date(Date.now() + parseInt(days) * 86400000).toISOString() : undefined

  const handleCreate = async () => {
    const result = await createKey.mutateAsync({ name: keyName, expiresAt: computeExpiry(expiresInDays), scope })
    setNewKeyValue(result.data.key)
    setKeyName('')
    setExpiresInDays('0')
    setScope('FULL')
    setCreateOpen(false)
  }

  const handleRegenerate = async (key: { id: string; name: string }) => {
    const ok = await confirm({
      title: 'Regenerate API Key',
      description: `Generate a new key for "${key.name}" and revoke the old one? The old key stops working immediately.`,
      confirmLabel: 'Regenerate',
      variant: 'destructive',
    })
    if (!ok) return
    const result = await createKey.mutateAsync({ name: key.name })
    setNewKeyValue(result.data.key)
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {keys.length} API key{keys.length !== 1 ? 's' : ''}
        </p>
        <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="w-3 h-3 mr-1" /> Generate Key
        </Button>
      </div>

      {/* New key banner */}
      {newKeyValue && (
        <div className="p-3 rounded-lg border border-green-500/30 bg-green-500/5">
          <p className="text-xs font-medium text-green-500 mb-2">
            New API key created — copy it now, it won&apos;t be shown again!
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
          {keys.map((key) => (
            <div
              key={key.id}
              className="flex items-center justify-between p-3 rounded-lg border border-border/50 hover:bg-muted/20"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Key className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground truncate" title={key.name}>{key.name}</p>
                    {(() => {
                      const expired = !!key.expiresAt && new Date(key.expiresAt) < new Date()
                      if (!key.isActive) return <Badge variant="secondary">Revoked</Badge>
                      if (expired) return <Badge variant="outline" className="text-amber-500 border-amber-500/30">Expired</Badge>
                      return <Badge variant="success">Active</Badge>
                    })()}
                    {key.scope === 'READ' && <Badge variant="outline" className="text-xs">Read-only</Badge>}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                    <span>Created {formatRelativeTime(key.createdAt)}</span>
                    {key.lastUsedAt && <span>Last used {formatRelativeTime(key.lastUsedAt)}</span>}
                    {typeof key.usageCount === 'number' && <span>{key.usageCount} use{key.usageCount === 1 ? '' : 's'}</span>}
                    {key.lastUsedIp && <span>from {key.lastUsedIp}</span>}
                    {key.expiresAt && <span>Expires {formatDate(key.expiresAt)}</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
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
                        description: `Revoke "${key.name}"? It will no longer authenticate requests.`,
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
              </div>
            </div>
          ))}
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
                  <SelectItem value="0">Never</SelectItem>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                  <SelectItem value="365">1 year</SelectItem>
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
                'Generate'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
