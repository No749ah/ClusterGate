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
      {/* One route in, splitting into the cluster's lanes */}
      <path
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth="3.3"
        strokeLinecap="round"
        d="M3.5 16 H11.5 M11.5 16 C16 16 16 8.5 20.5 8.5 H28.5 M11.5 16 C16 16 16 23.5 20.5 23.5 H28.5"
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
      <path
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth="3"
        strokeLinecap="round"
        d="M3.5 16 H11.5 M11.5 16 C16 16 16 8.5 20.5 8.5 H28.5 M11.5 16 C16 16 16 23.5 20.5 23.5 H28.5"
      />
    </svg>
  )
}
