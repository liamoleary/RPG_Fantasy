import { beforeEach, describe, expect, it } from 'vitest'
import { MAX_WAR_TIER, renownMultiplier } from '../src/data/tiers'
import { DEFAULT_SAVE, loadSave, writeSave, type SaveData } from '../src/state/persist'
import { mergeMeta, metaOf, withMeta } from '../src/state/meta'
import { useGame } from '../src/state/store'
import { newRun, player } from '../src/engine/run'
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

/** Drive the store to the end of a lobby with a chosen tier and placement. */
function endRun(tier: number, placement: number, heroId = 'h_berrik') {
  const run = {
    finished: true,
    round: 9,
    tier,
    seed: 1,
    campaignSeed: 1,
    roundsBefore: 0,
    bonusTalentPoints: 0,
    warlords: [{ id: 'w0', isPlayer: true, alive: placement === 1, placement, heroId, factionId: 'vanguard', board: [], camp: { tier: 3 }, talentsTaken: [], hp: 0 }],
    playerId: 'w0',
    reports: [],
    log: [],
  } as never
  useGame.setState({ run, screen: 'battle', outcome: null })
  // DN10: a win with ladder left now offers the fork instead of banking, so a
  // test that wants an *ended campaign* has to claim it — which is exactly the
  // choice a player makes.
  if (placement === 1) useGame.getState().claimVictory()
  else useGame.getState().nextRound()
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

  it('records where campaigns ended, and the best tier per hero', () => {
    useGame.setState({ save: { ...DEFAULT_SAVE, tiers: { ...emptyTiers(), highestUnlocked: 3 } } })
    endRun(3, 4, 'h_zhala')
    endRun(3, 1, 'h_zhala')
    const save = useGame.getState().save
    // Both campaigns ended at Tier 3 — one fell, one claimed. `reached` is
    // booked on arrival by `marchOn`, not here, so it stays 0 for fixtures
    // that were dropped straight in at a tier.
    expect(save.tiers.records['3'].fallen).toBe(2)
    expect(save.tiers.bestByHero.h_zhala).toBe(3)
  })

  it('records a lost campaign against the tier it fell at', () => {
    useGame.setState({ save: { ...DEFAULT_SAVE, tiers: { ...emptyTiers(), highestUnlocked: 6 } } })
    endRun(6, 8)
    expect(useGame.getState().save.tiers.records['6']).toEqual({ reached: 0, fallen: 1 })
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
      tiers: { highestUnlocked: 6, highestWon: 5, records: { '5': { reached: 4, fallen: 1 } }, bestByHero: { h_zhala: 5 } },
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
      tiers: { highestUnlocked: 5, highestWon: 4, records: { '4': { reached: 6, fallen: 1 } }, bestByHero: { h_berrik: 4 } },
    })
    const b = metaOf({
      ...DEFAULT_SAVE,
      tiers: { highestUnlocked: 3, highestWon: 2, records: { '4': { reached: 2, fallen: 0 }, '2': { reached: 9, fallen: 3 } }, bestByHero: { h_zhala: 2 } },
    })
    const merged = mergeMeta(a, b).tiers!
    expect(merged.highestUnlocked).toBe(5)
    expect(merged.highestWon).toBe(4)
    // Larger side wins rather than summing: a run that synced from both
    // devices must not be counted twice.
    expect(merged.records['4']).toEqual({ reached: 6, fallen: 1 })
    expect(merged.records['2']).toEqual({ reached: 9, fallen: 3 })
    expect(merged.bestByHero).toEqual({ h_berrik: 4, h_zhala: 2 })
  })

  it('never lets a tier claim more endings than arrivals', () => {
    const a = metaOf({ ...DEFAULT_SAVE, tiers: { ...emptyTiers(), records: { '3': { reached: 9, fallen: 0 } } } })
    const b = metaOf({ ...DEFAULT_SAVE, tiers: { ...emptyTiers(), records: { '3': { reached: 1, fallen: 1 } } } })
    const r = mergeMeta(a, b).tiers!.records['3']
    expect(r.fallen).toBeLessThanOrEqual(r.reached)
  })

  /**
   * The one that matters for a live deploy: a server copy written before War
   * Tiers has no ladder in it. Grafting it back must not reset a climb.
   */
  it('keeps the local climb when the server copy predates the ladder', () => {
    const local: SaveData = {
      ...DEFAULT_SAVE,
      tiers: { highestUnlocked: 8, highestWon: 7, records: { '7': { reached: 3, fallen: 1 } }, bestByHero: {} },
    }
    const fromOldServer = { ...metaOf(DEFAULT_SAVE), renown: 400 }
    delete (fromOldServer as { tiers?: unknown }).tiers
    const after = withMeta(local, fromOldServer)
    expect(after.renown).toBe(400)
    expect(after.tiers).toEqual(local.tiers)
  })
})

