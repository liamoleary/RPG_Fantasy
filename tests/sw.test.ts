/**
 * The service worker's fetch policy.
 *
 * This exists because of a bug that unit tests could not have caught and a
 * browser run did: the worker is cache-first for everything it doesn't
 * explicitly skip, so it happily cached `GET /api/save`. The first legitimate
 * "no save yet" 404 was then replayed from cache forever, and a player's
 * progress could never come back from the server (§10.2).
 *
 * Rather than grep the source, this loads the real worker in a sandbox, hands
 * it a synthetic fetch event, and asks whether it tried to answer.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'

type Listener = (event: unknown) => void

function loadWorker(): Record<string, Listener> {
  const listeners: Record<string, Listener> = {}
  const sandbox: Record<string, unknown> = {
    self: {
      addEventListener: (type: string, fn: Listener) => {
        listeners[type] = fn
      },
      location: { origin: 'https://bannerfell.test' },
      skipWaiting: () => {},
      clients: { claim: async () => {} },
    },
    caches: {
      open: async () => ({ addAll: async () => {}, add: async () => {}, put: async () => {}, match: async () => undefined }),
      keys: async () => [],
      delete: async () => true,
      match: async () => undefined,
    },
    fetch: async () => ({ ok: true, clone: () => ({}) }),
    URL,
    console,
  }
  vm.createContext(sandbox)
  vm.runInContext(readFileSync(path.resolve('public/sw.js'), 'utf8'), sandbox)
  return listeners
}

/** Returns true when the worker intercepted the request. */
function intercepts(request: { method: string; url: string; mode?: string }): boolean {
  const handler = loadWorker().fetch
  let responded = false
  handler({ request, respondWith: () => void (responded = true) })
  return responded
}

describe('service worker fetch policy', () => {
  it('registers a fetch handler at all', () => {
    expect(typeof loadWorker().fetch).toBe('function')
  })

  it('never intercepts the API — sync owns its own offline story (§2)', () => {
    for (const url of [
      'https://bannerfell.test/api/save',
      'https://bannerfell.test/api/account',
      'https://bannerfell.test/api/account/link',
      'https://bannerfell.test/api/runs',
      'https://bannerfell.test/api/feedback',
    ]) {
      expect(intercepts({ method: 'GET', url, mode: 'cors' })).toBe(false)
    }
  })

  it('never intercepts the health check', () => {
    expect(intercepts({ method: 'GET', url: 'https://bannerfell.test/healthz', mode: 'cors' })).toBe(false)
  })

  it('still caches the art and the bundles, which is the point of it', () => {
    expect(intercepts({ method: 'GET', url: 'https://bannerfell.test/art/units/vd_dryad.webp', mode: 'cors' })).toBe(true)
    expect(intercepts({ method: 'GET', url: 'https://bannerfell.test/assets/index-abc123.js', mode: 'cors' })).toBe(true)
  })

  it('still handles the document, so the app opens offline', () => {
    expect(intercepts({ method: 'GET', url: 'https://bannerfell.test/', mode: 'navigate' })).toBe(true)
  })

  it('ignores non-GET and cross-origin requests', () => {
    expect(intercepts({ method: 'POST', url: 'https://bannerfell.test/api/save' })).toBe(false)
    expect(intercepts({ method: 'GET', url: 'https://elsewhere.test/thing.js', mode: 'cors' })).toBe(false)
  })
})
