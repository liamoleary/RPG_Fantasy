/**
 * Save sync (Launch Plan §2) — a background courtesy, never a gate.
 *
 * Shape of the thing:
 *   boot      → ensure an account, GET the server save, merge, hand it back
 *   meta change → queue a PUT, flush it when the network allows
 *   409       → the server holds more renown; merge its copy in and re-send
 *   offline   → the queued PUT sits in localStorage until `online` fires
 *
 * The queue holds exactly one payload. Because the meta slice is cumulative and
 * reconciliation is a field-wise merge (see state/meta.ts), an older queued PUT
 * carries nothing the newer one lacks — so a queue depth of one loses nothing
 * and can't grow without bound on a device that has been offline for a week.
 */
import { mergeMeta, metaEquals, type MetaSave } from '../state/meta'
import { SAVE_VERSION } from '../state/persist'
import { readAccount, type DeviceAccount } from './account'
import { api, probablyOffline } from './client'

export const QUEUE_KEY = 'bannerfell.syncqueue.v1'

interface QueuedWrite {
  meta: MetaSave
  /** Set when the write came from a run end, which is what lets renown drop
   *  legitimately (§2's stale-write rule). */
  runDelta: boolean
}

/** Last slice we know the server has, so we can skip no-op writes. */
let lastSynced: MetaSave | null = null
let flushing = false

/**
 * One-shot flag set by the store when a run ends. It is the only thing that
 * lets a write lower the stored renown (§2), so it is deliberately consumed
 * rather than left standing — a later, unrelated write must not inherit it.
 */
let pendingRunDelta = false

export function markRunEnd(): void {
  pendingRunDelta = true
}

export function consumeRunDelta(): boolean {
  const was = pendingRunDelta
  pendingRunDelta = false
  return was
}

export function readQueue(): QueuedWrite | null {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as QueuedWrite
    return parsed?.meta && typeof parsed.meta.renown === 'number' ? parsed : null
  } catch {
    return null
  }
}

function writeQueue(entry: QueuedWrite | null): void {
  try {
    if (entry === null) localStorage.removeItem(QUEUE_KEY)
    else localStorage.setItem(QUEUE_KEY, JSON.stringify(entry))
  } catch {
    // Out of quota: the write is simply lost, and the next meta change requeues
    // a superset of it. Nothing the player did is gone — that lives in the save.
  }
}

/**
 * Pull the server's copy at boot and reconcile.
 *
 * Returns the meta slice the caller should adopt, or null to keep what it has.
 * Also handles §2's migration clause: a 404 means this account has no server
 * save yet, so the local progress becomes the initial one — current testers
 * lose nothing.
 */
export async function pullMeta(local: MetaSave): Promise<MetaSave | null> {
  const account = readAccount()
  if (!account) return null

  const res = await api<{ saveVersion: number; data: MetaSave }>('GET', '/api/save', { token: account.token })

  if (res.status === 404) {
    // First authenticated boot: seed the server from this device (§2).
    queueWrite(local, false)
    void flushQueue()
    return null
  }
  if (!res.ok || !res.data?.data) return null
  if (res.data.saveVersion !== SAVE_VERSION) {
    // A save written by a different client version. Leave it alone rather than
    // guessing; the version bump is where a migration would go.
    console.warn('[sync] server save version mismatch; skipping')
    return null
  }

  const merged = mergeMeta(res.data.data, local)
  lastSynced = res.data.data
  // Only push back if the merge actually added something the server lacks.
  if (!metaEquals(merged, res.data.data)) {
    queueWrite(merged, false)
    void flushQueue()
  }
  return merged
}

/**
 * Record a meta change for syncing. Cheap and synchronous — it writes one
 * localStorage key and returns; the network happens later, in flushQueue.
 */
export function queueWrite(meta: MetaSave, runDelta: boolean): void {
  const pending = readQueue()
  writeQueue({
    meta: pending ? mergeMeta(pending.meta, meta) : meta,
    // Once a run end is in the queue, the merged payload still represents it.
    runDelta: runDelta || pending?.runDelta === true,
  })
}

/** Nothing to send, or nothing new to send. */
function nothingToDo(entry: QueuedWrite | null): boolean {
  return entry === null || (lastSynced !== null && metaEquals(entry.meta, lastSynced))
}

/**
 * Send the queued write if there is one. Safe to call at any time and from
 * anywhere: concurrent calls collapse, failures leave the queue intact for the
 * next attempt, and it resolves quietly whatever happens.
 */
export async function flushQueue(): Promise<void> {
  if (flushing) return
  const account = readAccount()
  if (!account || probablyOffline()) return

  const entry = readQueue()
  if (nothingToDo(entry)) {
    if (entry) writeQueue(null)
    return
  }

  flushing = true
  try {
    await send(account, entry as QueuedWrite)
  } finally {
    flushing = false
  }
}

async function send(account: DeviceAccount, entry: QueuedWrite): Promise<void> {
  const res = await api<{ ok: true }>('PUT', '/api/save', {
    token: account.token,
    body: { saveVersion: SAVE_VERSION, data: entry.meta, runDelta: entry.runDelta },
  })

  if (res.ok) {
    lastSynced = entry.meta
    writeQueue(null)
    return
  }

  if (res.status === 409) {
    // §2: the server holds more renown. Reapply our delta on top of its copy
    // and send once more. One retry only — if that also conflicts, another
    // device is actively writing and the next meta change will carry us anyway.
    const server = (res.data as unknown as { data?: MetaSave } | undefined)?.data
    if (server) {
      const reconciled = mergeMeta(server, entry.meta)
      lastSynced = server
      writeQueue({ meta: reconciled, runDelta: entry.runDelta })
      const retry = await api<{ ok: true }>('PUT', '/api/save', {
        token: account.token,
        body: { saveVersion: SAVE_VERSION, data: reconciled, runDelta: entry.runDelta },
      })
      if (retry.ok) {
        lastSynced = reconciled
        writeQueue(null)
      }
    }
    return
  }

  if (res.status === 400) {
    // The server rejected the shape. Retrying can't fix that, and keeping it
    // queued would block every later write behind a payload that never lands.
    console.warn('[sync] server rejected the save payload; dropping it')
    writeQueue(null)
    return
  }

  // 401, 503, offline: keep the queue and try again on the next trigger.
}

/** Testing seam — module-level memo of what the server last confirmed. */
export function __resetSyncState(): void {
  lastSynced = null
  flushing = false
  pendingRunDelta = false
}
