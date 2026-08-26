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
      fill="none"
      width={size}
      height={size}
      className={className}
      onClick={handleClick}
      style={{ cursor: 'pointer' }}
    >
      {/* Cluster boundary with a gate opening on the left; traffic enters through it */}
      <path
        d="M6 12 V11 Q6 5 12 5 H20 Q26 5 26 11 V21 Q26 27 20 27 H12 Q6 27 6 21 V20"
        stroke="hsl(var(--primary))"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M11.5 10.5 L18 16 L11.5 21.5"
        stroke="hsl(var(--primary))"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function LogoLarge({ size = 64, className }: LogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      fill="none"
      width={size}
      height={size}
      className={className}
    >
      <path
        d="M6 12 V11 Q6 5 12 5 H20 Q26 5 26 11 V21 Q26 27 20 27 H12 Q6 27 6 21 V20"
        stroke="hsl(var(--primary))"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M11.5 10.5 L18 16 L11.5 21.5"
        stroke="hsl(var(--primary))"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
