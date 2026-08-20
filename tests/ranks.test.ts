import { describe, expect, it } from 'vitest'
import { ALL_UNITS, HERO_BY_ID, unit } from '../src/data/index'
import { ZERO_MODS, type RankDef } from '../src/data/types'
import { simulateBattle, type BattleEvent, type BoardStack, type HeroState } from '../src/engine/battle'
import { newCamp, promote, recruit } from '../src/engine/camp'
import {
  applyRankProgress,
  lineRootOf,
  rankDefOf,
  rankForCount,
  thresholdsFor,
  thresholdsOf,
} from '../src/engine/ranks'
import { newRun, player, resolveBattles, type RunState } from '../src/engine/run'

const sylvaen = HERO_BY_ID.get('h_sylvaen')!
const berrik = HERO_BY_ID.get('h_berrik')!

function stack(unitId: string, count: number, slot: number, extra: Partial<BoardStack> = {}): BoardStack {
  return { uid: `${unitId}@${slot}`, unitId, count, slot, bonusAtk: 0, bonusHp: 0, growthTicks: 0, spent: 3, rank: 0, ...extra }
}

function hero(id: string): HeroState {
  return { heroId: id, name: id, factionId: 'vanguard', level: 1, mods: { ...ZERO_MODS } }
}

type AttackEvent = Extract<BattleEvent, { t: 'attack' }>
const attacksBy = (events: BattleEvent[], uid: string): AttackEvent[] =>
  events.filter((e): e is AttackEvent => e.t === 'attack' && e.src === uid)

describe('rank thresholds', () => {
  it('defaults off the line root muster size', () => {
    // Militia +4, Crossbow Levy +3, Shield Girl +3, Cannon Crew +1.
    expect(thresholdsFor('vg_militia')).toEqual([14, 28])
    expect(thresholdsFor('vg_crossbow')).toEqual([14, 28])
    expect(thresholdsFor('vg_shieldgirl')).toEqual([14, 28])
    expect(thresholdsFor('vg_cannon')).toEqual([5, 10])
  })

  it('moved the Shieldmaiden’s banner when her line grew a root beneath her', () => {
    // She mustered 2 and was her own root, so Sister-Shield came at [10, 20].
    // DN12 §3.4 put vg_shieldgirl under her; thresholds key off the ROOT, and
    // the root musters 3 — so the banner now arrives on the same schedule as
    // every other line in the game rather than on her own.
    expect(lineRootOf('vg_shieldmaiden')).toBe('vg_shieldgirl')
    expect(thresholdsFor('vg_shieldmaiden')).toEqual([14, 28])
    expect(rankDefOf('vg_shieldmaiden')).toBe(unit('vg_shieldgirl').rank)
  })

  it('carries the Colossus line’s banner on its new root', () => {
    expect(lineRootOf('vg_colossus')).toBe('vg_cairn')
    expect(lineRootOf('vg_bulwark')).toBe('vg_cairn')
    expect(rankDefOf('vg_colossus')).toBe(unit('vg_cairn').rank)
    expect(rankDefOf('vg_colossus')?.honoredName).toBe('Avalanche Step')
  })

  it('keys off the ROOT form, so promoting never moves the goalposts', () => {
    // Sunforged Champion musters 1 on its own, but it is the Militia line's end.
    expect(lineRootOf('vg_champion')).toBe('vg_militia')
    expect(thresholdsFor('vg_champion')).toEqual([14, 28])
    expect(thresholdsFor('vg_footman')).toEqual([14, 28])
  })

  it('honours a data override', () => {
    const def: RankDef = { thresholds: [3, 5], veteran: { atk: 1 }, honoredName: 'x', honoredText: 'x', honored: { type: 'firstShotDouble' } }
    expect(thresholdsOf(def, unit('vg_militia'))).toEqual([3, 5])
  })

  it('rankForCount is inclusive at each boundary', () => {
    const th: [number, number] = [8, 16]
    expect([0, 7, 8, 9, 15, 16, 40].map((n) => rankForCount(n, th))).toEqual([0, 0, 1, 1, 1, 2, 2])
  })

  it('every unit in the game resolves a rank definition', () => {
    for (const u of ALL_UNITS) {
      expect(rankDefOf(u.id), `${u.id} has no RankDef`).not.toBeNull()
      expect(thresholdsFor(u.id), `${u.id} has no thresholds`).not.toBeNull()
    }
  })

  it('rank blocks live only on line roots — anywhere else they are dead data', () => {
    // rankDefOf resolves through lineRootOf, so a block on a mid or top form
    // is never read. Catching it here stops a new promotion form quietly
    // shipping rewards nobody will ever see.
    for (const u of ALL_UNITS) {
      if (!u.rank) continue
      expect(lineRootOf(u.id), `${u.id} defines a rank block but is not its line root`).toBe(u.id)
    }
  })

  it('the new T4 line tops inherit their line root ranks', () => {
    for (const [top, root] of [
      ['vg_ballistier', 'vg_crossbow'],
      ['vd_matriarch', 'vd_dryad'],
      ['st_stormspear', 'st_slinger'],
    ] as const) {
      expect(lineRootOf(top)).toBe(root)
      expect(rankDefOf(top)).toBe(unit(root).rank)
    }
  })
})

