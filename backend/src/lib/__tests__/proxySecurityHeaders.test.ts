import { describe, it, expect } from 'vitest'
import { hardenProxyResponseHeaders, clearApiSecurityHeaders, SANDBOX_CSP } from '../proxySecurityHeaders'

describe('hardenProxyResponseHeaders', () => {
  it('drops Service-Worker-Allowed and Cross-Origin-Opener-Policy in any casing', () => {
    const h = hardenProxyResponseHeaders({
      'service-worker-allowed': '/',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'content-type': 'text/html',
    })
    expect(h).toEqual({ 'content-type': 'text/html' })
  })

  it('drops Set-Cookie for ClusterGate cookie names but keeps app cookies', () => {
    const h = hardenProxyResponseHeaders({
      'set-cookie': [
        'cg_session=planted; Path=/api; HttpOnly',
        'CG_CSRF=x; Path=/',
        '__Host-cg_session=y; Path=/; Secure',
        'app_session=ok; Path=/r/app',
      ],
    })
    expect(h['set-cookie']).toEqual(['app_session=ok; Path=/r/app'])
  })

  it('removes the header entirely when only ClusterGate cookies were set', () => {
    const h = hardenProxyResponseHeaders({ 'set-cookie': 'cg_session=x; Path=/' })
    expect(h).not.toHaveProperty('set-cookie')
  })

  it('leaves CSP alone when the route is not sandboxed', () => {
    const h = hardenProxyResponseHeaders({ 'content-security-policy': "default-src 'self'" })
    expect(h).toEqual({ 'content-security-policy': "default-src 'self'" })
  })

  it('adds the sandbox CSP for sandboxed routes', () => {
    const h = hardenProxyResponseHeaders({ 'content-type': 'text/html' }, { sandbox: true })
    expect(h['Content-Security-Policy']).toBe(SANDBOX_CSP)
    expect(SANDBOX_CSP).toMatch(/^sandbox /)
    expect(SANDBOX_CSP).not.toMatch(/allow-same-origin|allow-top-navigation|escape-sandbox/)
  })

  it('keeps the upstream CSP next to the sandbox policy', () => {
    const h = hardenProxyResponseHeaders({ 'Content-Security-Policy': "default-src 'self'" }, { sandbox: true })
    expect(h['Content-Security-Policy']).toEqual(["default-src 'self'", SANDBOX_CSP])
  })
})

describe('clearApiSecurityHeaders', () => {
  it("removes the API's CSP, COOP and CORP but keeps other headers", () => {
    const headers: Record<string, string> = {
      'content-security-policy': "default-src 'none'",
      'cross-origin-opener-policy': 'same-origin',
      'cross-origin-resource-policy': 'same-origin',
      'x-content-type-options': 'nosniff',
    }
    const res = { removeHeader: (k: string) => delete headers[k.toLowerCase()] } as any
    clearApiSecurityHeaders(res)
    expect(headers).toEqual({ 'x-content-type-options': 'nosniff' })
  })
})
