/**
 * Boots the real Express app on an ephemeral port and returns a tiny fetch
 * wrapper. Deliberately no supertest: the app is plain HTTP and node has fetch,
 * so this exercises the actual middleware stack — helmet, the body limit, the
 * error handler — rather than a synthetic request object.
 */
import type { Server } from 'node:http'
// @ts-expect-error — server/ is plain ESM JavaScript, outside the TS build.
import { createApp } from '../../server/app.js'

export interface ApiResponse<T = any> {
  status: number
  body: T
  headers: Headers
}

export interface TestServer {
  url: string
  close: () => Promise<void>
  api: (method: string, path: string, opts?: { body?: unknown; token?: string; raw?: string }) => Promise<ApiResponse>
}

export async function startTestServer(): Promise<TestServer> {
  const app = createApp({ dist: '/nonexistent-dist' })
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s))
  })
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  const url = `http://127.0.0.1:${port}`

  const api = async (method: string, path: string, opts: { body?: unknown; token?: string; raw?: string } = {}) => {
    const headers: Record<string, string> = {}
    if (opts.body !== undefined || opts.raw !== undefined) headers['content-type'] = 'application/json'
    if (opts.token) headers.authorization = `Bearer ${opts.token}`
    const res = await fetch(`${url}${path}`, {
      method,
      headers,
      body: opts.raw !== undefined ? opts.raw : opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    })
    const text = await res.text()
    let body: unknown
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
    return { status: res.status, body, headers: res.headers }
  }

  return {
    url,
    api,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  }
}
