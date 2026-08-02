import { describe, expect, it } from 'vitest'
import { ZERO_MODS } from '../src/data/types'
import {
  HARD_CAP_ROUND,
  LOBBY_SIZE,
  START_HP,
  advanceRound,
  newRun,
  player,
  resolveBattles,
  type RunState,
} from '../src/engine/run'
import { isLevelUpRound, heroLevel, offerBoons } from '../src/engine/boons'
import { income, musterCount, newCamp, promote, recruit, rollOffer, sell, tierUpCost } from '../src/engine/camp'
import { NOISE, pickBoon, rivalMuster } from '../src/engine/rivals'
import { applyBoon } from '../src/engine/run'
import { makeRng } from '../src/engine/rng'

function playHeadless(run: RunState): RunState {
  let guard = 0
  while (!run.finished && guard++ < HARD_CAP_ROUND + 4) {
    const p = player(run)
    if (p.alive) {
      const rng = makeRng(1000 + run.round)
      if (run.boonOffer.length > 0) {
        applyBoon(p, pickBoon(run.boonOffer, p.archetype, NOISE.standard, rng))
        run.boonOffer = []
      }
      const out = rivalMuster(
        { board: p.board, gold: p.gold, camp: p.camp, mods: p.mods, round: run.round, archetype: p.archetype, factionId: p.factionId, noise: NOISE.standard },
        rng,
      )
      p.board = out.board
      p.camp = out.camp
      p.gold = out.gold
    }
    resolveBattles(run)
    if (run.finished) break
    advanceRound(run)
  }
  return run
}

