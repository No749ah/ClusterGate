'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Home, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

const MESSAGES = [
  'This page went on vacation.',
  'Looks like this route took a wrong turn.',
  'The packets arrived, but no one was home.',
  '404: Gateway to nowhere.',
  'Even our proxy can\'t find this one.',
  'This page is playing hide and seek. It\'s winning.',
  'You\'ve reached the edge of the cluster.',
  'Route not found. Have you tried /r/?',
]

export default function NotFound() {
  const [message, setMessage] = useState('')
  const [glitch, setGlitch] = useState(false)

  useEffect(() => {
    setMessage(MESSAGES[Math.floor(Math.random() * MESSAGES.length)])
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      setGlitch(true)
      setTimeout(() => setGlitch(false), 200)
    }, 4000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center space-y-6 max-w-md">
        <div className="relative">
          <h1
            className={`text-8xl font-bold text-primary/20 select-none transition-transform ${
              glitch ? 'translate-x-1 skew-x-2' : ''
            }`}
          >
            404
          </h1>
          <p
            className={`absolute inset-0 flex items-center justify-center text-8xl font-bold text-primary transition-transform ${
              glitch ? '-translate-x-1 -skew-x-1' : ''
            }`}
            style={glitch ? { clipPath: 'inset(30% 0 40% 0)' } : undefined}
          >
            404
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">Page Not Found</h2>
          <p className="text-muted-foreground">{message}</p>
        </div>

        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" onClick={() => history.back()}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Back
          </Button>
          <Button asChild>
            <Link href="/dashboard">
              <Home className="w-4 h-4 mr-2" />
              Dashboard
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
