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
  LogOut,
  BarChart3,
  HardDrive,
} from 'lucide-react'
import { Logo } from '@/components/common/Logo'
import { cn } from '@/lib/utils'
import { useAuth, useLogout } from '@/hooks/useAuth'

const COLLAPSED_KEY = 'clustergate-sidebar-collapsed'

interface NavItem {
  href: string
  icon: any
  label: string
  exact?: boolean
  adminOnly?: boolean
}

interface NavSection {
  title: string
  items: NavItem[]
}

const navSections: NavSection[] = [
  {
    title: 'Overview',
    items: [
      { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', exact: true },
      { href: '/analytics', icon: BarChart3, label: 'Analytics' },
    ],
  },
  {
    title: 'Traffic',
    items: [
      { href: '/routes', icon: Route, label: 'Routes' },
      { href: '/activity', icon: ScrollText, label: 'Logs' },
    ],
  },
  {
    title: 'Administration',
    items: [
      { href: '/users', icon: Users, label: 'Users', adminOnly: true },
      { href: '/audit', icon: Shield, label: 'Audit Log', adminOnly: true },
      { href: '/backups', icon: HardDrive, label: 'Backups', adminOnly: true },
      { href: '/settings', icon: Settings, label: 'Settings' },
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const { user } = useAuth()
  const logoutMutation = useLogout()
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

  const renderNavItem = (item: NavItem) => {
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
  }

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 h-screen flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-200',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo + collapse toggle */}
      <div className={cn(
        'flex items-center border-b border-sidebar-border transition-all duration-200',
        collapsed ? 'justify-center px-2 py-5' : 'px-4 py-5'
      )}>
        <div className={cn('flex items-center', collapsed ? '' : 'gap-3 flex-1')}>
          <Logo size={36} />
          {!collapsed && (
            <div className="overflow-hidden">
              <h1 className="text-sm font-semibold text-sidebar-foreground whitespace-nowrap">ClusterGate</h1>
              <p className="text-xs text-muted-foreground whitespace-nowrap">Routing Gateway</p>
            </div>
          )}
        </div>
        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-sidebar-foreground hover:bg-white/5 transition-colors"
            title="Collapse sidebar"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 overflow-y-auto">
        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            className="flex items-center justify-center w-full px-2 py-2 mb-2 rounded-lg text-muted-foreground hover:text-sidebar-foreground hover:bg-white/5 transition-colors"
            title="Expand sidebar"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
        )}

        {navSections.map((section, idx) => {
          // Filter visible items in this section
          const visibleItems = section.items.filter(
            (item) => !item.adminOnly || user?.role === 'ADMIN'
          )
          if (visibleItems.length === 0) return null

          return (
            <div key={section.title} className={cn(idx > 0 && 'mt-4')}>
              {!collapsed && (
                <p className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {section.title}
                </p>
              )}
              {collapsed && idx > 0 && (
                <div className="mx-2 my-2 border-t border-sidebar-border" />
              )}
              <div className="space-y-1">
                {section.items.map(renderNavItem)}
              </div>
            </div>
          )
        })}
      </nav>

      {/* User info — always visible at bottom-left */}
      {user && (
        <div className={cn('border-t border-sidebar-border', collapsed ? 'p-2' : 'p-3')}>
          {collapsed ? (
            <div className="flex flex-col items-center gap-2">
              <Link
                href="/settings"
                title={`${user.name} (${user.role})`}
                className="flex items-center justify-center w-9 h-9 rounded-full bg-primary/20 text-primary text-xs font-semibold hover:bg-primary/30 transition-colors"
              >
                {user.name.charAt(0).toUpperCase()}
              </Link>
              <button
                onClick={() => logoutMutation.mutate()}
                title="Logout"
                className="flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-white/5 transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/5">
              <Link
                href="/settings"
                className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/20 text-primary text-xs font-semibold flex-shrink-0 hover:bg-primary/30 transition-colors"
              >
                {user.name.charAt(0).toUpperCase()}
              </Link>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-sidebar-foreground truncate">{user.name}</p>
                <p className="text-xs text-muted-foreground truncate">{user.role}</p>
              </div>
              <button
                onClick={() => logoutMutation.mutate()}
                title="Logout"
                className="p-1.5 rounded-md text-muted-foreground hover:text-red-400 hover:bg-white/5 transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </aside>
  )
}
