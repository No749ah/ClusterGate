'use client'

import { useState, useCallback, useEffect, useRef } from 'react'

const PARTY_KEY = 'clustergate-party-mode'
const PARTY_DURATION = 30000 // 30 seconds

export function usePartyMode() {
  const [active, setActive] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  const stopParty = useCallback(() => {
    setActive(false)
    document.documentElement.classList.remove('party-mode')
    sessionStorage.removeItem(PARTY_KEY)
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  const startParty = useCallback((duration = PARTY_DURATION) => {
    setActive(true)
    document.documentElement.classList.add('party-mode')
    sessionStorage.setItem(PARTY_KEY, 'true')
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(stopParty, duration)
  }, [stopParty])

  useEffect(() => {
    if (sessionStorage.getItem(PARTY_KEY) === 'true') {
      startParty()
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [startParty])

  const toggle = useCallback(() => {
    if (active) {
      stopParty()
    } else {
      startParty()
    }
  }, [active, startParty, stopParty])

  return { active, toggle, activate: startParty, deactivate: stopParty }
}
