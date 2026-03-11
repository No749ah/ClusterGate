'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function Breadcrumbs() {
  const pathname = usePathname()

  const segments = pathname.split('/').filter(Boolean)

  // Build breadcrumb items from path segments
  const items = segments.map((segment, index) => {
    const href = '/' + segments.slice(0, index + 1).join('/')
    const label = segment.charAt(0).toUpperCase() + segment.slice(1)
    const isLast = index === segments.length - 1
    return { href, label, isLast }
  })

  // Always start with Dashboard
  const crumbs = [
    { href: '/dashboard', label: 'Dashboard', isLast: items.length === 0 || (items.length === 1 && items[0].href === '/dashboard') },
    ...items.filter((item) => item.href !== '/dashboard'),
  ]

  // Recalculate isLast
  crumbs.forEach((crumb, i) => {
    crumb.isLast = i === crumbs.length - 1
  })

  if (crumbs.length <= 1) return null

  return (
    <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-4">
      {crumbs.map((crumb, i) => (
        <span key={crumb.href} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-muted-foreground/50">/</span>}
          {crumb.isLast ? (
            <span className="text-foreground font-medium">{crumb.label}</span>
          ) : (
            <Link
              href={crumb.href}
              className="hover:text-foreground transition-colors"
            >
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  )
}
