'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Route,
  ScrollText,
  Users,
  Settings,
  ChevronRight,
  Shield,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import { Logo } from '@/components/common/Logo'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'

const COLLAPSED_KEY = 'clustergate-sidebar-collapsed'

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
    href: '/audit',
    icon: Shield,
    label: 'Audit Log',
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
  const [collapsed, setCollapsed] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(COLLAPSED_KEY)
    if (stored === 'true') setCollapsed(true)
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return
    localStorage.setItem(COLLAPSED_KEY, String(collapsed))
    window.dispatchEvent(new CustomEvent('sidebar-toggle', { detail: { collapsed } }))
  }, [collapsed, mounted])

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href
    return pathname.startsWith(href)
  }

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 h-screen flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-200',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className={cn(
        'flex items-center border-b border-sidebar-border transition-all duration-200',
        collapsed ? 'justify-center px-2 py-5' : 'gap-3 px-4 py-5'
      )}>
        <Logo size={36} />
        {!collapsed && (
          <div className="overflow-hidden">
            <h1 className="text-sm font-semibold text-sidebar-foreground whitespace-nowrap">ClusterGate</h1>
            <p className="text-xs text-muted-foreground whitespace-nowrap">Routing Gateway</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {!collapsed && (
          <p className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Management
          </p>
        )}

        {navItems.map((item) => {
          if (item.adminOnly && user?.role !== 'ADMIN') return null

          const active = isActive(item.href, item.exact)
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                'flex items-center rounded-lg text-sm font-medium transition-all group',
                collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5',
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
              {!collapsed && <span className="flex-1">{item.label}</span>}
              {!collapsed && active && <ChevronRight className="w-3 h-3 text-primary opacity-60" />}
            </Link>
          )
        })}
      </nav>

      {/* User info */}
      {user && !collapsed && (
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

      {/* Collapse toggle */}
      <div className={cn(
        'border-t border-sidebar-border',
        collapsed ? 'p-2' : 'p-3'
      )}>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            'flex items-center rounded-lg text-sm text-muted-foreground hover:text-sidebar-foreground hover:bg-white/5 transition-all w-full',
            collapsed ? 'justify-center px-2 py-2' : 'gap-3 px-3 py-2'
          )}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <PanelLeftOpen className="w-4 h-4 flex-shrink-0" />
          ) : (
            <>
              <PanelLeftClose className="w-4 h-4 flex-shrink-0" />
              <span className="text-xs">Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  )
}
