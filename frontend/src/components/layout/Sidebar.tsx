'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Route,
  ScrollText,
  Users,
  Settings,
  Network,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'

const navItems = [
  {
    href: '/dashboard',
    icon: LayoutDashboard,
    label: 'Dashboard',
    exact: true,
  },
  {
    href: '/routes',
    icon: Route,
    label: 'Routes',
  },
  {
    href: '/logs',
    icon: ScrollText,
    label: 'Logs',
  },
  {
    href: '/users',
    icon: Users,
    label: 'Users',
    adminOnly: true,
  },
  {
    href: '/settings',
    icon: Settings,
    label: 'Settings',
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const { user } = useAuth()

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href
    return pathname.startsWith(href)
  }

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 flex flex-col bg-sidebar border-r border-sidebar-border">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-sidebar-border">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/20 border border-primary/30">
          <Network className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-sm font-semibold text-sidebar-foreground">ClusterGate</h1>
          <p className="text-xs text-muted-foreground">Routing Gateway</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        <p className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Management
        </p>

        {navItems.map((item) => {
          if (item.adminOnly && user?.role !== 'ADMIN') return null

          const active = isActive(item.href, item.exact)
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group',
                active
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:bg-white/5 hover:text-sidebar-foreground'
              )}
            >
              <Icon
                className={cn(
                  'w-4 h-4 flex-shrink-0 transition-colors',
                  active ? 'text-primary' : 'text-muted-foreground group-hover:text-sidebar-foreground'
                )}
              />
              <span className="flex-1">{item.label}</span>
              {active && <ChevronRight className="w-3 h-3 text-primary opacity-60" />}
            </Link>
          )
        })}
      </nav>

      {/* User info */}
      {user && (
        <div className="p-3 border-t border-sidebar-border">
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/5">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/20 text-primary text-xs font-semibold flex-shrink-0">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-sidebar-foreground truncate">{user.name}</p>
              <p className="text-xs text-muted-foreground truncate">{user.role}</p>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
