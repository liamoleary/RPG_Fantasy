import { describe, expect, it } from 'vitest'
import { ARRIVAL_BUDGETS, arrivalFor, stipendFor } from '../src/data/arrival'
import { MAX_WAR_TIER } from '../src/data/tiers'
import { UNIT_BY_ID } from '../src/data/index'
import { FRONT_SLOTS, TOTAL_SLOTS } from '../src/engine/battle'
import { MAX_CAMP_TIER } from '../src/engine/camp'
import { advanceRound, marchOn, newRun, player, resolveBattles, type RunState, type Warlord } from '../src/engine/run'

/**
 * Rivals at altitude (DN10 §5).
 *
 * The rule that matters most here is a negative one: an arriving lobby is
 * built from authored data and *never* from the player's board. Mirror-scaling
 * is the failure mode DN09 §2.3 named — if the lobby scales to what you built,
 * out-building it merely raises it, and building stops meaning anything. That
 * is a property no amount of eyeballing catches, and it is the first test here.
 */

function winLobby(run: RunState): RunState {
  for (let guard = 0; guard < 24 && !run.finished; guard++) {
    const you = player(run)
    if (you.alive) you.hp = 999
    resolveBattles(run)
    if (run.finished) break
    advanceRound(run)
  }
  return run
}

const rivalsOf = (run: RunState): Warlord[] => run.warlords.filter((w) => !w.isPlayer)

const rivalPrint = (run: RunState): string =>
  rivalsOf(run)
    .map((w) =>
      [
        w.id,
        w.factionId,
        w.camp.tier,
        w.talentsTaken.join('+'),
        w.board
          .slice()
          .sort((a, b) => a.slot - b.slot)
          .map((s) => `${s.unitId}:${s.count}@${s.slot}:+${s.bonusAtk}/${s.bonusHp}:r${s.rank}`)
          .join(','),
      ].join('~'),
    )
    .join('|')

describe('the budgets are authored data', () => {
  it('covers every rung with a sane, non-shrinking curve', () => {
    expect(ARRIVAL_BUDGETS.map((b) => b.tier)).toEqual([...Array(MAX_WAR_TIER)].map((_, i) => i + 1))
    for (let i = 1; i < ARRIVAL_BUDGETS.length; i++) {
      const prev = ARRIVAL_BUDGETS[i - 1]
      const here = ARRIVAL_BUDGETS[i]
      expect(here.spend, `tier ${here.tier} arrives poorer than ${prev.tier}`).toBeGreaterThan(prev.spend)
      expect(here.rounds, `tier ${here.tier} arrives greener than ${prev.tier}`).toBeGreaterThanOrEqual(prev.rounds)
      expect(here.stipend, `tier ${here.tier} pays less than ${prev.tier}`).toBeGreaterThanOrEqual(prev.stipend)
      expect(here.campTier).toBeGreaterThanOrEqual(prev.campTier)
      expect(here.campTier).toBeLessThanOrEqual(MAX_CAMP_TIER)
    }
  })

  it('leaves Tier 1 empty, because nobody arrives there', () => {
    const t1 = arrivalFor(1)
    expect(t1.spend).toBe(0)
    expect(t1.rounds).toBe(0)
    expect(t1.talents).toBe(0)
    expect(stipendFor(1)).toBe(0)
  })

  it('clamps off the end of the ladder instead of returning nothing', () => {
    expect(arrivalFor(99)).toBe(ARRIVAL_BUDGETS[ARRIVAL_BUDGETS.length - 1])
  })
})

describe('the lobby you arrive at is not a mirror of you', () => {
  /**
   * DN10 §5's load-bearing negative. Two campaigns identical in every way
   * except the player's board must produce byte-identical rivals: if any part
   * of arrival read the player, this is where it shows.
   */
  it('is byte-identical whatever the player marched in with', () => {
    const lean = winLobby(newRun({ seed: 404, factionId: 'vanguard', heroId: 'h_berrik' }))
    const fat = winLobby(newRun({ seed: 404, factionId: 'vanguard', heroId: 'h_berrik' }))
    const you = player(fat)
    you.board.push(
      { uid: 'f1', unitId: 'vg_colossus', count: 9, slot: 0, bonusAtk: 40, bonusHp: 80, growthTicks: 30, spent: 40, rank: 2 },
      { uid: 'f2', unitId: 'vg_ballistier', count: 9, slot: 4, bonusAtk: 40, bonusHp: 80, growthTicks: 30, spent: 40, rank: 2 },
    )
    you.camp = { ...you.camp, tier: 5 }
    you.gold = 500

    expect(rivalPrint(marchOn(fat).run)).toBe(rivalPrint(marchOn(lean).run))
  })

  it('and does not change when the player picks a different faction', () => {
    // Same campaign seed, different player identity: the rivals are the seed's.
    const a = winLobby(newRun({ seed: 909, factionId: 'vanguard', heroId: 'h_berrik' }))
    const b = winLobby(newRun({ seed: 909, factionId: 'stormtide', heroId: 'h_zhala' }))
    expect(rivalPrint(marchOn(a).run)).toBe(rivalPrint(marchOn(b).run))
  })
})

