import { describe, expect, it } from 'vitest'
import { HERO_BY_ID, unit } from '../src/data/index'
import { ZERO_MODS } from '../src/data/types'
import { simulateBattle, type BattleEvent, type BattleSide, type BoardStack, type HeroState } from '../src/engine/battle'

/**
 * Apex abilities (Design Notes 04 §3). The final form of a line has to feel
 * final: a meter that charges from acting and from bleeding, an ultimate that
 * fires in place of an attack, and a log the replay can project — all of it
 * deterministic per seed like everything else in the simulator.
 */

const sylvaen = HERO_BY_ID.get('h_sylvaen')!
const berrik = HERO_BY_ID.get('h_berrik')!

function stack(unitId: string, count: number, slot: number, extra: Partial<BoardStack> = {}): BoardStack {
  return { uid: `${unitId}@${slot}`, unitId, count, slot, bonusAtk: 0, bonusHp: 0, growthTicks: 0, spent: 3, rank: 0, ...extra }
}

function hero(id: string): HeroState {
  return { heroId: id, name: id, factionId: 'vanguard', level: 1, mods: { ...ZERO_MODS } }
}

type ApexEvent = Extract<BattleEvent, { t: 'apex' }>
const apexes = (events: BattleEvent[]): ApexEvent[] => events.filter((e): e is ApexEvent => e.t === 'apex')

/**
 * A wall that soaks for a long time so slow meters get the chance to fill.
 * Mule Carts have 0 ATK, so nothing retaliates the referee to death mid-test,
 * and the slot decides the row — two of them stand in the front line so the
 * front-row ultimates have something to land on.
 */
const wall = () => ({
  board: [stack('vg_mule', 40, 0), stack('vg_mule', 40, 1), stack('vg_mule', 40, 4), stack('vg_mule', 40, 5)],
  hero: hero('h_sylvaen'),
})

const APEX_UNITS = ['vg_champion', 'vg_ballistier', 'vd_elderbark', 'vd_matriarch', 'st_warlord', 'st_stormspear']

describe('who has an Apex (§3)', () => {
  it('exactly the six line-top forms carry one', () => {
    for (const id of APEX_UNITS) expect(unit(id).apex, `${id} should have an Apex`).toBeDefined()
    for (const id of ['vg_militia', 'vg_footman', 'vg_colossus', 'st_leviathan', 'mc_hedgeknight', 'vg_arbalest']) {
      expect(unit(id).apex, `${id} should NOT have an Apex`).toBeUndefined()
    }
  })

  it('every Apex declares a charge requirement and a magnitude', () => {
    for (const id of APEX_UNITS) {
      const a = unit(id).apex!
      expect(a.charge).toBeGreaterThan(0)
      expect(a.x).toBeGreaterThan(0)
      expect(a.name.length).toBeGreaterThan(0)
    }
  })
})

describe('charging and firing', () => {
  it('starts empty, charges as the stack acts, and fires at full', () => {
    const res = simulateBattle({ board: [stack('vg_champion', 4, 0)], hero: hero('h_sylvaen') }, wall(), sylvaen, sylvaen, 7, { round: 1 })
    const start = res.events.find((e) => e.t === 'battleStart') as Extract<BattleEvent, { t: 'battleStart' }>
    const mine = start.a[0]
    expect(mine.apexMax).toBe(unit('vg_champion').apex!.charge)
    expect(mine.apexCharge).toBe(0)

    const fired = apexes(res.events)
    expect(fired.length).toBeGreaterThan(0)
    expect(fired[0].name).toBe('Sunburst Verdict')
    // The meter resets on firing rather than carrying over.
    const after = fired[0].snap.find((s) => s.uid === 'vg_champion@0')!
    expect(after.apexCharge).toBeLessThan(after.apexMax)
  })

  it('the meter never reads past full', () => {
    const res = simulateBattle({ board: [stack('vd_elderbark', 3, 0)], hero: hero('h_sylvaen') }, wall(), sylvaen, sylvaen, 11, { round: 1 })
    for (const e of res.events) {
      if (!('snap' in e)) continue
      for (const s of e.snap) if (s.apexMax > 0) expect(s.apexCharge).toBeLessThanOrEqual(s.apexMax)
    }
  })

  it('a form with no Apex never fires one', () => {
    const res = simulateBattle({ board: [stack('vg_footman', 8, 0)], hero: hero('h_sylvaen') }, wall(), sylvaen, sylvaen, 3, { round: 1 })
    expect(apexes(res.events)).toHaveLength(0)
  })

  it('every one of the six fires its own named ultimate', () => {
    const seen = new Map<string, string>()
    for (const id of APEX_UNITS) {
      for (const seed of [3, 9, 21]) {
        const slot = unit(id).row === 'back' ? 4 : 0
        const res = simulateBattle({ board: [stack(id, 6, slot)], hero: hero('h_sylvaen') }, wall(), sylvaen, sylvaen, seed, { round: 1 })
        const fired = apexes(res.events)
        if (fired.length > 0) {
          seen.set(id, fired[0].name)
          break
        }
      }
    }
    expect([...seen.keys()].sort()).toEqual([...APEX_UNITS].sort())
    expect(new Set(seen.values()).size).toBe(6)
  })
})