/**
 * The campaign lifecycle (DN10 §2/§4). The failure that matters here is
 * silent: a won lobby that banks the campaign anyway would delete a warband
 * the player was about to march with, and would look like a crash rather than
 * a rule.
 */
describe('a won lobby is not the end of a campaign', () => {
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k]
    useGame.setState({ save: { ...DEFAULT_SAVE, tiers: emptyTiers() }, run: null, screen: 'home', interlude: null })
  })

  /** A finished, won lobby with a real board, parked in the store. */
  const wonLobby = (tier = 1) => {
    const run = newRun({ seed: 4242, factionId: 'vanguard', heroId: 'h_berrik', tier })
    const you = player(run)
    you.board.push({ uid: 'carry1', unitId: 'vg_militia', count: 6, slot: 0, bonusAtk: 4, bonusHp: 8, growthTicks: 5, spent: 9, rank: 1 })
    you.placement = 1
    run.finished = true
    for (const w of run.warlords) if (!w.isPlayer) w.alive = false
    useGame.setState({ run, screen: 'battle', outcome: null })
    useGame.getState().nextRound()
    return useGame.getState()
  }

  it('offers the fork and keeps the campaign alive', () => {
    const st = wonLobby()
    expect(st.screen).toBe('runover')
    // §4: the fork persists. A campaign paused here is still an active run,
    // so "March On" can be answered tomorrow.
    expect(st.save.activeRun, 'the campaign was banked before the player chose').not.toBeNull()
    expect(st.save.stats.runs, 'a campaign was counted before it ended').toBe(0)
  })

  it('pays renown for the lobby without ending the campaign', () => {
    const st = wonLobby()
    expect(st.renownEarned).toBeGreaterThan(0)
    expect(st.save.renown).toBe(st.renownEarned)
  })

  it('carries the warband when the player marches', () => {
    wonLobby()
    const before = JSON.stringify(player(useGame.getState().run!).board)
    useGame.getState().marchOn()
    const after = useGame.getState()
    expect(after.run!.tier).toBe(2)
    expect(after.screen).toBe('muster')
    expect(after.interlude, 'no receipt was raised for the Interlude').not.toBeNull()
    expect(after.interlude!.tier).toBe(2)
    // The stack that marched is still there, by uid.
    const carried = player(after.run!).board.find((s) => s.uid === 'carry1')
    expect(carried, 'the warband did not survive the march').toBeDefined()
    expect(carried!.count).toBe(6)
    expect(before).toContain('carry1')
    // Arrival is booked against the tier reached.
    expect(after.save.tiers.records['2'].reached).toBe(1)
    expect(after.save.activeRun!.tier).toBe(2)
  })

  it('ends the campaign when the player claims', () => {
    wonLobby()
    useGame.getState().claimVictory()
    const st = useGame.getState()
    expect(st.save.activeRun).toBeNull()
    expect(st.save.stats.runs).toBe(1)
    expect(st.save.stats.wins).toBe(1)
    expect(st.save.tiers.records['1'].fallen).toBe(1)
  })

  it('ends the campaign on a loss with no fork offered', () => {
    const run = newRun({ seed: 7, factionId: 'vanguard', heroId: 'h_berrik' })
    const you = player(run)
    you.alive = false
    you.placement = 5
    run.finished = true
    useGame.setState({ run, screen: 'battle', outcome: null })
    useGame.getState().nextRound()
    const st = useGame.getState()
    expect(st.save.activeRun).toBeNull()
    expect(st.save.stats.runs).toBe(1)
    expect(st.save.stats.wins).toBe(0)
  })

  it('refuses to march off the top of the ladder', () => {
    wonLobby(MAX_WAR_TIER)
    const before = useGame.getState().run
    useGame.getState().marchOn()
    expect(useGame.getState().run).toBe(before)
    expect(useGame.getState().interlude).toBeNull()
  })
})

describe('old records become campaign history', () => {
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k]
  })

  it('reads a DN09 attempts/wins record as reached/fallen', () => {
    localStorage.setItem(
      'bannerfell.save.v1',
      JSON.stringify({ ...DEFAULT_SAVE, tiers: { ...emptyTiers(), records: { '3': { runs: 7, wins: 2 } } } }),
    )
    // Seven campaigns got to Tier 3; five of them got no further.
    expect(loadSave().tiers.records['3']).toEqual({ reached: 7, fallen: 5 })
  })

  it('leaves a record already in the new shape alone', () => {
    localStorage.setItem(
      'bannerfell.save.v1',
      JSON.stringify({ ...DEFAULT_SAVE, tiers: { ...emptyTiers(), records: { '4': { reached: 3, fallen: 1 } } } }),
    )
    expect(loadSave().tiers.records['4']).toEqual({ reached: 3, fallen: 1 })
  })
})
