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
      {/* Kubernetes hexagon with the gate cut out of it — the door into the cluster */}
      <path
        fillRule="evenodd"
        fill="hsl(var(--primary))"
        d="M10.6 3.74 L21.4 3.74 Q23.2 3.74 24.1 5.3 L29.5 14.65 Q30.3 16 29.5 17.35 L24.1 26.7 Q23.2 28.26 21.4 28.26 L10.6 28.26 Q8.8 28.26 7.9 26.7 L2.5 17.35 Q1.7 16 2.5 14.65 L7.9 5.3 Q8.8 3.74 10.6 3.74 Z M12.6 28.26 L12.6 17.6 Q12.6 14.2 16 14.2 Q19.4 14.2 19.4 17.6 L19.4 28.26 Z"
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
        fillRule="evenodd"
        fill="hsl(var(--primary))"
        d="M10.6 3.74 L21.4 3.74 Q23.2 3.74 24.1 5.3 L29.5 14.65 Q30.3 16 29.5 17.35 L24.1 26.7 Q23.2 28.26 21.4 28.26 L10.6 28.26 Q8.8 28.26 7.9 26.7 L2.5 17.35 Q1.7 16 2.5 14.65 L7.9 5.3 Q8.8 3.74 10.6 3.74 Z M12.6 28.26 L12.6 17.6 Q12.6 14.2 16 14.2 Q19.4 14.2 19.4 17.6 L19.4 28.26 Z"
      />
    </svg>
  )
}
