import { HealthStatus } from '@/types'
import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'

interface HealthIndicatorProps {
  status?: HealthStatus
  responseTime?: number | null
  error?: string | null
  className?: string
  showLabel?: boolean
}

export function HealthIndicator({ status, responseTime, error, className, showLabel }: HealthIndicatorProps) {
  const colorMap: Record<HealthStatus | 'NONE', string> = {
    HEALTHY: 'bg-green-500',
    UNHEALTHY: 'bg-red-500',
    UNKNOWN: 'bg-gray-400',
    NONE: 'bg-gray-400',
  }

  const textColorMap: Record<HealthStatus | 'NONE', string> = {
    HEALTHY: 'text-green-500',
    UNHEALTHY: 'text-red-500',
    UNKNOWN: 'text-muted-foreground',
    NONE: 'text-muted-foreground',
  }

  const labelMap: Record<HealthStatus | 'NONE', string> = {
    HEALTHY: 'Healthy',
    UNHEALTHY: 'Unhealthy',
    UNKNOWN: 'Unknown',
    NONE: 'No checks',
  }

  const resolvedStatus = status ?? 'NONE'
  const color = colorMap[resolvedStatus]
  const textColor = textColorMap[resolvedStatus]
  const label = labelMap[resolvedStatus]

  // Simple tooltip for dot-only mode
  const tooltipParts = [label]
  if (responseTime) tooltipParts.push(`${responseTime}ms`)
  if (error) tooltipParts.push(error)
  const tooltip = tooltipParts.join(' · ')

  return (
    <div className={cn('flex items-center gap-2', className)} title={!showLabel ? tooltip : undefined}>
      <span
        className={cn('inline-flex w-2 h-2 rounded-full flex-shrink-0', color, {
          'animate-pulse': resolvedStatus === 'HEALTHY',
        })}
      />
      {showLabel && (
        <div className="flex items-center gap-1.5">
          <span className={cn('text-xs font-medium', textColor)}>
            {label}
          </span>
          {responseTime ? (
            <span className="text-xs text-muted-foreground">· {responseTime}ms</span>
          ) : null}
          {error && resolvedStatus === 'UNHEALTHY' ? (
            <span className="relative group">
              <Info className="w-3.5 h-3.5 text-red-400/70 hover:text-red-400 cursor-help" />
              <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 px-2.5 py-1.5 rounded-md bg-popover border border-border text-xs text-popover-foreground shadow-lg whitespace-nowrap max-w-[300px] truncate opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50">
                {error}
              </span>
            </span>
          ) : null}
        </div>
      )}
    </div>
  )
}
