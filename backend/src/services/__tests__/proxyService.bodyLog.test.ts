import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Readable } from 'stream'

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
import { config } from '../../config'
import { TRUNCATION_MARKER } from '../../lib/streamCapture'

function makeReq(method: string, body: unknown, headers: Record<string, string> = {}) {
  const h: Record<string, string> = { 'user-agent': 'vitest', ...headers }
  return {
    method,
    path: '/r/agent',
    headers: h,
    query: {},
    body,
    ip: '203.0.113.5',
    protocol: 'https',
    hostname: 'gate.example.com',
    socket: { remoteAddress: '203.0.113.5' },
    get: (key: string) => h[key.toLowerCase()],
  } as any
}

function makeRes() {
  const res: any = { headers: {} as Record<string, string> }
  res.setHeader = (k: string, v: string) => { res.headers[k.toLowerCase()] = v }
  res.removeHeader = (k: string) => { delete res.headers[k.toLowerCase()] }
  res.getHeader = (k: string) => res.headers[k.toLowerCase()]
  res.status = (s: number) => { res.statusCode = s; return res }
  res.send = (b: unknown) => { res.sent = b; return res }
  return res
}

const route = {
  id: 'route-1',
  name: 'agent',
  publicPath: '/r/agent',
  targetUrl: 'http://agent.default.svc:8080',
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
  streamResponse: false,
} as any

async function loggedData() {
  for (let i = 0; i < 50 && prismaMock.requestLog.create.mock.calls.length === 0; i++) {
    await new Promise((r) => setTimeout(r, 10))
  }
  return prismaMock.requestLog.create.mock.calls[0][0].data
}

describe('proxyRequest — logged request and response bodies', () => {
  beforeEach(() => {
    axiosMock.mockReset()
    prismaMock.requestLog.create.mockReset().mockResolvedValue({ id: 'log-1' })
    prismaMock.requestLog.update.mockReset().mockResolvedValue({})
  })

  it('logs a buffered JSON request body (raw parser hands over a Buffer)', async () => {
    axiosMock.mockResolvedValue({ status: 200, headers: { 'content-type': 'application/json' }, data: Buffer.from('{"ok":true}') })
    const payload = '{"chatInput":"Fasse das Dokument zusammen"}'
    await proxyRequest(route, makeReq('POST', Buffer.from(payload), { 'content-type': 'application/json' }), makeRes())
    const data = await loggedData()
    expect(data.requestBody).toBe(payload)
    expect(data.responseBody).toBe('{"ok":true}')
  })

  it('logs a streamed request body without changing what reaches the upstream', async () => {
    let forwarded = ''
    axiosMock.mockImplementation(async (cfg: any) => {
      for await (const chunk of cfg.data) forwarded += chunk.toString('utf8')
      return { status: 200, headers: { 'content-type': 'text/plain' }, data: Buffer.from('done') }
    })
    const req = Object.assign(Readable.from([Buffer.from('{"a":'), Buffer.from('1}')]), makeReq('POST', undefined, { 'content-type': 'application/json' }))
    await proxyRequest(route, req, makeRes())
    expect(forwarded).toBe('{"a":1}')
    const data = await loggedData()
    expect(data.requestBody).toBe('{"a":1}')
  })

  it('marks a cut response body instead of silently truncating it', async () => {
    const big = 'z'.repeat(config.LOG_BODY_LIMIT + 500)
    axiosMock.mockResolvedValue({ status: 200, headers: { 'content-type': 'text/plain' }, data: Buffer.from(big) })
    const res = makeRes()
    await proxyRequest(route, makeReq('GET', undefined), res)
    expect(Buffer.from(res.sent).toString('utf8')).toBe(big)
    const data = await loggedData()
    expect(data.responseBody.startsWith('z'.repeat(config.LOG_BODY_LIMIT))).toBe(true)
    expect(data.responseBody).toContain(`${TRUNCATION_MARKER}: showing first ${config.LOG_BODY_LIMIT} of ${big.length} bytes]`)
  })

  it('logs a placeholder for binary request and response bodies', async () => {
    axiosMock.mockResolvedValue({ status: 200, headers: { 'content-type': 'image/png' }, data: Buffer.from([0x89, 0x50, 0x4e, 0x47]) })
    await proxyRequest(route, makeReq('POST', Buffer.from([0, 1, 2, 3, 4]), { 'content-type': 'application/octet-stream' }), makeRes())
    const data = await loggedData()
    expect(data.requestBody).toBe('[binary body: 5 bytes, application/octet-stream]')
    expect(data.responseBody).toBe('[binary body: 4 bytes, image/png]')
  })

  it('still logs nothing for a request without a body', async () => {
    axiosMock.mockResolvedValue({ status: 204, headers: {}, data: Buffer.alloc(0) })
    await proxyRequest(route, makeReq('GET', undefined), makeRes())
    const data = await loggedData()
    expect(data.requestBody).toBeUndefined()
    expect(data.responseBody).toBeUndefined()
  })
})

