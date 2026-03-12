import { Badge } from '@/components/ui/badge'
import { Shield, ShieldAlert, ShieldQuestion } from 'lucide-react'

interface CircuitBreakerBadgeProps {
  enabled: boolean
  state: string
  failureCount?: number
}

export function CircuitBreakerBadge({ enabled, state, failureCount }: CircuitBreakerBadgeProps) {
  if (!enabled) return null

  const stateConfig: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: any; label: string }> = {
    CLOSED: { variant: 'outline', icon: Shield, label: 'Closed' },
    OPEN: { variant: 'destructive', icon: ShieldAlert, label: 'Open' },
    HALF_OPEN: { variant: 'secondary', icon: ShieldQuestion, label: 'Half-Open' },
  }

  const config = stateConfig[state] || stateConfig.CLOSED
  const Icon = config.icon

  return (
    <Badge variant={config.variant} className="gap-1 text-xs" title={failureCount ? `${failureCount} failures` : undefined}>
      <Icon className="w-3 h-3" />
      {config.label}
    </Badge>
  )
}