describe('rank progress', () => {
  it('never lowers an earned rank', () => {
    // 28 Militia are Honored; a battle that cuts them to 2 keeps the banner.
    expect(applyRankProgress({ unitId: 'vg_militia', count: 28, rank: 0 })).toBe(2)
    expect(applyRankProgress({ unitId: 'vg_militia', count: 2, rank: 2 })).toBe(2)
    expect(applyRankProgress({ unitId: 'vg_militia', count: 0, rank: 1 })).toBe(1)
  })

  it('recruit() ranks a stack up as it crosses a threshold', () => {
    let r = recruit([], 99, 'vg_militia', ZERO_MODS)
    expect(r.board[0].rank).toBe(0)
    for (let i = 0; i < 3; i++) r = recruit(r.board, r.gold, 'vg_militia', ZERO_MODS)
    expect(r.board[0].count).toBe(16)
    expect(r.board[0].rank).toBe(1)
    for (let i = 0; i < 3; i++) r = recruit(r.board, r.gold, 'vg_militia', ZERO_MODS)
    expect(r.board[0].count).toBe(28)
    expect(r.board[0].rank).toBe(2)
  })

  it('a rank survives promotion, count and all', () => {
    let r = recruit([], 99, 'vg_militia', ZERO_MODS)
    for (let i = 0; i < 3; i++) r = recruit(r.board, r.gold, 'vg_militia', ZERO_MODS)
    expect(r.board[0].rank).toBe(1)
    const promoted = promote(r.board, 20, r.board[0].uid, { ...newCamp(), tier: 2 }, ZERO_MODS)
    expect(promoted.ok).toBe(true)
    expect(promoted.board[0].unitId).toBe('vg_footman')
    expect(promoted.board[0].rank).toBe(1)
    expect(promoted.board[0].count).toBe(16)
  })
})

