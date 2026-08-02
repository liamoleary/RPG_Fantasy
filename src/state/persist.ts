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

function migrate(raw: SaveData): SaveData {
  // Future schema bumps land here, keyed off `version`.
  return { ...DEFAULT_SAVE, ...raw, version: SAVE_VERSION }
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

export function writeSave(data: SaveData) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data))
  } catch {
    // Private-mode Safari and quota errors must never break a run.
  }
}
