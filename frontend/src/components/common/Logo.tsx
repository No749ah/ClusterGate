'use client'

import { useRef, useCallback } from 'react'
import { toast } from 'sonner'

interface LogoProps {
  size?: number
  className?: string
  onSecretClick?: () => void
}

export function Logo({ size = 32, className, onSecretClick }: LogoProps) {
  const clickCount = useRef(0)
  const clickTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const handleClick = useCallback(() => {
    clickCount.current++
    if (clickTimer.current) clearTimeout(clickTimer.current)

    if (clickCount.current >= 7) {
      clickCount.current = 0
      onSecretClick?.()
      toast('You found a secret!', { description: 'Try the Konami code next... ↑↑↓↓←→←→BA' })
    } else if (clickCount.current >= 3) {
      clickTimer.current = setTimeout(() => { clickCount.current = 0 }, 1500)
    } else {
      clickTimer.current = setTimeout(() => { clickCount.current = 0 }, 1500)
    }
  }, [onSecretClick])

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={className}
      onClick={handleClick}
      style={{ cursor: 'pointer' }}
    >
      {/* Brand tile: one route in, splitting into the cluster's services */}
      <rect width="32" height="32" rx="8" fill="hsl(var(--primary))" />
      <path
        fill="none"
        stroke="hsl(var(--sidebar))"
        strokeWidth="3"
        strokeLinecap="round"
        d="M6 16 H12.5 M12.5 16 C16.2 16 16.2 10 19.9 10 H26 M12.5 16 C16.2 16 16.2 22 19.9 22 H26"
      />
    </svg>
  )
}

export function LogoLarge({ size = 64, className }: LogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={className}
    >
      <rect width="32" height="32" rx="8" fill="hsl(var(--primary))" />
      <path
        fill="none"
        stroke="hsl(var(--sidebar))"
        strokeWidth="3"
        strokeLinecap="round"
        d="M6 16 H12.5 M12.5 16 C16.2 16 16.2 10 19.9 10 H26 M12.5 16 C16.2 16 16.2 22 19.9 22 H26"
      />
    </svg>
  )
}
