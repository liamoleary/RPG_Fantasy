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
 * The Long March shipped briefly; a run saved mid-campaign carries fields this
 * build no longer knows about. A run that had already marched is standing in a
 * lobby state that can no longer be reached, so it is dropped rather than
 * resumed.
 */
function dropMarchedRun(run: SaveData['activeRun']): SaveData['activeRun'] {
  if (!run) return null
  const marched = (run as { roundsBefore?: number }).roundsBefore
  return typeof marched === 'number' && marched > 0 ? null : run
}

function migrate(raw: SaveData): SaveData {
  // Future schema bumps land here, keyed off `version`.
  // A save written while War Tiers were live carries a `tiers` block; the
  // ladder is gone, so the block is dropped rather than spread back in.
  const { tiers: _tiers, ...rest } = raw as SaveData & { tiers?: unknown }
  return {
    ...DEFAULT_SAVE,
    ...rest,
    activeRun: dropMarchedRun(dropPreWarCouncilRun(raw)),
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
