import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SAVE, loadSave, writeSave, type SaveData } from '../src/state/persist'
import { mergeMeta, metaOf } from '../src/state/meta'
import { useGame } from '../src/state/store'
import { RENOWN_BY_PLACEMENT } from '../src/engine/run'

/**
 * Progression is renown, stats and unlocks — no ladder, no multipliers.
 * War Tiers were removed deliberately (DN10): pick a faction, play, get
 * renown. These tests pin that simplicity in place.
 */
const store: Record<string, string> = {}
;(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => void (store[k] = v),
  removeItem: (k: string) => void delete store[k],
}

/** Drive the store to the end of a run with a chosen placement. */
function endRun(placement: number, heroId = 'h_berrik') {
  const run = {
    finished: true,
    round: 9,
    seed: 1,
    warlords: [{ id: 'w0', isPlayer: true, alive: placement === 1, placement, heroId, factionId: 'vanguard', board: [], camp: { tier: 3 }, talentsTaken: [], hp: 0 }],
    playerId: 'w0',
    reports: [],
    log: [],
  } as never
  useGame.setState({ run, screen: 'battle', outcome: null })
  useGame.getState().nextRound()
  return useGame.getState().save
}

describe('renown and stats at run end', () => {
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k]
    useGame.setState({ save: { ...DEFAULT_SAVE }, run: null, screen: 'home' })
  })

  it('pays exactly the placement table — no multipliers', () => {
    const save = endRun(3)
    expect(save.renown).toBe(RENOWN_BY_PLACEMENT[3])
  })

  it('counts a win and remembers the best placement per hero', () => {
    endRun(4, 'h_zhala')
    const save = endRun(1, 'h_zhala')
    expect(save.stats.runs).toBe(2)
    expect(save.stats.wins).toBe(1)
    expect(save.stats.bestPlacementByHero.h_zhala).toBe(1)
  })
})

describe('saves survive a round trip', () => {
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k]
  })

  it('writes and reads back intact', () => {
    const save: SaveData = { ...DEFAULT_SAVE, renown: 320, stats: { runs: 7, wins: 2, bestPlacementByHero: { h_berrik: 1 } } }
    writeSave(save)
    const back = loadSave()
    expect(back.renown).toBe(320)
    expect(back.stats).toEqual(save.stats)
  })

  it('drops the tiers block a War-Tiers-era save carries', () => {
    const legacy = { ...DEFAULT_SAVE, renown: 55 } as SaveData & { tiers?: unknown }
    legacy.tiers = { highestUnlocked: 6, highestWon: 5, records: {}, bestByHero: {} }
    localStorage.setItem('bannerfell.save.v1', JSON.stringify(legacy))
    const back = loadSave()
    expect(back.renown).toBe(55)
    expect('tiers' in back).toBe(false)
  })
})

describe('meta sync', () => {
  it('merges by taking the better of each field', () => {
    const a = metaOf({ ...DEFAULT_SAVE, renown: 100, stats: { runs: 5, wins: 1, bestPlacementByHero: { h_berrik: 2 } } })
    const b = metaOf({ ...DEFAULT_SAVE, renown: 80, stats: { runs: 7, wins: 3, bestPlacementByHero: { h_berrik: 4, h_zhala: 1 } } })
    const merged = mergeMeta(a, b)
    expect(merged.renown).toBe(100)
    expect(merged.stats.runs).toBe(7)
    expect(merged.stats.wins).toBe(3)
    expect(merged.stats.bestPlacementByHero).toEqual({ h_berrik: 2, h_zhala: 1 })
  })
})
