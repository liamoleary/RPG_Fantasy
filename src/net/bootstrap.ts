/**
 * Starts sync and then gets out of the way (Launch Plan §2).
 *
 * Everything here is deliberately fire-and-forget. `startSync()` returns
 * immediately; the account handshake and the first pull happen behind the game,
 * which is already interactive off localStorage before any of this runs. If the
 * network never answers, nothing in the UI waits, retries visibly, or complains.
 */
import { metaOf } from '../state/meta'
import { onSaveWritten } from '../state/persist'
import { useGame } from '../state/store'
import { ensureAccount } from './account'
import { consumeRunDelta, flushQueue, pullMeta, queueWrite, __resetSyncState } from './sync'

let started = false

export function startSync(): void {
  if (started || typeof window === 'undefined') return
  started = true

  /* Every local write is a candidate for sync, but almost none of them are a
     meta change — settings toggles and the twenty-odd per-run persist points
     all leave the server's slice untouched. queueWrite merges into the pending
     payload, and flushQueue drops it if it matches what the server already has,
     so the common case costs one localStorage read and no request. */
  onSaveWritten((save) => {
    queueWrite(metaOf(save), consumeRunDelta())
    void flushQueue()
  })

  void (async () => {
    const account = await ensureAccount()
    if (!account) return // Offline first visit: play on, sync when it returns.

    const merged = await pullMeta(metaOf(useGame.getState().save))
    if (merged) {
      // Adopting the server's copy goes through the store so the UI re-renders
      // with the restored renown rather than showing it after the next action.
      useGame.getState().applyMeta(merged)
    }
    void flushQueue()
  })()

  // Reconnect and foreground are the two moments a queued write can suddenly
  // succeed. Both are cheap no-ops when the queue is empty.
  window.addEventListener('online', () => void flushQueue())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void flushQueue()
  })
}

/** Test seam: forget that sync ever started. */
export function __resetBootstrap(): void {
  started = false
  onSaveWritten(null)
  __resetSyncState()
}
