'use client'

import { useEffect, useState } from 'react'
import { ShieldCheck, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Organization } from '@/types'

export interface TargetAllowlistUpdate {
  restrictTargets?: boolean
  allowedTargetNamespaces?: string[]
  allowedTargetHosts?: string[]
}

interface Props {
  org: Organization
  canEdit: boolean
  saving: boolean
  onSave: (data: TargetAllowlistUpdate) => void
}

// One entry per line (commas also accepted), blanks dropped.
function parseList(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Per-organization route target allowlist. When restricted, routes in the org
 * may only point at Kubernetes services in the listed namespaces or at the
 * listed hosts. Only system admins can edit it — org owners are the ones it
 * constrains.
 */
export function TargetAllowlistCard({ org, canEdit, saving, onSave }: Props) {
  const [namespaces, setNamespaces] = useState('')
  const [hosts, setHosts] = useState('')

  useEffect(() => {
    setNamespaces((org.allowedTargetNamespaces ?? []).join('\n'))
    setHosts((org.allowedTargetHosts ?? []).join('\n'))
  }, [org.allowedTargetNamespaces, org.allowedTargetHosts])

  const nsList = parseList(namespaces)
  const hostList = parseList(hosts)
  const dirty =
    nsList.join('\n') !== (org.allowedTargetNamespaces ?? []).join('\n') ||
    hostList.join('\n') !== (org.allowedTargetHosts ?? []).join('\n')

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" /> Allowed route targets
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {org.restrictTargets
                ? 'Routes in this organization may only point at the namespaces and hosts below.'
                : 'Routes in this organization may point at any service ClusterGate can reach.'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant={org.restrictTargets ? 'default' : 'outline'}>
              {org.restrictTargets ? 'Restricted' : 'Unrestricted'}
            </Badge>
            {canEdit && (
              <Switch
                aria-label="Restrict route targets"
                checked={org.restrictTargets}
                disabled={saving}
                onCheckedChange={(checked) => onSave({ restrictTargets: checked })}
              />
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label htmlFor="allowed-namespaces" className="text-sm font-medium mb-1 block">
              Kubernetes namespaces
            </label>
            <p className="text-xs text-muted-foreground mb-2">
              One per line. Matches <code>service.namespace.svc</code> and{' '}
              <code>service.namespace.svc.cluster.local</code>.
            </p>
            <Textarea
              id="allowed-namespaces"
              rows={5}
              value={namespaces}
              onChange={(e) => setNamespaces(e.target.value)}
              placeholder={'payments\nteam-a'}
              disabled={!canEdit || saving}
              className="font-mono text-xs"
            />
          </div>
          <div>
            <label htmlFor="allowed-hosts" className="text-sm font-medium mb-1 block">
              Hosts
            </label>
            <p className="text-xs text-muted-foreground mb-2">
              One per line: exact host, <code>*.example.com</code>, IP or CIDR.
            </p>
            <Textarea
              id="allowed-hosts"
              rows={5}
              value={hosts}
              onChange={(e) => setHosts(e.target.value)}
              placeholder={'api.partner.com\n*.team-a.example.com\n10.20.0.0/16'}
              disabled={!canEdit || saving}
              className="font-mono text-xs"
            />
          </div>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-border pt-3">
          <p className="text-xs text-muted-foreground">
            Loopback, the Kubernetes API, ClusterGate&apos;s own database and cloud metadata endpoints are always
            blocked. Changes apply when routes are created or edited; existing routes keep running.
            {!canEdit && ' Only system admins can change this.'}
          </p>
          {canEdit && (
            <Button
              size="sm"
              disabled={!dirty || saving}
              onClick={() => onSave({ allowedTargetNamespaces: nsList, allowedTargetHosts: hostList })}
            >
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save allowlist
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
