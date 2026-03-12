'use client'

import Link from 'next/link'
import { AlertCircle, ArrowRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useRecentErrors } from '@/hooks/useLogs'
import { formatRelativeTime, getStatusColor } from '@/lib/utils'

export function RecentErrors() {
  const { data, isLoading } = useRecentErrors(undefined, 5)
  const errors = data?.data ?? []

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-500" />
          Recent Errors
        </CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/activity">
            View all <ArrowRight className="w-3 h-3 ml-1" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : errors.length === 0 ? (
          <div className="text-center py-8">
            <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No recent errors</p>
          </div>
        ) : (
          <div className="space-y-2">
            {errors.map((log) => (
              <div key={log.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30 transition-colors text-sm">
                <span className={`font-mono font-bold ${getStatusColor(log.responseStatus)}`}>
                  {log.responseStatus}
                </span>
                <span className="text-muted-foreground font-mono text-xs">{log.method}</span>
                <span className="text-foreground truncate flex-1 font-mono text-xs">{log.path}</span>
                <span className="text-muted-foreground text-xs whitespace-nowrap">{formatRelativeTime(log.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