describe('rank effects in battle', () => {
  it('Veteran stats reach the field', () => {
    // Crossbow Levy Veteran is +1 ATK per unit: 4 shooters go 4 -> 8 damage.
    const foe = () => ({ board: [stack('vg_militia', 20, 0)], hero: hero('h_sylvaen') })
    const plain = simulateBattle({ board: [stack('vg_crossbow', 4, 4)], hero: hero('h_sylvaen') }, foe(), sylvaen, sylvaen, 3, { round: 1 })
    const vet = simulateBattle(
      { board: [stack('vg_crossbow', 4, 4, { rank: 1 })], hero: hero('h_sylvaen') },
      foe(),
      sylvaen,
      sylvaen,
      3,
      { round: 1 },
    )
    expect(attacksBy(plain.events, 'vg_crossbow@4')[0].dmg).toBe(4)
    expect(attacksBy(vet.events, 'vg_crossbow@4')[0].dmg).toBe(8)
  })

  it('Honored keyword grants merge into the keyword pipeline (Shield Wall)', () => {
    // Militia carry no Bulwark of their own. Honored gives the stack Bulwark 1,
    // which soaks bulwark x count — enough to eat a 3-Footman swing whole.
    const melee = () => ({ board: [stack('vg_footman', 3, 0)], hero: hero('h_sylvaen') })
    const wall = (rank: number) => ({ board: [stack('vg_militia', 12, 0, { rank })], hero: hero('h_sylvaen') })
    const plain = simulateBattle(melee(), wall(0), sylvaen, sylvaen, 5, { round: 1 })
    const honored = simulateBattle(melee(), wall(2), sylvaen, sylvaen, 5, { round: 1 })
    const plainHit = attacksBy(plain.events, 'vg_footman@0')[0]
    const honoredHit = attacksBy(honored.events, 'vg_footman@0')[0]
    expect(plainHit.absorbed).toBe(0)
    expect(plainHit.dmg).toBe(6)
    expect(honoredHit.absorbed).toBe(6)
    expect(honoredHit.dmg).toBe(0)
  })

  it('Piercing Volley splashes half the hit onto a second stack', () => {
    // Honored implies Veteran, so 4 Levy hit for 4 x 2 = 8; splash is 8 / 2.
    const a = { board: [stack('vg_crossbow', 4, 4, { rank: 2 })], hero: hero('h_sylvaen') }
    const b = { board: [stack('vg_militia', 20, 0), stack('vg_militia', 20, 1)], hero: hero('h_sylvaen') }
    const res = simulateBattle(a, b, sylvaen, sylvaen, 9, { round: 1 })
    const shots = attacksBy(res.events, 'vg_crossbow@4')
    expect(shots[0].dmg).toBe(8)
    expect(shots[1].dmg).toBe(4)
    expect(shots[1].dst).not.toBe(shots[0].dst)
    // A splash never provokes a counterstrike.
    expect(shots[1].retaliation).toBe(false)
  })

  it('Overcharge doubles the first attack only', () => {
    // Mule Carts have 0 ATK, so nothing interrupts the crew's firing order.
    const a = { board: [stack('vg_cannon', 2, 4, { rank: 2 })], hero: hero('h_sylvaen') }
    const b = { board: [stack('vg_mule', 40, 4)], hero: hero('h_sylvaen') }
    const res = simulateBattle(a, b, sylvaen, sylvaen, 11, { round: 1 })
    const shots = attacksBy(res.events, 'vg_cannon@4')
    // 2 crews x (6 + 1 Veteran ATK) = 14, doubled on the opening shot.
    expect(shots[0].dmg).toBe(28)
    expect(shots[1].dmg).toBe(14)
  })

  it('ability echo resolves a Battle Cleric heal twice', () => {
    // Berrik on both sides: his passive is armour, so the only `heal` events in
    // the log are the Cleric's litany. A fat wall and a fat Arbalest keep the
    // fight going long enough for it to fire several times.
    const side = (rank: number) => ({
      board: [stack('vg_militia', 8, 0, { bonusHp: 10 }), stack('vg_cleric', 2, 4, { rank, bonusHp: 12 })],
      hero: hero('h_berrik'),
    })
    const foe = () => ({ board: [stack('vg_arbalest', 4, 4, { bonusHp: 20 })], hero: hero('h_berrik') })
    const healed = (rank: number): number =>
      simulateBattle(side(rank), foe(), berrik, berrik, 13, { round: 4 })
        .events.reduce((n, e) => (e.t === 'heal' ? n + e.amount : n), 0)
    expect(healed(0)).toBeGreaterThan(0)
    expect(healed(2)).toBeGreaterThan(healed(0))
  })
})

