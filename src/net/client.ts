/**
 * The one place the game talks to a network (Launch Plan §2).
 *
 * The contract every caller relies on: **this never throws and never hangs.**
 * A failed request resolves to `{ ok: false }`. There is no retry loop, no
 * spinner, no error surfaced to the player — an offline tester is playing a
 * single-player game that happens not to be syncing, which is exactly what §2
 * asks for ("never block play on any API call").
 */

/** Requests die here rather than leaving a promise dangling on a flaky phone. */
const TIMEOUT_MS = 8000

export interface ApiResult<T> {
  ok: boolean
  status: number
  data?: T
}

const OFFLINE = 0

export async function api<T>(
  method: string,
  path: string,
  opts: { body?: unknown; token?: string | null; timeoutMs?: number } = {},
): Promise<ApiResult<T>> {
  // Same-origin only (§7): no base URL, no CORS, nothing configurable.
  if (typeof fetch === 'undefined') return { ok: false, status: OFFLINE }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), opts.timeoutMs ?? TIMEOUT_MS) : null

  try {
    const headers: Record<string, string> = {}
    if (opts.body !== undefined) headers['content-type'] = 'application/json'
    if (opts.token) headers.authorization = `Bearer ${opts.token}`

    const res = await fetch(path, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: controller?.signal,
      credentials: 'same-origin',
      cache: 'no-store',
    })

    let data: T | undefined
    try {
      data = (await res.json()) as T
    } catch {
      // A 204, or HTML from a proxy. The status still tells us what happened.
    }
    return { ok: res.ok, status: res.status, data }
  } catch {
    // Offline, DNS failure, abort, CSP — all the same to the caller.
    return { ok: false, status: OFFLINE }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** True when the browser is confident there is no network. Absence of the API
 *  (or a lying `navigator`) is treated as "might be online" — better to try. */
export function probablyOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}
