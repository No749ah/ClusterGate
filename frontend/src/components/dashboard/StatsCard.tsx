import Link from 'next/link'
import { ArrowUpRight, LucideIcon, TrendingDown, TrendingUp } from 'lucide-react'
import { AreaChart, Area, ResponsiveContainer } from 'recharts'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface StatsCardProps {
  title: string
  value: string | number
  description?: string
  icon?: LucideIcon
  trend?: { value: number; label: string }
  sparklineData?: number[]
  sparklineColor?: string
  isLoading?: boolean
  // When set, the whole card becomes a clickable link to this page.
  href?: string
}

export function StatsCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
  sparklineData,
  sparklineColor = 'hsl(var(--primary))',
  isLoading,
  href,
}: StatsCardProps) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-5">
          <Skeleton className="h-3.5 w-24" />
          <div className="mt-3 space-y-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-3 w-32" />
          </div>
        </CardContent>
      </Card>
    )
  }

  const chartData = sparklineData?.map((v, i) => ({ i, v }))

  const body = (
    <CardContent className="p-5 h-full">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {Icon && <Icon className="w-3.5 h-3.5" />}
          {title}
        </span>
        <span className="flex items-center gap-2">
          {trend && (
            <span
              className={cn(
                'flex items-center gap-1 text-xs font-medium tabular-nums',
                trend.value >= 0 ? 'text-emerald-600 dark:text-emerald-500' : 'text-destructive'
              )}
            >
              {trend.value >= 0 ? (
                <TrendingUp className="w-3 h-3" />
              ) : (
                <TrendingDown className="w-3 h-3" />
              )}
              {Math.abs(trend.value)}%
            </span>
          )}
          {href && (
            <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-foreground transition-colors" />
          )}
        </span>
      </div>
      <div className="mt-3">
        <div className="text-2xl font-semibold tabular-nums text-foreground">{value}</div>
        {(description || trend) && (
          <p className="text-xs text-muted-foreground mt-1">
            {[description, trend?.label].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
      {chartData && chartData.length > 1 && (
        <div className="mt-3 h-9 -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id={`spark-${title.replace(/\s/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={sparklineColor} stopOpacity={0.25} />
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
  )

  if (href) {
    return (
      <Link href={href} className="block group">
        <Card className="overflow-hidden h-full transition-colors hover:border-muted-foreground/30 cursor-pointer">
          {body}
        </Card>
      </Link>
    )
  }
  return <Card className="overflow-hidden h-full">{body}</Card>
}
