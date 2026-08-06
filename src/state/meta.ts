/**
 * The meta slice — the part of the save the server owns (Launch Plan §2).
 *
 * Split here, in pure functions, rather than inside the sync layer: deciding
 * *what* is server-authoritative and *how* two copies reconcile is the part
 * that has to be right, and it should be testable without a network, a
 * database or a browser.
 */
import { SAVE_VERSION, type SaveData } from './persist'

/** Server-authoritative fields. `activeRun` and `settings` are absent by design. */
export interface MetaSave {
  renown: number
  unlocks: string[]
  feats: Record<string, true>
  stats: SaveData['stats']
}

export const SAVE_VERSION_FOR_SYNC = SAVE_VERSION

export function metaOf(save: SaveData): MetaSave {
  return {
    renown: save.renown,
    unlocks: [...save.unlocks],
    feats: { ...save.feats },
    stats: {
      runs: save.stats.runs,
      wins: save.stats.wins,
      bestPlacementByHero: { ...save.stats.bestPlacementByHero },
    },
  }
}

/** Graft a meta slice back onto a full save, leaving run and settings untouched. */
export function withMeta(save: SaveData, meta: MetaSave): SaveData {
  return { ...save, renown: meta.renown, unlocks: meta.unlocks, feats: meta.feats, stats: meta.stats }
}

/**
 * Cheap structural comparison, used to answer "is there anything worth
 * syncing?" — settings changes and every phase of a run write the save, and
 * none of them should cost an API call.
 */
export function metaEquals(a: MetaSave, b: MetaSave): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))
}

function canonical(meta: MetaSave) {
  return {
    renown: meta.renown,
    unlocks: [...meta.unlocks].sort(),
    feats: Object.keys(meta.feats).sort(),
    stats: {
      runs: meta.stats.runs,
      wins: meta.stats.wins,
      best: Object.entries(meta.stats.bestPlacementByHero).sort(([x], [y]) => x.localeCompare(y)),
    },
  }
}

/**
 * Reconcile two copies of the meta slice.
 *
 * §2 asks for last-write-wins plus a stale-write guard, explicitly "without
 * building real merge machinery". This is the smallest thing that satisfies
 * the guard's follow-up — "the client refetches and reapplies its delta" —
 * without inventing a CRDT: take the better of each field. Renown and counters
 * only ever go up, unlocks and feats only ever accumulate, and a placement is
 * better when it is lower. Progress can therefore never be lost by a merge,
 * only by a deliberate overwrite.
 */
export function mergeMeta(a: MetaSave, b: MetaSave): MetaSave {
  const bestByHero: Record<string, number> = { ...a.stats.bestPlacementByHero }
  for (const [heroId, placement] of Object.entries(b.stats.bestPlacementByHero)) {
    const current = bestByHero[heroId]
    bestByHero[heroId] = current === undefined ? placement : Math.min(current, placement)
  }

  const runs = Math.max(a.stats.runs, b.stats.runs)
  return {
    renown: Math.max(a.renown, b.renown),
    unlocks: [...new Set([...a.unlocks, ...b.unlocks])],
    feats: { ...a.feats, ...b.feats },
    stats: {
      runs,
      // Wins can't exceed runs after a merge that took each from a different side.
      wins: Math.min(runs, Math.max(a.stats.wins, b.stats.wins)),
      bestPlacementByHero: bestByHero,
    },
  }
}
