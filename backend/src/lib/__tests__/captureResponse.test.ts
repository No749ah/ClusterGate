import { describe, it, expect } from 'vitest'
import { createCaptureResponse } from '../captureResponse'
import { clearApiSecurityHeaders } from '../proxySecurityHeaders'

describe('createCaptureResponse', () => {
  it('supports clearApiSecurityHeaders, which proxyRequest calls before copying upstream headers', () => {
    const { res, captured } = createCaptureResponse()
    res.setHeader('content-security-policy', "default-src 'self'")
    res.setHeader('Content-Type', 'application/json')

    expect(() => clearApiSecurityHeaders(res as any)).not.toThrow()
    expect(captured.headers).toEqual({ 'Content-Type': 'application/json' })
  })

  it('captures status and body', () => {
    const { res, captured } = createCaptureResponse()
    res.status(201).send(Buffer.from('{"ok":true}'))
    expect(res.statusCode).toBe(201)
    expect(captured).toMatchObject({ status: 201, body: '{"ok":true}' })

    res.json({ ok: false })
    expect(captured.body).toBe('{"ok":false}')
  })
})
