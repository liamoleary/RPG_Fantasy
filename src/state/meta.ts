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
  /**
   * The climb is progression, so the server owns it like renown does (DN09).
   * Optional because it has to be: a payload written by a client that shipped
   * before War Tiers has no `tiers` key at all, and the sync layer must merge
   * it without inventing a ladder or throwing.
   */
  tiers?: SaveData['tiers']
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
    tiers: {
      highestUnlocked: save.tiers.highestUnlocked,
      highestWon: save.tiers.highestWon,
      records: { ...save.tiers.records },
      bestByHero: { ...save.tiers.bestByHero },
    },
  }
}

/** Graft a meta slice back onto a full save, leaving run and settings untouched. */
export function withMeta(save: SaveData, meta: MetaSave): SaveData {
  return {
    ...save,
    renown: meta.renown,
    unlocks: meta.unlocks,
    feats: meta.feats,
    stats: meta.stats,
    // A server copy from before War Tiers carries no ladder; keeping the local
    // one is right, because the alternative is resetting a player's climb to
    // Tier 1 the first time an old payload comes back.
    tiers: meta.tiers ? mergeTiers(save.tiers, meta.tiers) : save.tiers,
  }
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
    tiers: mergeTiers(a.tiers, b.tiers),
  }
}

/**
 * Two devices climbing the same ladder. Everything here takes the better of
 * the two, because losing never demotes (§4) and a merge is not a loss: the
 * highest unlocked and won tiers are maxima, per-tier records add up to the
 * larger side rather than summing (summing would double-count a run that
 * synced from both devices), and each hero keeps its best.
 */
function mergeTiers(a?: SaveData['tiers'], b?: SaveData['tiers']): SaveData['tiers'] {
  const EMPTY: SaveData['tiers'] = { highestUnlocked: 1, highestWon: 1, records: {}, bestByHero: {} }
  a = a ?? EMPTY
  b = b ?? EMPTY
  const records: SaveData['tiers']['records'] = {}
  for (const key of new Set([...Object.keys(a.records), ...Object.keys(b.records)])) {
    const x = a.records[key] ?? { reached: 0, fallen: 0 }
    const y = b.records[key] ?? { reached: 0, fallen: 0 }
    // Larger side wins rather than summing: a campaign that synced from two
    // devices must not be counted twice. `fallen` can never exceed `reached`,
    // or the history column would claim more endings than arrivals.
    const reached = Math.max(x.reached, y.reached)
    records[key] = { reached, fallen: Math.min(reached, Math.max(x.fallen, y.fallen)) }
  }
  const bestByHero: Record<string, number> = { ...a.bestByHero }
  for (const [heroId, tier] of Object.entries(b.bestByHero)) {
    bestByHero[heroId] = Math.max(bestByHero[heroId] ?? 0, tier)
  }
  return {
    highestUnlocked: Math.max(a.highestUnlocked, b.highestUnlocked),
    highestWon: Math.max(a.highestWon, b.highestWon),
    records,
    bestByHero,
  }
}
