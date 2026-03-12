import { LucideIcon, TrendingDown, TrendingUp } from 'lucide-react'
import { AreaChart, Area, ResponsiveContainer } from 'recharts'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface StatsCardProps {
  title: string
  value: string | number
  description?: string
  icon: LucideIcon
  trend?: { value: number; label: string }
  sparklineData?: number[]
  sparklineColor?: string
  isLoading?: boolean
  colorClass?: string
}

export function StatsCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
  sparklineData,
  sparklineColor = '#6366f1',
  isLoading,
  colorClass = 'text-primary bg-primary/10',
}: StatsCardProps) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="mt-4 space-y-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-3 w-32" />
          </div>
        </CardContent>
      </Card>
    )
  }

  const chartData = sparklineData?.map((v, i) => ({ i, v }))

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className={cn('flex items-center justify-center w-10 h-10 rounded-lg', colorClass)}>
            <Icon className="w-5 h-5" />
          </div>
          {trend && (
            <div
              className={cn(
                'flex items-center gap-1 text-xs font-medium rounded-full px-2 py-1',
                trend.value >= 0
                  ? 'text-green-600 bg-green-500/10'
                  : 'text-red-500 bg-red-500/10'
              )}
            >
              {trend.value >= 0 ? (
                <TrendingUp className="w-3 h-3" />
              ) : (
                <TrendingDown className="w-3 h-3" />
              )}
              {Math.abs(trend.value)}%
            </div>
          )}
        </div>
        <div className="mt-4">
          <div className="text-3xl font-bold text-foreground">{value}</div>
          <p className="text-sm font-medium text-foreground mt-1">{title}</p>
          {description && (
            <p className="text-xs text-muted-foreground mt-1">{description}</p>
          )}
          {trend && (
            <p className="text-xs text-muted-foreground mt-1">{trend.label}</p>
          )}
        </div>
        {chartData && chartData.length > 1 && (
          <div className="mt-3 h-10 -mx-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id={`spark-${title.replace(/\s/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={sparklineColor} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={sparklineColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke={sparklineColor}
                  strokeWidth={1.5}
                  fill={`url(#spark-${title.replace(/\s/g, '')})`}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
