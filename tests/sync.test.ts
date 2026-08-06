/**
 * The client half of §2: the offline queue, the 409 recovery, and the promise
 * §2 makes loudest — "never block play on any API call". These run without a
 * database or a browser, against a stubbed fetch and localStorage.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ACCOUNT_KEY } from '../src/net/account'
import { api } from '../src/net/client'
import { flushQueue, markRunEnd, pullMeta, QUEUE_KEY, queueWrite, readQueue, __resetSyncState } from '../src/net/sync'
import type { MetaSave } from '../src/state/meta'

const meta = (over: Partial<MetaSave> = {}): MetaSave => ({
  renown: 0,
  unlocks: [],
  feats: {},
  stats: { runs: 0, wins: 0, bestPlacementByHero: {} },
  ...over,
})

/** Minimal localStorage; the real one isn't present in a node test env. */
function installLocalStorage() {
  const map = new Map<string, string>()
  const store = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size
    },
  }
  vi.stubGlobal('localStorage', store)
  return store
}

interface StubResponse {
  status: number
  body?: unknown
}

/** Queue of canned responses; each call shifts one off. */
function installFetch(responses: StubResponse[]) {
  const calls: { method: string; path: string; body: unknown }[] = []
  vi.stubGlobal('fetch', async (path: string, init: RequestInit = {}) => {
    calls.push({
      method: init.method ?? 'GET',
      path,
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    })
    const next = responses.shift()
    if (!next) throw new TypeError('network error') // exhausted == offline
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      json: async () => next.body ?? {},
    } as Response
  })
  return calls
}

beforeEach(() => {
  installLocalStorage()
  __resetSyncState()
  vi.stubGlobal('navigator', { onLine: true })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('api() — the never-throws contract', () => {
  it('resolves rather than throwing when the network fails', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(api('GET', '/api/save')).resolves.toEqual({ ok: false, status: 0 })
  })

  it('resolves when the request aborts on timeout', async () => {
    vi.stubGlobal('fetch', async (_p: string, init: RequestInit) => {
      const err = new Error('aborted')
      err.name = 'AbortError'
      void init
      throw err
    })
    await expect(api('GET', '/api/save', { timeoutMs: 1 })).resolves.toMatchObject({ ok: false })
  })

  it('survives a response that is not JSON', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('not json')
      },
    }))
    await expect(api('GET', '/api/save')).resolves.toMatchObject({ ok: true, status: 200 })
  })

  it('reports a server error as a status, not an exception', async () => {
    installFetch([{ status: 503, body: { error: 'unavailable' } }])
    await expect(api('GET', '/api/save')).resolves.toMatchObject({ ok: false, status: 503 })
  })
})

describe('the queue', () => {
  it('merges successive writes into one payload', () => {
    queueWrite(meta({ renown: 5, unlocks: ['a'] }), false)
    queueWrite(meta({ renown: 9, unlocks: ['b'] }), false)
    const queued = readQueue()
    expect(queued?.meta.renown).toBe(9)
    expect(queued?.meta.unlocks.sort()).toEqual(['a', 'b'])
  })

  it('keeps the runDelta flag once any queued write carried it', () => {
    queueWrite(meta({ renown: 5 }), true)
    queueWrite(meta({ renown: 6 }), false)
    expect(readQueue()?.runDelta).toBe(true)
  })

  it('holds one entry, so a week offline cannot grow it without bound', () => {
    for (let i = 0; i < 500; i++) queueWrite(meta({ renown: i }), false)
    expect(localStorage.getItem(QUEUE_KEY)).toBeTruthy()
    expect(readQueue()?.meta.renown).toBe(499)
  })

  it('markRunEnd is consumed once, not inherited by later writes', async () => {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ accountId: 'a', token: 't', displayName: 'n' }))
    markRunEnd()
    const { consumeRunDelta } = await import('../src/net/sync')
    expect(consumeRunDelta()).toBe(true)
    expect(consumeRunDelta()).toBe(false)
  })
})