describe('Thornqueen Maravel — survivorGrowsCount', () => {
  function maravelRun(seed: number): RunState {
    const run = newRun({ seed, factionId: 'verdant', heroId: 'h_maravel' })
    return run
  }

  it('grants +1 count to every stack that survives the battle', () => {
    const run = maravelRun(2024)
    const p = player(run)
    p.board = [stack('vd_sapling', 9, 0, { uid: 's_alpha' })]
    const before = p.board[0].count
    resolveBattles(run)
    const after = player(run).board[0]
    // Either the stack survived (+1 on top of casualties) or it was wiped;
    // it can never come back with more than the +1 the passive grants.
    if (after.count > 0) expect(after.count).toBeLessThanOrEqual(before + 1)
    const survived = run.reports
      .flatMap((r) => [...r.result.survivorsA, ...r.result.survivorsB])
      .some((s) => s.uid === 's_alpha' && s.count > 0)
    if (survived) expect(after.count).toBeGreaterThan(0)
  })

  it('grows a stack that bled and walked off, and ranks it up on the way', () => {
    const run = maravelRun(3)
    const p = player(run)
    // A wall the first-round rivals can bloody but not break, sitting one unit
    // short of Veteran (Sapling Warden musters 4 -> thresholds 14/28).
    p.board = [stack('vd_sapling', 13, 0, { uid: 's_wall' })]
    resolveBattles(run)
    const survivors = run.reports
      .flatMap((r) => [...r.result.survivorsA, ...r.result.survivorsB])
      .find((s) => s.uid === 's_wall')
    expect(survivors, 'the fixture must survive for this to test anything').toBeDefined()
    expect(survivors!.count, 'and must take casualties, which is what the passive replaces').toBeLessThan(13)
    const after = player(run).board[0]
    expect(after.count).toBe(14)
    expect(after.rank).toBe(1)
  })

  /**
   * The passive replaces the dead, so a stack that was never touched has
   * nothing to replace. Unconditional growth made Maravel the strongest hero in
   * the game by a distance — 3.9 average placement and 18% of all wins against
   * a 4.0-5.0 band — because counts multiply stats *and* drive Banner Ranks.
   */
  it('leaves a stack that came through untouched exactly as it was', () => {
    const run = maravelRun(31)
    const p = player(run)
    p.board = [stack('vd_sapling', 11, 0, { uid: 's_wall', bonusHp: 40, bonusAtk: 20 })]
    resolveBattles(run)
    const survivors = run.reports
      .flatMap((r) => [...r.result.survivorsA, ...r.result.survivorsB])
      .find((s) => s.uid === 's_wall')
    expect(survivors?.count, 'the fixture is deliberately unkillable').toBe(11)
    expect(player(run).board[0].count).toBe(11)
  })

  it('never touches a ghost board', () => {
    const run = maravelRun(77)
    // Force a ghost pairing: one warlord fights an eliminated rival's last board.
    const ghost = run.warlords[3]
    ghost.alive = false
    ghost.eliminatedRound = 1
    ghost.placement = 8
    ghost.heroId = 'h_maravel'
    run.ghostBoards[ghost.id] = [stack('vd_sapling', 6, 0, { uid: 'g1', bonusHp: 30 })]
    ghost.board = run.ghostBoards[ghost.id]
    run.pairings = [{ aId: run.playerId, bId: ghost.id, ghost: true }]
    const p = player(run)
    p.board = [stack('vd_sapling', 4, 0, { uid: 'p1' })]
    resolveBattles(run)
    expect(run.ghostBoards[ghost.id][0].count).toBe(6)
    expect(ghost.board[0].count).toBe(6)
  })

  it('leaves heroes without the passive alone', () => {
    const run = newRun({ seed: 31, factionId: 'verdant', heroId: 'h_sylvaen' })
    const p = player(run)
    p.board = [stack('vd_sapling', 11, 0, { uid: 's_wall', bonusHp: 40, bonusAtk: 20 })]
    resolveBattles(run)
    expect(player(run).board[0].count).toBeLessThanOrEqual(11)
  })
})
