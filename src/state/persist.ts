/** localStorage persistence (§12.5). Versioned, migration-ready. */
import type { RunState } from '../engine/run'
import type { Difficulty } from '../engine/rivals'

export const SAVE_KEY = 'bannerfell.save.v1'
export const SAVE_VERSION = 1

export interface SaveData {
  version: number
  renown: number
  unlocks: string[]
  feats: Record<string, true>
  stats: {
    runs: number
    wins: number
    bestPlacementByHero: Record<string, number>
  }
  /** War Tiers (DN09 §7.4). The climb, and what it has cost so far. */
  tiers: {
    /** the highest tier you may choose from Home */
    highestUnlocked: number
    /** the highest tier you have actually won at — separate on purpose (§4) */
    highestWon: number
    /** attempts and wins per tier, for the picker's record column */
    records: Record<string, { runs: number; wins: number }>
    /** the best tier each hero has won at, for the hero-select chip */
    bestByHero: Record<string, number>
  }
  settings: {
    speedDefault: 1 | 2
    reducedMotion: boolean
    difficulty: Difficulty
  }
  activeRun?: RunState | null
}

export const DEFAULT_SAVE: SaveData = {
  version: SAVE_VERSION,
  renown: 0,
  unlocks: [],
  feats: {},
  stats: { runs: 0, wins: 0, bestPlacementByHero: {} },
  tiers: { highestUnlocked: 1, highestWon: 1, records: {}, bestByHero: {} },
  settings: { speedDefault: 1, reducedMotion: false, difficulty: 'standard' },
  activeRun: null,
}

/**
 * A run saved before the War Council (DN05) stores `boonsTaken` on each warlord
 * and no talent state at all. Resuming one crashes the moment a level-up lands,
 * and there is no honest conversion: a warlord three boons deep does not
 * correspond to any position on a ladder, and handing them six fresh points on
 * top would be a different game.
 *
 * So the run is dropped and the meta-progression — renown, unlocks, feats,
 * stats, everything the player actually keeps — is preserved untouched. One
 * abandoned run at the version boundary; nothing else lost.
 *
 * SAVE_VERSION deliberately does not move: the *synced* payload (§2's meta
 * slice) is byte-identical before and after, and bumping it would make every
 * client reject the server copy it already has and quietly stop restoring
 * progress.
 */
function dropPreWarCouncilRun(raw: SaveData): SaveData['activeRun'] {
  const run = raw.activeRun
  if (!run) return null
  const warlords = (run as { warlords?: { talentsTaken?: unknown }[] }).warlords
  if (!Array.isArray(warlords)) return null
  const usesTalents = warlords.every((w) => Array.isArray(w?.talentsTaken))
  return usesTalents ? run : null
}

/**
 * A run saved before The Long March has no campaign fields on it (DN10). It is
 * still a perfectly good lobby, so rather than discard it, adopt it as a
 * one-lobby campaign at its own tier: its seed becomes the campaign seed, no
 * rounds precede it, and it has been granted no Interlude points. A player who
 * closed the app mid-run keeps that run and can march from it.
 */
function adoptRunIntoCampaign(run: SaveData['activeRun']): SaveData['activeRun'] {
  if (!run) return null
  const r = run as RunState & Partial<Pick<RunState, 'campaignSeed' | 'roundsBefore' | 'bonusTalentPoints'>>
  return {
    ...r,
    campaignSeed: typeof r.campaignSeed === 'number' ? r.campaignSeed : r.seed,
    roundsBefore: typeof r.roundsBefore === 'number' ? r.roundsBefore : 0,
    bonusTalentPoints: typeof r.bonusTalentPoints === 'number' ? r.bonusTalentPoints : 0,
  }
}

function migrate(raw: SaveData): SaveData {
  // Future schema bumps land here, keyed off `version`.
  // A save written before War Tiers has no `tiers` block; spreading DEFAULT
  // first covers the missing key, but a *partial* one (an older client, a
  // half-written record) would still leave holes, so it is filled explicitly.
  return {
    ...DEFAULT_SAVE,
    ...raw,
    tiers: { ...DEFAULT_SAVE.tiers, ...raw.tiers, records: { ...raw.tiers?.records }, bestByHero: { ...raw.tiers?.bestByHero } },
    activeRun: adoptRunIntoCampaign(dropPreWarCouncilRun(raw)),
    version: SAVE_VERSION,
  }
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return { ...DEFAULT_SAVE }
    const parsed = JSON.parse(raw) as SaveData
    if (typeof parsed?.renown !== 'number') return { ...DEFAULT_SAVE }
    return migrate(parsed)
  } catch {
    return { ...DEFAULT_SAVE }
  }
}

/**
 * Anyone who wants to know when the save changed. Exists so the sync layer
 * (§2) can watch every write from one place instead of the store having to
 * remember to announce each of its twenty-odd persist points — and so that
 * localStorage stays the source of truth whether or not sync is running.
 */
type SaveListener = (data: SaveData) => void
let listener: SaveListener | null = null

export function onSaveWritten(fn: SaveListener | null) {
  listener = fn
}

export function writeSave(data: SaveData) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data))
  } catch {
    // Private-mode Safari and quota errors must never break a run.
  }
  try {
    listener?.(data)
  } catch {
    // A sync failure is never allowed to break a local save.
  }
}
