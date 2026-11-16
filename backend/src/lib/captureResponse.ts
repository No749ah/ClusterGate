// Response stand-in for the route test panel: proxyRequest writes into it
// instead of a real socket, and the router returns what was captured.
// It must cover every Response method proxyRequest uses on the buffered path.

export interface CapturedResponse {
  status?: number
  body?: string
  headers: Record<string, string>
}

const BODY_LIMIT = 10000

export function createCaptureResponse() {
  const captured: CapturedResponse = { headers: {} }

  const res = {
    statusCode: 200,
    setHeader(key: string, value: string) {
      captured.headers[key] = value
      return res
    },
    // proxyRequest drops the API's page-level security headers before it
    // copies the upstream headers (clearApiSecurityHeaders).
    removeHeader(key: string) {
      for (const k of Object.keys(captured.headers)) {
        if (k.toLowerCase() === key.toLowerCase()) delete captured.headers[k]
      }
    },
    status(code: number) {
      res.statusCode = code
      captured.status = code
      return res
    },
    send(data: Buffer | string) {
      captured.body = typeof data === 'string' ? data : data.toString('utf8').slice(0, BODY_LIMIT)
      return res
    },
    json(data: unknown) {
      captured.body = JSON.stringify(data).slice(0, BODY_LIMIT)
      return res
    },
  }

  return { res, captured }
}