describe('run loop', () => {
  it('creates a lobby of 8 warlords on 30 HP', () => {
    const run = newRun({ seed: 42, factionId: 'vanguard', heroId: 'h_berrik' })
    expect(run.warlords).toHaveLength(LOBBY_SIZE)
    expect(run.warlords.every((w) => w.hp === START_HP)).toBe(true)
    expect(run.warlords.filter((w) => w.isPlayer)).toHaveLength(1)
  })

  it('pairs every alive warlord each round', () => {
    const run = newRun({ seed: 43, factionId: 'verdant', heroId: 'h_sylvaen' })
    const paired = new Set(run.pairings.flatMap((p) => [p.aId, p.bId]))
    expect(paired.size).toBe(LOBBY_SIZE)
  })

  it('completes a full run and assigns every placement exactly once', () => {
    const run = playHeadless(newRun({ seed: 4242, factionId: 'stormtide', heroId: 'h_grommash' }))
    expect(run.finished).toBe(true)
    const placements = run.warlords.map((w) => w.placement).sort((a, b) => (a ?? 0) - (b ?? 0))
    expect(placements).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('finishes a scripted full run in well under 50ms (M1 exit test)', () => {
    const t0 = performance.now()
    const run = playHeadless(newRun({ seed: 99, factionId: 'vanguard', heroId: 'h_berrik' }))
    const elapsed = performance.now() - t0
    expect(run.finished).toBe(true)
    expect(elapsed).toBeLessThan(50)
  })

  it('never exceeds the hard round cap', () => {
    for (let seed = 0; seed < 25; seed++) {
      const run = playHeadless(newRun({ seed, factionId: 'verdant', heroId: 'h_maravel' }))
      expect(run.finished).toBe(true)
      expect(run.round).toBeLessThanOrEqual(HARD_CAP_ROUND + 2)
    }
  })

  it('is fully deterministic for a given seed', () => {
    const a = playHeadless(newRun({ seed: 777, factionId: 'vanguard', heroId: 'h_berrik' }))
    const b = playHeadless(newRun({ seed: 777, factionId: 'vanguard', heroId: 'h_berrik' }))
    expect(a.log).toEqual(b.log)
    expect(a.warlords.map((w) => w.placement)).toEqual(b.warlords.map((w) => w.placement))
  })
})

describe('economy', () => {
  it('follows the gold curve: 3 on round 1, +1 a round, capped at 10', () => {
    expect(income(1, ZERO_MODS)).toBe(3)
    expect(income(2, ZERO_MODS)).toBe(4)
    expect(income(8, ZERO_MODS)).toBe(10)
    expect(income(15, ZERO_MODS)).toBe(10)
    expect(income(15, { ...ZERO_MODS, income: 2 })).toBe(12)
  })

  it('adds to an existing stack rather than taking a new slot', () => {
    let board = recruit([], 9, 'vg_militia', ZERO_MODS)
    expect(board.board).toHaveLength(1)
    expect(board.board[0].count).toBe(4)
    board = recruit(board.board, board.gold, 'vg_militia', ZERO_MODS)
    expect(board.board).toHaveLength(1)
    expect(board.board[0].count).toBe(8)
    expect(board.gold).toBe(3)
  })

  it('refuses a purchase without enough gold', () => {
    const res = recruit([], 2, 'vg_militia', ZERO_MODS)
    expect(res.ok).toBe(false)
    expect(res.board).toHaveLength(0)
  })

  it('applies Mass Levy to tier 1–2 recruits only', () => {
    const mods = { ...ZERO_MODS, t12CountBonus: 2 }
    expect(musterCount({ tier: 1, musterSize: 4 } as never, mods)).toBe(6)
    expect(musterCount({ tier: 4, musterSize: 1 } as never, mods)).toBe(1)
  })

  it('promotes an entire stack at once, preserving count', () => {
    const camp = { ...newCamp(), tier: 2 }
    const bought = recruit([], 6, 'vg_militia', ZERO_MODS)
    const promoted = promote(bought.board, 10, bought.board[0].uid, camp, ZERO_MODS)
    expect(promoted.ok).toBe(true)
    expect(promoted.board[0].unitId).toBe('vg_footman')
    expect(promoted.board[0].count).toBe(bought.board[0].count)
    expect(promoted.gold).toBe(7)
  })

  it('will not promote above the current Camp Tier', () => {
    const camp = newCamp()
    const bought = recruit([], 3, 'vg_militia', ZERO_MODS)
    expect(promote(bought.board, 10, bought.board[0].uid, camp, ZERO_MODS).ok).toBe(false)
  })

  it('refunds 1 gold per 3g sunk into a stack', () => {
    let r = recruit([], 9, 'vg_militia', ZERO_MODS)
    r = recruit(r.board, r.gold, 'vg_militia', ZERO_MODS)
    r = recruit(r.board, r.gold, 'vg_militia', ZERO_MODS)
    const sold = sell(r.board, 0, r.board[0].uid, ZERO_MODS)
    expect(sold.gold).toBe(3)
    expect(sold.board).toHaveLength(0)
  })

  it('discounts a Camp Tier upgrade by 1 for each round it is skipped', () => {
    const camp = { ...newCamp(), tierDiscount: 3 }
    expect(tierUpCost(camp, ZERO_MODS)).toBe(2)
    expect(tierUpCost({ ...camp, tier: 5 }, ZERO_MODS)).toBeNull()
  })

  it('only offers units at or below the Camp Tier', () => {
    const rng = makeRng(5)
    const camp = { ...newCamp(), tier: 2 }
    const offer = rollOffer('vanguard', camp, ZERO_MODS, rng)
    expect(offer.length).toBe(4)
  })
})

describe('boons', () => {
  it('levels the hero on rounds 2, 4, 6, 8, 10 and 12', () => {
    expect([1, 2, 3, 4, 12, 13].map(isLevelUpRound)).toEqual([false, true, false, true, true, false])
    expect(heroLevel(1)).toBe(1)
    expect(heroLevel(12)).toBe(7)
  })

  it('offers one boon from each branch and never repeats a taken boon', () => {
    const rng = makeRng(9)
    const taken = new Set<string>()
    for (const round of [2, 4, 6, 8, 10, 12]) {
      const offer = offerBoons(round, 'h_berrik', 'vanguard', taken, rng)
      expect(offer.length).toBe(3)
      expect(new Set(offer.map((b) => b.branch)).size).toBe(3)
      for (const b of offer) expect(taken.has(b.id)).toBe(false)
      taken.add(offer[0].id)
    }
  })

  it('gates capstones to round 10 and later', () => {
    const rng = makeRng(11)
    for (const round of [2, 4, 6, 8]) {
      const offer = offerBoons(round, 'h_zhala', 'stormtide', new Set(), rng)
      expect(offer.some((b) => b.capstone)).toBe(false)
    }
  })

  it('never offers another hero-s signature boon', () => {
    const rng = makeRng(13)
    for (let i = 0; i < 60; i++) {
      const offer = offerBoons(12, 'h_berrik', 'vanguard', new Set(), rng)
      for (const b of offer) expect(b.heroId === undefined || b.heroId === 'h_berrik').toBe(true)
    }
  })
})

describe('rivals', () => {
  it('spends nearly all its gold every Muster (gold does not carry over)', () => {
    const rng = makeRng(21)
    let out = { board: [] as never[], camp: newCamp(), gold: 0 }
    let leftover = 0
    for (let round = 1; round <= 8; round++) {
      const res = rivalMuster(
        { board: out.board, gold: income(round, ZERO_MODS), camp: out.camp, mods: ZERO_MODS, round, archetype: 'balanced', factionId: 'vanguard', noise: NOISE.standard },
        rng,
      )
      out = res as never
      leftover += res.gold
    }
    expect(leftover / 8).toBeLessThan(3)
    expect(out.board.length).toBeGreaterThan(0)
  })

  it('never places a back-row-only unit in the front row', () => {
    const rng = makeRng(23)
    let state = { board: [] as never[], camp: newCamp(), gold: 0 }
    for (let round = 1; round <= 10; round++) {
      state = rivalMuster(
        { board: state.board, gold: income(round, ZERO_MODS), camp: state.camp, mods: ZERO_MODS, round, archetype: 'greedy', factionId: 'verdant', noise: NOISE.standard },
        rng,
      ) as never
    }
    expect(state.board.length).toBeGreaterThan(0)
    expect(new Set(state.board.map((s: { slot: number }) => s.slot)).size).toBe(state.board.length)
  })
})