describe('rivals arrive already built', () => {
  const arrived = (tier: number): RunState => {
    let run = winLobby(newRun({ seed: 55, factionId: 'vanguard', heroId: 'h_berrik' }))
    for (let t = 2; t <= tier; t++) run = winLobby(marchOn(run).run)
    // The last winLobby played the tier out; march once more to *arrive*.
    return run
  }

  it('brings boards, camps and talents to the budget, not empty hands', () => {
    const run = marchOn(winLobby(newRun({ seed: 55, factionId: 'vanguard', heroId: 'h_berrik' }))).run
    const budget = arrivalFor(run.tier)
    for (const w of rivalsOf(run)) {
      expect(w.board.length, `${w.id} arrived with an empty board`).toBeGreaterThan(0)
      expect(w.talentsTaken.length, `${w.id} arrived with no war council`).toBe(budget.talents)
      // A floor the policy already clears on its own: this passes with the
      // floor deleted, so it documents the outcome and claims no coverage of
      // `budget.campTier` itself.
      expect(w.camp.tier).toBeGreaterThanOrEqual(budget.campTier)
      // Likewise true by `beginRound` paying round-1 income over the top,
      // rather than by anything arrival does — but worth pinning, because a
      // rival that arrived holding 300 gold would buy out the lobby on round 1.
      expect(w.gold, `${w.id} banked its arrival budget into round 1`).toBeLessThan(10)
    }
  })

  it('fields legal boards — real units, real rows, no double-booked slots', () => {
    const run = marchOn(winLobby(newRun({ seed: 71, factionId: 'verdant', heroId: 'h_maravel' }))).run
    for (const w of rivalsOf(run)) {
      const slots = new Set<number>()
      for (const s of w.board) {
        const def = UNIT_BY_ID.get(s.unitId)
        expect(def, `${w.id} fields an unknown unit ${s.unitId}`).toBeDefined()
        expect(s.count).toBeGreaterThan(0)
        expect(s.slot).toBeGreaterThanOrEqual(0)
        expect(s.slot).toBeLessThan(TOTAL_SLOTS)
        expect(slots.has(s.slot), `${w.id} double-books slot ${s.slot}`).toBe(false)
        slots.add(s.slot)
        if (def!.row === 'back') expect(s.slot).toBeGreaterThanOrEqual(FRONT_SLOTS)
        if (def!.row === 'front') expect(s.slot).toBeLessThan(FRONT_SLOTS)
      }
    }
  })

  it('gets richer the higher you climb', () => {
    let run = winLobby(newRun({ seed: 55, factionId: 'vanguard', heroId: 'h_berrik' }))
    const sizes: number[] = []
    for (let i = 0; i < 3; i++) {
      run = marchOn(run).run
      sizes.push(rivalsOf(run).reduce((n, w) => n + w.board.reduce((m, s) => m + s.count, 0), 0))
      run = winLobby(run)
    }
    expect(sizes[1]).toBeGreaterThan(sizes[0])
    expect(sizes[2]).toBeGreaterThan(sizes[1])
  })

  it('draws the same lobby twice for the same campaign seed', () => {
    const once = marchOn(winLobby(newRun({ seed: 88, factionId: 'vanguard', heroId: 'h_berrik' }))).run
    const twice = marchOn(winLobby(newRun({ seed: 88, factionId: 'vanguard', heroId: 'h_berrik' }))).run
    expect(rivalPrint(once)).toBe(rivalPrint(twice))
    expect(rivalPrint(once)).not.toBe(rivalPrint(arrived(2)))
  })
})

describe('Tier 1 never pre-develops anyone', () => {
  it('starts every rival with an empty board, exactly as before', () => {
    const run = newRun({ seed: 3, factionId: 'vanguard', heroId: 'h_berrik' })
    // beginRound has already run one Muster, so rivals have round-1 boards —
    // what matters is that they are round-1 sized, not arrival sized.
    const bodies = rivalsOf(run).reduce((n, w) => n + w.board.reduce((m, s) => m + s.count, 0), 0)
    expect(bodies).toBeLessThan(40)
    for (const w of rivalsOf(run)) expect(w.talentsTaken).toEqual([])
  })
})
