import { HealthStatus } from '@/types'
import { cn } from '@/lib/utils'

interface HealthIndicatorProps {
  status?: HealthStatus
  responseTime?: number | null
  className?: string
  showLabel?: boolean
}

export function HealthIndicator({ status, responseTime, className, showLabel }: HealthIndicatorProps) {
  const colorMap: Record<HealthStatus | 'NONE', string> = {
    HEALTHY: 'bg-green-500',
    UNHEALTHY: 'bg-red-500',
    UNKNOWN: 'bg-gray-400',
    NONE: 'bg-gray-400',
  }

  const labelMap: Record<HealthStatus | 'NONE', string> = {
    HEALTHY: 'Healthy',
    UNHEALTHY: 'Unhealthy',
    UNKNOWN: 'Unknown',
    NONE: 'Unknown',
  }

  const resolvedStatus = status ?? 'NONE'
  const color = colorMap[resolvedStatus]
  const label = labelMap[resolvedStatus]

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span
        className={cn('inline-flex w-2 h-2 rounded-full flex-shrink-0', color, {
          'animate-pulse': resolvedStatus === 'HEALTHY',
        })}
        title={`${label}${responseTime ? ` (${responseTime}ms)` : ''}`}
      />
      {showLabel && (
        <span className="text-xs text-muted-foreground">
          {label}
          {responseTime ? ` · ${responseTime}ms` : ''}
        </span>
      )}
    </div>
  )
}