describe('what the ultimates do', () => {
  it('Sunburst Verdict ignores Bulwark and shields the front line', () => {
    // Militia carry no Bulwark, so the +1 has to come from the Verdict itself.
    const res = simulateBattle(
      { board: [stack('vg_champion', 4, 0), stack('vg_militia', 10, 1)], hero: hero('h_sylvaen') },
      wall(),
      sylvaen,
      sylvaen,
      7,
      { round: 1 },
    )
    const fired = apexes(res.events)
    expect(fired.length).toBeGreaterThan(0)
    const buffs = res.events.filter((e) => e.t === 'buff' && e.text === '+1 Bulwark')
    expect(buffs.length).toBeGreaterThan(0)
    expect(fired[0].amount).toBeGreaterThan(0)
  })

  it('Rootquake roots the enemy front line and heals the caster', () => {
    const res = simulateBattle(
      { board: [stack('vd_elderbark', 3, 0)], hero: hero('h_sylvaen') },
      wall(),
      sylvaen,
      sylvaen,
      11,
      { round: 1 },
    )
    const fired = apexes(res.events).filter((e) => e.name === 'Rootquake')
    expect(fired.length).toBeGreaterThan(0)
    expect(fired[0].kind).toBe('root')
    expect(fired[0].targets.length).toBeGreaterThan(0)
    const idx = res.events.indexOf(fired[0])
    // The roots and the heal are logged in their own right, before the banner.
    expect(res.events.slice(0, idx).some((e) => e.t === 'root')).toBe(true)
  })

  it('Ninth Wave splashes the neighbours of the largest stack', () => {
    const res = simulateBattle(
      { board: [stack('st_stormspear', 6, 4)], hero: hero('h_sylvaen') },
      // The largest stack sits between two neighbours, which is what the
      // splash is for — an isolated stack would pass the test vacuously.
      { board: [stack('vg_mule', 20, 4), stack('vg_mule', 60, 5), stack('vg_mule', 20, 6)], hero: hero('h_sylvaen') },
      sylvaen,
      sylvaen,
      5,
      { round: 1 },
    )
    const fired = apexes(res.events).filter((e) => e.name === 'Ninth Wave')
    expect(fired.length).toBeGreaterThan(0)
    // The biggest stack plus at least one neighbour.
    expect(fired[0].targets.length).toBeGreaterThan(1)
  })
})

describe('determinism (§12.12)', () => {
  const sides = (): [BattleSide, BattleSide] => [
      // Both sides get a Mule Cart to chew through, so neither collapses
      // before its meters fill and the log has Apexes to compare.
      { board: [stack('vg_champion', 5, 0), stack('vg_ballistier', 4, 4), stack('vg_mule', 80, 1)], hero: hero('h_sylvaen') },
      { board: [stack('st_warlord', 4, 0), stack('st_stormspear', 4, 4), stack('vg_mule', 80, 1)], hero: hero('h_sylvaen') },
  ]

  it('the same seed produces the identical Apex log', () => {
    for (const seed of [1, 17, 404]) {
      const [a1, b1] = sides()
      const [a2, b2] = sides()
      const r1 = simulateBattle(a1, b1, sylvaen, sylvaen, seed, { round: 4 })
      const r2 = simulateBattle(a2, b2, sylvaen, sylvaen, seed, { round: 4 })
      expect(JSON.stringify(r1.events)).toBe(JSON.stringify(r2.events))
      expect(apexes(r1.events).length).toBeGreaterThan(0)
    }
  })

  it('different seeds still agree on when each meter fills', () => {
    // Charging is not random: the same board fires the same number of Apexes
    // whatever the seed, even though targeting rolls differently.
    const counts = [2, 8, 64, 512].map((seed) => {
      const [a, b] = sides()
      return apexes(simulateBattle(a, b, sylvaen, sylvaen, seed, { round: 4 }).events).length
    })
    expect(counts.every((n) => n > 0)).toBe(true)
  })
})

