/**
 * Update check (Launch Plan §6).
 *
 * A stale PWA silently running old balance is the classic playtest
 * data-poisoner: the tester reports a problem that was fixed two deploys ago,
 * and the telemetry lands under a build id nobody is looking at any more. This
 * closes that by asking the server what it is serving and offering a reload
 * when the answer differs.
 *
 * Like everything in net/, it never blocks and never nags: one silent check on
 * boot, one on becoming visible, and a toast the player can ignore.
 */
import { BUILD_ID } from '../build'
import { api } from './client'

export type UpdateListener = (behind: boolean) => void

let listener: UpdateListener | null = null
let announced = false

export function onUpdateAvailable(fn: UpdateListener | null): void {
  listener = fn
}

export async function checkVersion(): Promise<boolean> {
  // A dev build has no deployed id to be behind of.
  if (BUILD_ID === 'dev') return false
  const res = await api<{ buildId: string }>('GET', '/api/version')
  const server = res.data?.buildId
  if (!res.ok || !server || server === 'unknown') return false

  const behind = server !== BUILD_ID
  if (behind && !announced) {
    announced = true
    listener?.(true)
  }
  return behind
}

/**
 * Take the update: let a waiting service worker through, then reload. Without
 * skipWaiting the new worker sits idle until every tab closes, which on a
 * phone is approximately never.
 */
export async function applyUpdate(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg?.waiting) reg.waiting.postMessage({ type: 'skip-waiting' })
    await reg?.update()
  } catch {
    // No worker, or it refused. The reload below is still the fix.
  }
  window.location.reload()
}

export function startVersionWatch(): void {
  if (typeof window === 'undefined') return
  void checkVersion()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkVersion()
  })
}

/** Test seam. */
export function __resetVersionWatch(): void {
  announced = false
  listener = null
}
