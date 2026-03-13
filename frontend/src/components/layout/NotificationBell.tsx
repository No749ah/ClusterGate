'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Bell, CheckCheck, AlertTriangle, Activity, Zap } from 'lucide-react'
import { useNotifications, useUnreadCount, useMarkAsRead, useMarkAllAsRead } from '@/hooks/useNotifications'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatRelativeTime } from '@/lib/utils'
import { cn } from '@/lib/utils'

const TYPE_ICONS: Record<string, typeof Bell> = {
  'route.error': AlertTriangle,
  'health.down': Activity,
  'route.published': Zap,
}

const TYPE_COLORS: Record<string, string> = {
  'route.error': 'text-red-500',
  'health.down': 'text-yellow-500',
  'route.published': 'text-green-500',
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const { data: countData } = useUnreadCount()
  const notifQuery = useNotifications()
  const markRead = useMarkAsRead()
  const markAllRead = useMarkAllAsRead()

  const count = countData?.data?.count ?? 0
  const notifications = notifQuery.data?.data ?? []

  return (
    <DropdownMenu open={open} onOpenChange={(v) => {
      setOpen(v)
      if (v) notifQuery.refetch()
    }}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 relative text-foreground hover:text-foreground [&>svg]:text-foreground">
          <Bell className="h-4 w-4 text-foreground" />
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-medium">
              {count > 9 ? '9+' : count}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0 border border-border shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
          <p className="text-sm font-medium">Notifications</p>
          {count > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-6 px-2"
              onClick={() => markAllRead.mutate()}
            >
              <CheckCheck className="w-3 h-3 mr-1" />
              Mark all read
            </Button>
          )}
        </div>

        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <Bell className="w-6 h-6 mx-auto mb-2 opacity-50" />
              <p className="text-xs">No notifications</p>
            </div>
          ) : (
            notifications.slice(0, 10).map((notif) => {
              const Icon = TYPE_ICONS[notif.type] ?? Bell
              const color = TYPE_COLORS[notif.type] ?? 'text-muted-foreground'

              return (
                <div
                  key={notif.id}
                  className={cn(
                    'flex gap-3 px-4 py-3 hover:bg-muted/30 transition-colors border-b border-border/20 cursor-pointer',
                    !notif.isRead && 'bg-primary/5'
                  )}
                  onClick={() => {
                    if (!notif.isRead) markRead.mutate(notif.id)
                  }}
                >
                  <Icon className={cn('w-4 h-4 mt-0.5 flex-shrink-0', color)} />
                  <div className="min-w-0 flex-1">
                    <p className={cn('text-xs font-medium', !notif.isRead && 'text-foreground')}>
                      {notif.title}
                    </p>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                      {notif.message}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-muted-foreground">
                        {formatRelativeTime(notif.createdAt)}
                      </span>
                      {notif.route && (
                        <Link
                          href={`/routes/${notif.route.id}`}
                          className="text-[10px] text-primary hover:underline"
                          onClick={(e) => {
                            e.stopPropagation()
                            setOpen(false)
                          }}
                        >
                          {notif.route.name}
                        </Link>
                      )}
                    </div>
                  </div>
                  {!notif.isRead && (
                    <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />
                  )}
                </div>
              )
            })
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
