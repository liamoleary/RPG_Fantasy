import { beforeEach, describe, expect, it } from 'vitest'
import { MAX_WAR_TIER, renownMultiplier } from '../src/data/tiers'
import { DEFAULT_SAVE, loadSave, writeSave, type SaveData } from '../src/state/persist'
import { mergeMeta, metaOf, withMeta } from '../src/state/meta'
import { useGame } from '../src/state/store'
import { RENOWN_BY_PLACEMENT } from '../src/engine/run'

/**
 * The climb (DN09 §4). Three rules carry the whole feature and every one of
 * them fails quietly if broken:
 *
 *   - winning at your highest tier unlocks the next
 *   - losing never demotes
 *   - renown pays for altitude win *or* lose
 *
 * A ladder that silently stops unlocking, or quietly resets on a sync, is a
 * bug a player only notices hours later.
 */
const store: Record<string, string> = {}
;(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => void (store[k] = v),
  removeItem: (k: string) => void delete store[k],
}

const emptyTiers = () => ({ highestUnlocked: 1, highestWon: 1, records: {}, bestByHero: {} })

/** Drive the store to the end of a run with a chosen tier and placement. */
function endRun(tier: number, placement: number, heroId = 'h_berrik') {
  const run = {
    finished: true,
    round: 9,
    tier,
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

describe('unlocking the ladder', () => {
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k]
    useGame.setState({ save: { ...DEFAULT_SAVE, tiers: emptyTiers() }, run: null, screen: 'home' })
  })

  it('opens the next tier when you win at your highest', () => {
    const save = endRun(1, 1)
    expect(save.tiers.highestUnlocked).toBe(2)
    expect(save.tiers.highestWon).toBe(1)
  })

  it('never demotes on a loss, and never unlocks on one either', () => {
    useGame.setState({ save: { ...DEFAULT_SAVE, tiers: { ...emptyTiers(), highestUnlocked: 5, highestWon: 4 } } })
    const save = endRun(5, 7)
    expect(save.tiers.highestUnlocked).toBe(5)
    expect(save.tiers.highestWon).toBe(4)
  })

  it('does not unlock past the top of the ladder', () => {
    useGame.setState({
      save: { ...DEFAULT_SAVE, tiers: { ...emptyTiers(), highestUnlocked: MAX_WAR_TIER, highestWon: MAX_WAR_TIER - 1 } },
    })
    const save = endRun(MAX_WAR_TIER, 1)
    expect(save.tiers.highestUnlocked).toBe(MAX_WAR_TIER)
    expect(save.tiers.highestWon).toBe(MAX_WAR_TIER)
  })

  it('winning low never lowers a ladder you already climbed', () => {
    useGame.setState({ save: { ...DEFAULT_SAVE, tiers: { ...emptyTiers(), highestUnlocked: 7, highestWon: 6 } } })
    const save = endRun(2, 1)
    expect(save.tiers.highestUnlocked).toBe(7)
    expect(save.tiers.highestWon).toBe(6)
  })

  it('tracks attempts and wins per tier, and the best tier per hero', () => {
    useGame.setState({ save: { ...DEFAULT_SAVE, tiers: { ...emptyTiers(), highestUnlocked: 3 } } })
    endRun(3, 4, 'h_zhala')
    endRun(3, 1, 'h_zhala')
    const save = useGame.getState().save
    expect(save.tiers.records['3']).toEqual({ runs: 2, wins: 1 })
    expect(save.tiers.bestByHero.h_zhala).toBe(3)
  })

  it('records a losing attempt against the tier it was attempted at', () => {
    useGame.setState({ save: { ...DEFAULT_SAVE, tiers: { ...emptyTiers(), highestUnlocked: 6 } } })
    endRun(6, 8)
    expect(useGame.getState().save.tiers.records['6']).toEqual({ runs: 1, wins: 0 })
  })
})

