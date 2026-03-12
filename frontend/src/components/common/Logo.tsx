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
  const clickTimer = useRef<ReturnType<typeof setTimeout>>()

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
      <defs>
        <linearGradient id="logo-g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="hsl(var(--primary))" />
          <stop offset="100%" stopColor="hsl(var(--primary) / 0.7)" />
        </linearGradient>
      </defs>
      {/* Shield/hexagon shape */}
      <path
        d="M16 2 L28 8.5 L28 23.5 L16 30 L4 23.5 L4 8.5 Z"
        fill="url(#logo-g)"
        opacity="0.15"
        stroke="url(#logo-g)"
        strokeWidth="1.5"
      />
      {/* Central dot */}
      <circle cx="16" cy="16" r="3.5" fill="url(#logo-g)" />
      {/* Connection lines */}
      <line x1="16" y1="12.5" x2="16" y2="6" stroke="url(#logo-g)" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="16" y1="19.5" x2="16" y2="26" stroke="url(#logo-g)" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="12.5" y1="16" x2="6" y2="12" stroke="url(#logo-g)" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="19.5" y1="16" x2="26" y2="12" stroke="url(#logo-g)" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="12.5" y1="16" x2="6" y2="20" stroke="url(#logo-g)" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="19.5" y1="16" x2="26" y2="20" stroke="url(#logo-g)" strokeWidth="1.5" strokeLinecap="round" />
      {/* Outer dots */}
      <circle cx="16" cy="5" r="2" fill="url(#logo-g)" />
      <circle cx="16" cy="27" r="2" fill="url(#logo-g)" />
      <circle cx="5.5" cy="11.5" r="2" fill="url(#logo-g)" />
      <circle cx="26.5" cy="11.5" r="2" fill="url(#logo-g)" />
      <circle cx="5.5" cy="20.5" r="2" fill="url(#logo-g)" />
      <circle cx="26.5" cy="20.5" r="2" fill="url(#logo-g)" />
    </svg>
  )
}

export function LogoLarge({ size = 64, className }: LogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      fill="none"
      width={size}
      height={size}
      className={className}
    >
      <defs>
        <linearGradient id="logo-glow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="50%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#a78bfa" />
        </linearGradient>
        <linearGradient id="logo-gate" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#c4b5fd" />
        </linearGradient>
      </defs>
      {/* Outer ring */}
      <circle cx="256" cy="256" r="230" stroke="url(#logo-glow)" strokeWidth="18" fill="none" opacity="0.25" />
      <circle cx="256" cy="256" r="230" stroke="url(#logo-glow)" strokeWidth="6" fill="none" opacity="0.6" />
      {/* Gate hexagon */}
      <path d="M256 60 L430 160 L430 352 L256 452 L82 352 L82 160 Z" stroke="url(#logo-glow)" strokeWidth="10" fill="none" opacity="0.35" />
      <path d="M256 90 L408 178 L408 334 L256 422 L104 334 L104 178 Z" stroke="url(#logo-gate)" strokeWidth="4" fill="none" opacity="0.5" />
      {/* Central node */}
      <circle cx="256" cy="256" r="44" fill="url(#logo-glow)" />
      <circle cx="256" cy="256" r="28" fill="#1e1b4b" opacity="0.6" />
      <circle cx="256" cy="256" r="14" fill="url(#logo-gate)" />
      {/* Connection lines */}
      <line x1="256" y1="212" x2="256" y2="108" stroke="url(#logo-gate)" strokeWidth="4" opacity="0.7" />
      <line x1="256" y1="300" x2="256" y2="404" stroke="url(#logo-gate)" strokeWidth="4" opacity="0.7" />
      <line x1="212" y1="256" x2="120" y2="200" stroke="url(#logo-gate)" strokeWidth="4" opacity="0.7" />
      <line x1="300" y1="256" x2="392" y2="200" stroke="url(#logo-gate)" strokeWidth="4" opacity="0.7" />
      <line x1="212" y1="256" x2="120" y2="312" stroke="url(#logo-gate)" strokeWidth="4" opacity="0.7" />
      <line x1="300" y1="256" x2="392" y2="312" stroke="url(#logo-gate)" strokeWidth="4" opacity="0.7" />
      {/* Outer nodes */}
      <circle cx="256" cy="98" r="20" fill="url(#logo-glow)" opacity="0.9" />
      <circle cx="256" cy="414" r="20" fill="url(#logo-glow)" opacity="0.9" />
      <circle cx="112" cy="194" r="20" fill="url(#logo-glow)" opacity="0.9" />
      <circle cx="400" cy="194" r="20" fill="url(#logo-glow)" opacity="0.9" />
      <circle cx="112" cy="318" r="20" fill="url(#logo-glow)" opacity="0.9" />
      <circle cx="400" cy="318" r="20" fill="url(#logo-glow)" opacity="0.9" />
      {/* Inner dots */}
      <circle cx="256" cy="98" r="7" fill="#c4b5fd" />
      <circle cx="256" cy="414" r="7" fill="#c4b5fd" />
      <circle cx="112" cy="194" r="7" fill="#c4b5fd" />
      <circle cx="400" cy="194" r="7" fill="#c4b5fd" />
      <circle cx="112" cy="318" r="7" fill="#c4b5fd" />
      <circle cx="400" cy="318" r="7" fill="#c4b5fd" />
      {/* Arrows */}
      <polygon points="256,130 248,146 264,146" fill="url(#logo-gate)" opacity="0.8" />
      <polygon points="256,382 248,366 264,366" fill="url(#logo-gate)" opacity="0.8" />
      <polygon points="148,206 156,220 142,216" fill="url(#logo-gate)" opacity="0.8" />
      <polygon points="364,206 356,220 370,216" fill="url(#logo-gate)" opacity="0.8" />
    </svg>
  )
}