describe('flushQueue', () => {
  const signIn = () => localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ accountId: 'a', token: 't', displayName: 'n' }))

  it('does nothing without an account — a first visit offline still plays', async () => {
    const calls = installFetch([])
    queueWrite(meta({ renown: 3 }), false)
    await flushQueue()
    expect(calls).toHaveLength(0)
    expect(readQueue()).not.toBeNull() // kept for when the account exists
  })

  it('does not even try while the browser reports offline', async () => {
    signIn()
    vi.stubGlobal('navigator', { onLine: false })
    const calls = installFetch([{ status: 200 }])
    queueWrite(meta({ renown: 3 }), false)
    await flushQueue()
    expect(calls).toHaveLength(0)
    expect(readQueue()).not.toBeNull()
  })

  it('sends the queued write and clears it on success', async () => {
    signIn()
    const calls = installFetch([{ status: 200, body: { ok: true } }])
    queueWrite(meta({ renown: 7 }), false)
    await flushQueue()

    expect(calls).toHaveLength(1)
    expect(calls[0].method).toBe('PUT')
    expect(calls[0].path).toBe('/api/save')
    expect((calls[0].body as { data: MetaSave }).data.renown).toBe(7)
    expect(readQueue()).toBeNull()
  })

  it('keeps the queue when the server is unavailable, for the next attempt', async () => {
    signIn()
    installFetch([{ status: 503 }])
    queueWrite(meta({ renown: 7 }), false)
    await flushQueue()
    expect(readQueue()?.meta.renown).toBe(7)
  })

  it('keeps the queue when the network drops mid-flight', async () => {
    signIn()
    installFetch([]) // exhausted == throws == offline
    queueWrite(meta({ renown: 7 }), false)
    await expect(flushQueue()).resolves.toBeUndefined()
    expect(readQueue()?.meta.renown).toBe(7)
  })

  it('recovers from a 409 by merging the server copy and re-sending (§2)', async () => {
    signIn()
    const calls = installFetch([
      { status: 409, body: { error: 'stale_write', data: meta({ renown: 40, unlocks: ['from_a'] }) } },
      { status: 200, body: { ok: true } },
    ])
    queueWrite(meta({ renown: 12, unlocks: ['from_b'] }), false)
    await flushQueue()

    expect(calls).toHaveLength(2)
    const retry = (calls[1].body as { data: MetaSave }).data
    expect(retry.renown).toBe(40)
    expect(retry.unlocks.sort()).toEqual(['from_a', 'from_b'])
    expect(readQueue()).toBeNull()
  })

  it('retries a 409 only once, so it cannot spin', async () => {
    signIn()
    const calls = installFetch([
      { status: 409, body: { data: meta({ renown: 40 }) } },
      { status: 409, body: { data: meta({ renown: 50 }) } },
    ])
    queueWrite(meta({ renown: 12 }), false)
    await flushQueue()
    expect(calls).toHaveLength(2)
  })

  it('drops a payload the server calls invalid, so it cannot block later writes', async () => {
    signIn()
    installFetch([{ status: 400, body: { error: 'invalid_request' } }])
    queueWrite(meta({ renown: 7 }), false)
    await flushQueue()
    expect(readQueue()).toBeNull()
  })

  it('skips the request entirely when the server already has this slice', async () => {
    signIn()
    const calls = installFetch([{ status: 200, body: { ok: true } }, { status: 200, body: { ok: true } }])
    queueWrite(meta({ renown: 7 }), false)
    await flushQueue()
    queueWrite(meta({ renown: 7 }), false)
    await flushQueue()
    expect(calls).toHaveLength(1) // the second write was a no-op
  })
})

describe('pullMeta at boot', () => {
  const signIn = () => localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ accountId: 'a', token: 't', displayName: 'n' }))

  it('returns null without an account', async () => {
    installFetch([])
    await expect(pullMeta(meta())).resolves.toBeNull()
  })

  it('seeds the server from local progress on a 404 — §2 migration', async () => {
    signIn()
    const calls = installFetch([{ status: 404, body: { error: 'no_save' } }, { status: 200, body: { ok: true } }])
    const result = await pullMeta(meta({ renown: 25 }))

    expect(result).toBeNull() // nothing to adopt; local already is the truth
    expect(calls[1].method).toBe('PUT')
    expect((calls[1].body as { data: MetaSave }).data.renown).toBe(25)
  })

  it('merges the server copy with local progress', async () => {
    signIn()
    installFetch([
      { status: 200, body: { saveVersion: 1, data: meta({ renown: 60, unlocks: ['server'] }) } },
      { status: 200, body: { ok: true } },
    ])
    const merged = await pullMeta(meta({ renown: 10, unlocks: ['local'] }))
    expect(merged?.renown).toBe(60)
    expect(merged?.unlocks.sort()).toEqual(['local', 'server'])
  })

  it('does not push back when local adds nothing', async () => {
    signIn()
    const calls = installFetch([{ status: 200, body: { saveVersion: 1, data: meta({ renown: 60 }) } }])
    const merged = await pullMeta(meta({ renown: 10 }))
    expect(merged?.renown).toBe(60)
    expect(calls).toHaveLength(1) // GET only
  })

  it('leaves a save alone when the version does not match', async () => {
    signIn()
    installFetch([{ status: 200, body: { saveVersion: 99, data: meta({ renown: 60 }) } }])
    await expect(pullMeta(meta({ renown: 10 }))).resolves.toBeNull()
  })

  it('returns null when the server is unreachable', async () => {
    signIn()
    installFetch([])
    await expect(pullMeta(meta({ renown: 10 }))).resolves.toBeNull()
  })
})