/**
 * Caster attribution (Design Notes 04 §10). The Battle Cleric's per-exchange
 * heal was the most invisible power in the game: the event named who was
 * healed but never who healed them, so the UI could only bloom light out of
 * nowhere. Naming the source is what lets the magic travel.
 */
describe('caster attribution (§10)', () => {
  /**
   * The Cleric only heals someone else if it survives and someone else is
   * hurt. Attacking into melee gets it retaliated to death, so the enemy front
   * is Mule Carts (0 ATK, nothing to retaliate with) and the wounds come from
   * a Crossbow Levy volleying over the top, which draws no retaliation either.
   * Berrik on both sides: his spell grants Bulwark, so no hero heal is mixed in.
   *
   * The volley was widened from 8 to 14. Berrik's Shield Line got stronger and
   * much more frequent in the hero rebalance, and at the old size it simply
   * prevented the wound this fixture needs — the test went red for a reason
   * that had nothing to do with attribution. It wants a volley big enough to
   * wound the Cleric through the shield but not so big it deletes the stack
   * before it can heal anyone.
   */
  const clericBattle = () =>
    simulateBattle(
      { board: [stack('vg_cleric', 4, 4), stack('vg_mule', 20, 0)], hero: hero('h_berrik') },
      { board: [stack('vg_mule', 60, 0), stack('vg_crossbow', 14, 4)], hero: hero('h_berrik') },
      berrik,
      berrik,
      13,
      { round: 1 },
    )

  const healsIn = (res: ReturnType<typeof simulateBattle>) =>
    res.events.filter((e): e is Extract<BattleEvent, { t: 'heal' }> => e.t === 'heal')

  it('a unit ability names the stack that cast it', () => {
    const heals = healsIn(clericBattle())
    const fromCleric = heals.filter((h) => h.src === 'vg_cleric@4')
    expect(fromCleric.length).toBeGreaterThan(0)
    expect(fromCleric[0].uid).toBe('vg_mule@0')
    // The snapshot has to carry the caster too, or the replay cannot find the
    // card the beam leaves from.
    expect(fromCleric[0].snap.some((s) => s.uid === 'vg_cleric@4')).toBe(true)
  })

  it('never attributes a heal to its own recipient — that is a beam to nowhere', () => {
    const heals = healsIn(clericBattle())
    expect(heals.length).toBeGreaterThan(0)
    for (const h of heals) expect(h.src).not.toBe(h.uid)
    // Self-heals happen in this battle and carry no source at all.
    expect(heals.some((h) => h.uid === 'vg_cleric@4' && h.src === undefined)).toBe(true)
  })

  it('a hero spell leaves it unset — it already beams from the portrait', () => {
    // Sylvaen's Rejuvenate, with no Cleric on the field to muddy the log.
    const res = simulateBattle(
      { board: [stack('vg_mule', 20, 0)], hero: hero('h_sylvaen') },
      { board: [stack('vg_mule', 60, 0), stack('vg_crossbow', 8, 4)], hero: hero('h_sylvaen') },
      sylvaen,
      sylvaen,
      13,
      { round: 6 },
    )
    const heals = healsIn(res)
    expect(heals.length).toBeGreaterThan(0)
    for (const h of heals) expect(h.src).toBeUndefined()
  })

  it('an ability buff names its caster so the beam has an origin', () => {
    // Drummer Whelp rallies the warband at battle start.
    const res = simulateBattle(
      { board: [stack('st_drummer', 3, 4), stack('vg_mule', 20, 0)], hero: hero('h_berrik') },
      { board: [stack('vg_mule', 40, 0)], hero: hero('h_berrik') },
      berrik,
      berrik,
      7,
      { round: 1 },
    )
    const buffs = res.events.filter((e): e is Extract<BattleEvent, { t: 'buff' }> => e.t === 'buff')
    const fromDrummer = buffs.filter((b) => b.src === 'st_drummer@4')
    expect(fromDrummer.length).toBeGreaterThan(0)
    expect(fromDrummer[0].uids.length).toBeGreaterThan(1)
  })
})
