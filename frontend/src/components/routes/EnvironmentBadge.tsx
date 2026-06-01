import { Badge } from '@/components/ui/badge'
import type { Environment } from '@/types'

const ENV_CONFIG: Record<Exclude<Environment, 'NONE'>, { label: string; className: string }> = {
  PRODUCTION: { label: 'Prod', className: 'text-red-500 border-red-500/30 bg-red-500/5' },
  STAGING: { label: 'Staging', className: 'text-amber-500 border-amber-500/30 bg-amber-500/5' },
  DEVELOPMENT: { label: 'Dev', className: 'text-sky-500 border-sky-500/30 bg-sky-500/5' },
}

export function EnvironmentBadge({ environment, className }: { environment?: Environment; className?: string }) {
  if (!environment || environment === 'NONE') return null
  const cfg = ENV_CONFIG[environment]
  return (
    <Badge variant="outline" className={`${cfg.className} ${className ?? ''}`}>
      {cfg.label}
    </Badge>
  )
}