describe('renown pays for altitude', () => {
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k]
    useGame.setState({ save: { ...DEFAULT_SAVE, tiers: emptyTiers() }, run: null, screen: 'home' })
  })

  it('multiplies a win by the tier', () => {
    useGame.setState({ save: { ...DEFAULT_SAVE, tiers: { ...emptyTiers(), highestUnlocked: 5 } } })
    const save = endRun(5, 1)
    expect(save.renown).toBe(Math.floor(RENOWN_BY_PLACEMENT[1] * renownMultiplier(5)))
  })

  it('multiplies a loss too — altitude pays even when it kills you', () => {
    useGame.setState({ save: { ...DEFAULT_SAVE, tiers: { ...emptyTiers(), highestUnlocked: 5 } } })
    const save = endRun(5, 8)
    const base = RENOWN_BY_PLACEMENT[8]
    expect(save.renown).toBe(Math.floor(base * renownMultiplier(5)))
    expect(save.renown).toBeGreaterThan(base)
  })

  it('pays exactly the base at Tier 1, so the on-ramp is unchanged', () => {
    const save = endRun(1, 3)
    expect(save.renown).toBe(RENOWN_BY_PLACEMENT[3])
  })
})

describe('the climb survives a round trip', () => {
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k]
  })

  it('writes and reads back intact', () => {
    const save: SaveData = {
      ...DEFAULT_SAVE,
      tiers: { highestUnlocked: 6, highestWon: 5, records: { '5': { runs: 4, wins: 1 } }, bestByHero: { h_zhala: 5 } },
    }
    writeSave(save)
    expect(loadSave().tiers).toEqual(save.tiers)
  })

  it('gives a save written before War Tiers a ladder at the bottom rung', () => {
    // The shape an older client left behind: no `tiers` key at all.
    const legacy = { ...DEFAULT_SAVE } as Partial<SaveData>
    delete legacy.tiers
    localStorage.setItem('bannerfell.save.v1', JSON.stringify(legacy))
    expect(loadSave().tiers).toEqual(emptyTiers())
  })
})

describe('syncing the climb between devices', () => {
  it('is part of the server-owned slice', () => {
    expect(metaOf({ ...DEFAULT_SAVE, tiers: { ...emptyTiers(), highestWon: 4 } }).tiers?.highestWon).toBe(4)
  })

  it('takes the better of two devices on every field', () => {
    const a = metaOf({
      ...DEFAULT_SAVE,
      tiers: { highestUnlocked: 5, highestWon: 4, records: { '4': { runs: 6, wins: 1 } }, bestByHero: { h_berrik: 4 } },
    })
    const b = metaOf({
      ...DEFAULT_SAVE,
      tiers: { highestUnlocked: 3, highestWon: 2, records: { '4': { runs: 2, wins: 0 }, '2': { runs: 9, wins: 3 } }, bestByHero: { h_zhala: 2 } },
    })
    const merged = mergeMeta(a, b).tiers!
    expect(merged.highestUnlocked).toBe(5)
    expect(merged.highestWon).toBe(4)
    // Larger side wins rather than summing: a run that synced from both
    // devices must not be counted twice.
    expect(merged.records['4']).toEqual({ runs: 6, wins: 1 })
    expect(merged.records['2']).toEqual({ runs: 9, wins: 3 })
    expect(merged.bestByHero).toEqual({ h_berrik: 4, h_zhala: 2 })
  })

  it('never lets a tier record claim more wins than attempts', () => {
    const a = metaOf({ ...DEFAULT_SAVE, tiers: { ...emptyTiers(), records: { '3': { runs: 9, wins: 0 } } } })
    const b = metaOf({ ...DEFAULT_SAVE, tiers: { ...emptyTiers(), records: { '3': { runs: 1, wins: 1 } } } })
    const r = mergeMeta(a, b).tiers!.records['3']
    expect(r.wins).toBeLessThanOrEqual(r.runs)
  })

  /**
   * The one that matters for a live deploy: a server copy written before War
   * Tiers has no ladder in it. Grafting it back must not reset a climb.
   */
  it('keeps the local climb when the server copy predates the ladder', () => {
    const local: SaveData = {
      ...DEFAULT_SAVE,
      tiers: { highestUnlocked: 8, highestWon: 7, records: { '7': { runs: 3, wins: 1 } }, bestByHero: {} },
    }
    const fromOldServer = { ...metaOf(DEFAULT_SAVE), renown: 400 }
    delete (fromOldServer as { tiers?: unknown }).tiers
    const after = withMeta(local, fromOldServer)
    expect(after.renown).toBe(400)
    expect(after.tiers).toEqual(local.tiers)
  })
})
