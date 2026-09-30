import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PassThrough, Readable } from 'stream'

const axiosMock = vi.hoisted(() => vi.fn())
const prismaMock = vi.hoisted(() => ({
  requestLog: {
    create: vi.fn(),
    update: vi.fn(),
  },
}))
vi.mock('axios', () => ({ default: axiosMock }))
vi.mock('../../lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('../geoipService', () => ({ lookupIp: () => ({}) }))

import { proxyRequest } from '../proxyService'

function makeReq() {
  const headers: Record<string, string> = { 'user-agent': 'vitest' }
  return {
    method: 'GET',
    path: '/r/chat/stream',
    headers,
    query: {},
    ip: '203.0.113.5',
    protocol: 'https',
    hostname: 'gate.example.com',
    socket: { remoteAddress: '203.0.113.5' },
    get: (key: string) => headers[key.toLowerCase()],
  } as any
}

// A writable that also looks enough like an express Response for the stream path
function makeRes() {
  const res = new PassThrough() as any
  const received: Buffer[] = []
  res.on('data', (c: Buffer) => received.push(c))
  res.headers = {} as Record<string, string>
  res.setHeader = (k: string, v: string) => { res.headers[k.toLowerCase()] = v }
  res.removeHeader = (k: string) => { delete res.headers[k.toLowerCase()] }
  res.getHeader = (k: string) => res.headers[k.toLowerCase()]
  res.status = (s: number) => { res.statusCode = s; return res }
  res.flushHeaders = () => {}
  res.body = () => Buffer.concat(received).toString('utf8')
  return res
}

const route = {
  id: 'route-1',
  name: 'chat',
  publicPath: '/r/chat/*',
  targetUrl: 'http://chat.default.svc:8080',
  ipAllowlist: [],
  removeHeaders: [],
  addHeaders: {},
  rewriteRules: [],
  stripPrefix: false,
  timeout: 1000,
  retryCount: 0,
  circuitBreakerEnabled: false,
  requireAuth: false,
  authType: 'NONE',
  streamResponse: true,
} as any

async function waitFor(fn: () => void) {
  for (let i = 0; i < 50; i++) {
    try { fn(); return } catch { await new Promise((r) => setTimeout(r, 10)) }
  }
  fn()
}

describe('proxyRequest — streamed response logging', () => {
  beforeEach(() => {
    axiosMock.mockReset()
    prismaMock.requestLog.create.mockReset().mockResolvedValue({ id: 'log-1' })
    prismaMock.requestLog.update.mockReset().mockResolvedValue({})
  })

  it('passes the stream through unchanged and logs the captured body', async () => {
    const frames = ['data: {"content":"Hel"}\n\n', 'data: {"content":"lo"}\n\n', 'data: [DONE]\n\n']
    axiosMock.mockResolvedValue({
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'set-cookie': 'a=b' },
      data: Readable.from(frames.map((f) => Buffer.from(f))),
    })
    const res = makeRes()
    await proxyRequest(route, makeReq(), res)

    expect(res.body()).toBe(frames.join(''))
    const created = prismaMock.requestLog.create.mock.calls[0][0].data
    expect(created.responseBody).toBe('[streaming…]')
    expect(created.responseHeaders['content-type']).toBe('text/event-stream')

    await waitFor(() => expect(prismaMock.requestLog.update).toHaveBeenCalledTimes(1))
    const update = prismaMock.requestLog.update.mock.calls[0][0]
    expect(update.where).toEqual({ id: 'log-1' })
    expect(update.data.responseBody).toBe(frames.join(''))
  })

  it('redacts PII in the captured body like buffered logs', async () => {
    axiosMock.mockResolvedValue({
      status: 200,
      headers: { 'content-type': 'text/plain' },
      data: Readable.from([Buffer.from('contact: alice@example.com\n')]),
    })
    await proxyRequest(route, makeReq(), makeRes())
    await waitFor(() => expect(prismaMock.requestLog.update).toHaveBeenCalled())
    const body = prismaMock.requestLog.update.mock.calls[0][0].data.responseBody
    expect(body).not.toContain('alice@example.com')
    expect(body).toContain('a***@example.com')
  })

  it('writes the log once the budget is spent, while the stream is still open', async () => {
    const upstream = new PassThrough()
    axiosMock.mockResolvedValue({ status: 200, headers: { 'content-type': 'text/plain' }, data: upstream })
    const res = makeRes()
    const done = proxyRequest(route, makeReq(), res)
    await waitFor(() => expect(prismaMock.requestLog.create).toHaveBeenCalled())

    upstream.write(Buffer.from('y'.repeat(6000)))
    await waitFor(() => expect(prismaMock.requestLog.update).toHaveBeenCalledTimes(1))
    const body = prismaMock.requestLog.update.mock.calls[0][0].data.responseBody as string
    expect(body.startsWith('y'.repeat(5000))).toBe(true)
    expect(body).toContain('stream still open')

    upstream.end(Buffer.from('tail'))
    await done
    expect(res.body()).toBe('y'.repeat(6000) + 'tail')
    // no second write after the early flush
    expect(prismaMock.requestLog.update).toHaveBeenCalledTimes(1)
  })

  it('logs a placeholder instead of binary content', async () => {
    axiosMock.mockResolvedValue({
      status: 200,
      headers: { 'content-type': 'audio/mpeg' },
      data: Readable.from([Buffer.from([0xff, 0xfb, 0x90, 0x00])]),
    })
    const res = makeRes()
    await proxyRequest(route, makeReq(), res)
    await waitFor(() => expect(prismaMock.requestLog.update).toHaveBeenCalled())
    expect(prismaMock.requestLog.update.mock.calls[0][0].data.responseBody).toBe('[binary stream: 4 bytes, audio/mpeg]')
  })
})
