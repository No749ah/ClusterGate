'use client'

import { useState, useCallback, useEffect } from 'react'

const PARTY_KEY = 'clustergate-party-mode'

export function usePartyMode() {
  const [active, setActive] = useState(false)

  useEffect(() => {
    // Check if party mode was active (survives page nav but not refresh)
    if (sessionStorage.getItem(PARTY_KEY) === 'true') {
      setActive(true)
      document.documentElement.classList.add('party-mode')
    }
  }, [])

  const toggle = useCallback(() => {
    setActive((prev) => {
      const next = !prev
      if (next) {
        document.documentElement.classList.add('party-mode')
        sessionStorage.setItem(PARTY_KEY, 'true')
      } else {
        document.documentElement.classList.remove('party-mode')
        sessionStorage.removeItem(PARTY_KEY)
      }
      return next
    })
  }, [])

  const activate = useCallback(() => {
    if (!active) {
      setActive(true)
      document.documentElement.classList.add('party-mode')
      sessionStorage.setItem(PARTY_KEY, 'true')
    }
  }, [active])

  const deactivate = useCallback(() => {
    setActive(false)
    document.documentElement.classList.remove('party-mode')
    sessionStorage.removeItem(PARTY_KEY)
  }, [])

  return { active, toggle, activate, deactivate }
}
