import { describe, it, expect, afterEach } from 'vitest'
import {
  deriveClientToken,
  isValidClientToken,
  safeResumeTarget,
  countSessionCookies,
  isTopLevelNavigation,
  clientTokenRequired,
} from '../clientToken'
import { config } from '../../config'

function req(method: string, headers: Record<string, string>) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]))
  return { method, get: (k: string) => lower[k.toLowerCase()] } as any
}

describe('client token', () => {
  it('is stable per session and differs between sessions', () => {
    expect(deriveClientToken('jwt-a')).toBe(deriveClientToken('jwt-a'))
    expect(deriveClientToken('jwt-a')).not.toBe(deriveClientToken('jwt-b'))
  })

  it('accepts only the token of the same session', () => {
    const token = deriveClientToken('jwt-a')
    expect(isValidClientToken('jwt-a', token)).toBe(true)
    expect(isValidClientToken('jwt-b', token)).toBe(false)
    expect(isValidClientToken('jwt-a', token.slice(1))).toBe(false)
    expect(isValidClientToken('jwt-a', undefined)).toBe(false)
    expect(isValidClientToken('jwt-a', ['x'])).toBe(false)
    expect(isValidClientToken('jwt-a', '')).toBe(false)
  })
})

describe('isTopLevelNavigation', () => {
  it('accepts a GET document navigation', () => {
    expect(isTopLevelNavigation(req('GET', { 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document' }))).toBe(true)
  })

  it('rejects fetch, iframes, missing metadata and non-GET', () => {
    expect(isTopLevelNavigation(req('GET', { 'Sec-Fetch-Mode': 'cors', 'Sec-Fetch-Dest': 'empty' }))).toBe(false)
    expect(isTopLevelNavigation(req('GET', { 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'iframe' }))).toBe(false)
    expect(isTopLevelNavigation(req('GET', {}))).toBe(false)
    expect(isTopLevelNavigation(req('POST', { 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document' }))).toBe(false)
  })
})

describe('countSessionCookies', () => {
  it('counts cg_session entries only', () => {
    expect(countSessionCookies(undefined)).toBe(0)
    expect(countSessionCookies('cg_csrf=1; cg_session=a')).toBe(1)
    expect(countSessionCookies('cg_session=planted; other=1; cg_session=real')).toBe(2)
    expect(countSessionCookies('xcg_session=a; cg_session_x=b')).toBe(0)
  })
})

describe('safeResumeTarget', () => {
  const allowed = ['https://ui.example.com']

  it('keeps UI paths with their query', () => {
    expect(safeResumeTarget('/dashboard', allowed)).toBe('/dashboard')
    expect(safeResumeTarget('/routes/abc?tab=logs', allowed)).toBe('/routes/abc?tab=logs')
  })

  it('drops any fragment', () => {
    expect(safeResumeTarget('/dashboard#x', allowed)).toBe('/dashboard')
  })

  it('refuses API, proxy and metrics paths in any spelling', () => {
    for (const to of ['/r/app', '/R/app', '/r', '/api/routes', '/API/x', '/metrics', '/dashboard/../r/app', '/%72/app', '/x/%2e%2e/r/app']) {
      expect(safeResumeTarget(to, allowed), to).toBeNull()
    }
  })

  it('refuses other origins and protocol-relative tricks', () => {
    for (const to of ['https://evil.example/dashboard', '//evil.example/x', '/\\evil.example/x', 'javascript:alert(1)', 'https://user:pw@ui.example.com/x']) {
      expect(safeResumeTarget(to, allowed), to).toBeNull()
    }
  })

  it('allows absolute URLs on an allowed UI origin (split deployments)', () => {
    expect(safeResumeTarget('https://ui.example.com/dashboard?a=1', allowed)).toBe('https://ui.example.com/dashboard?a=1')
    expect(safeResumeTarget('https://ui.example.com/r/app', allowed)).toBeNull()
  })

  it('refuses non-strings and oversized input', () => {
    expect(safeResumeTarget(undefined, allowed)).toBeNull()
    expect(safeResumeTarget(['/dashboard'], allowed)).toBeNull()
    expect(safeResumeTarget('/' + 'a'.repeat(3000), allowed)).toBeNull()
  })
})

describe('clientTokenRequired', () => {
  const original = config.API_CLIENT_TOKEN_REQUIRED
  afterEach(() => {
    ;(config as any).API_CLIENT_TOKEN_REQUIRED = original
  })

  it('is on by default and can be switched off explicitly', () => {
    ;(config as any).API_CLIENT_TOKEN_REQUIRED = undefined
    expect(clientTokenRequired()).toBe(true)
    ;(config as any).API_CLIENT_TOKEN_REQUIRED = 'true'
    expect(clientTokenRequired()).toBe(true)
    ;(config as any).API_CLIENT_TOKEN_REQUIRED = 'false'
    expect(clientTokenRequired()).toBe(false)
    ;(config as any).API_CLIENT_TOKEN_REQUIRED = 'OFF'
    expect(clientTokenRequired()).toBe(false)
  })
})
