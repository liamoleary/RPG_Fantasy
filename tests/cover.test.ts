import { describe, expect, it } from 'vitest'
import { HERO_BY_ID } from '../src/data/index'
import { ZERO_MODS } from '../src/data/types'
import { coveringSlotsFor, simulateBattle, type BattleEvent, type BoardStack, type HeroState } from '../src/engine/battle'

/**
 * Cover (Design Notes 02 §5).
 *
 * Sylvaen is the neutral referee: no Bulwark passive, and Rejuvenate does not
 * cast at battle start, so nothing distorts the opening exchanges.
 *
 * Volley targeting is deliberately random, so every fixture here pairs a
 * durable attacker (a wall in front of the archers) with a durable defence.
 * That gives the volley enough shots to reach the back row, and each test
 * asserts a save actually happened rather than passing vacuously on zero.
 */
const sylvaen = HERO_BY_ID.get('h_sylvaen')!
const grommash = HERO_BY_ID.get('h_grommash')!

function stack(unitId: string, count: number, slot: number, extra: Partial<BoardStack> = {}): BoardStack {
  return { uid: `${unitId}@${slot}`, unitId, count, slot, bonusAtk: 0, bonusHp: 0, growthTicks: 0, spent: 3, rank: 0, ...extra }
}

function hero(id: string, mods: Partial<typeof ZERO_MODS> = {}): HeroState {
  return { heroId: id, name: id, factionId: 'vanguard', level: 1, mods: { ...ZERO_MODS, ...mods } }
}

type CoverEvent = Extract<BattleEvent, { t: 'cover' }>
type AttackEvent = Extract<BattleEvent, { t: 'attack' }>
const covers = (evts: BattleEvent[]): CoverEvent[] => evts.filter((e): e is CoverEvent => e.t === 'cover')
const shots = (evts: BattleEvent[], src: string, dst: string): AttackEvent[] =>
  evts.filter((e): e is AttackEvent => e.t === 'attack' && e.src === src && e.dst === dst && !e.retaliation)

/** A volley platform that survives long enough to fire repeatedly. */
const archers = () => ({ board: [stack('vg_militia', 30, 0), stack('vg_arbalest', 4, 4)], hero: hero('h_sylvaen') })

describe('coverage map (§5.6)', () => {
  it('back slot b sits behind front slots b and b+1', () => {
    // Slots are 0-3 front, 4-6 back, so back slot 4 is back index 0.
    expect(coveringSlotsFor(4)).toEqual([0, 1])
    expect(coveringSlotsFor(5)).toEqual([1, 2])
    expect(coveringSlotsFor(6)).toEqual([2, 3])
  })

  it('back slot 2 is covered by front slots 2 and 3, and by nothing else', () => {
    const backSlot = 6
    const withCovererAt = (slot: number) =>
      simulateBattle(
        archers(),
        { board: [stack('vg_shieldmaiden', 8, slot), stack('vg_crossbow', 30, backSlot)], hero: hero('h_sylvaen') },
        sylvaen,
        sylvaen,
        1,
        { round: 5 },
      )

    // Front slot 2 stands over back slot 2 and intercepts.
    expect(covers(withCovererAt(2).events).length).toBeGreaterThan(0)
    // Front slots 0 and 1 are nowhere near it and must never intercept.
    expect(covers(withCovererAt(0).events)).toHaveLength(0)
    expect(covers(withCovererAt(1).events)).toHaveLength(0)
  })
})

describe('redirection', () => {
  it('a volley at a covered back stack hits the coverer and spends a charge (§5.1)', () => {
    const defence = { board: [stack('vg_shieldmaiden', 8, 1), stack('vg_crossbow', 30, 4)], hero: hero('h_sylvaen') }
    const res = simulateBattle(archers(), defence, sylvaen, sylvaen, 1, { round: 5 })

    const saves = covers(res.events)
    expect(saves.length).toBeGreaterThan(0)
    const first = saves[0]
    expect(first.src).toBe('vg_arbalest@4')
    expect(first.saved).toBe('vg_crossbow@4')
    expect(first.by).toBe('vg_shieldmaiden@1')
    // Shieldmaiden carries Cover 2, so one charge remains after the first save.
    expect(first.left).toBe(1)

    // The shot resolves against the coverer, not the stack it was aimed at.
    const after = res.events.slice(res.events.indexOf(first))
    const landed = after.find((e): e is AttackEvent => e.t === 'attack' && e.src === 'vg_arbalest@4' && !e.retaliation)
    expect(landed?.dst).toBe('vg_shieldmaiden@1')
  })

  it('charges deplete — the next volley goes through to the original target (§5.2)', () => {
    // Pike Wall carries Cover 1: exactly one save, then the back row is open.
    const defence = { board: [stack('mc_pikewall', 10, 1), stack('vg_crossbow', 30, 4)], hero: hero('h_sylvaen') }
    const res = simulateBattle(archers(), defence, sylvaen, sylvaen, 6, { round: 5 })

    const saves = covers(res.events)
    expect(saves).toHaveLength(1)
    expect(saves[0].left).toBe(0)

    // A later volley from the same archers reaches the stack that was saved.
    const through = shots(res.events, 'vg_arbalest@4', 'vg_crossbow@4')
    expect(through.length).toBeGreaterThan(0)
    expect(res.events.indexOf(through[0])).toBeGreaterThan(res.events.indexOf(saves[0]))
  })

  it('a dead coverer intercepts nothing (§5.3)', () => {
    // A single Shieldmaiden, removed early by Siege; the Crossbow Levy behind
    // her is exposed from that moment on.
    const attackers = {
      board: [stack('vg_militia', 30, 0), stack('vg_cannon', 3, 4), stack('vg_arbalest', 4, 5)],
      hero: hero('h_sylvaen'),
    }
    const defence = { board: [stack('vg_shieldmaiden', 1, 1), stack('vg_crossbow', 30, 4)], hero: hero('h_sylvaen') }
    const res = simulateBattle(attackers, defence, sylvaen, sylvaen, 1, { round: 6 })

    const death = res.events.findIndex((e) => e.t === 'death' && e.uid === 'vg_shieldmaiden@1')
    expect(death).toBeGreaterThanOrEqual(0)
    const afterDeath = res.events.slice(death)
    // No save can be recorded once she is gone...
    expect(afterDeath.filter((e) => e.t === 'cover')).toHaveLength(0)
    // ...and volleys do reach the back row afterwards, so this is not vacuous.
    expect(afterDeath.filter((e) => e.t === 'attack' && e.dst === 'vg_crossbow@4' && !e.retaliation).length).toBeGreaterThan(0)
  })
})

describe('what Cover deliberately does not stop', () => {
  it('Siege is never redirected (§5.4)', () => {
    // Siege normally hunts the highest-Bulwark stack, which would never reach
    // the Cover branch at all. This defence carries no Bulwark, so the Cannon
    // Crew (Volley + Siege) picks a random stack exactly like any other volley
    // — and must still punch through a fully-charged Cover wall.
    const attackers = { board: [stack('vg_militia', 30, 0), stack('vg_cannon', 4, 4)], hero: hero('h_sylvaen') }
    const defence = {
      board: [stack('vg_militia', 12, 1), stack('vg_crossbow', 30, 4)],
      hero: hero('h_sylvaen', { frontCover: 3 }),
    }
    const res = simulateBattle(attackers, defence, sylvaen, sylvaen, 4, { round: 6 })
    // The cannon reached the covered back stack...
    expect(shots(res.events, 'vg_cannon@4', 'vg_crossbow@4').length).toBeGreaterThan(0)
    // ...and no charge was spent doing it.
    expect(covers(res.events)).toHaveLength(0)
  })

  it('spell damage is never redirected (§5.5)', () => {
    // Chain Lightning fires at battle start straight at the largest stacks.
    const attackers = { board: [stack('vg_militia', 30, 0), stack('st_slinger', 2, 4)], hero: hero('h_grommash') }
    const defence = { board: [stack('vg_shieldmaiden', 8, 1), stack('vg_crossbow', 30, 4)], hero: hero('h_sylvaen') }
    const res = simulateBattle(attackers, defence, grommash, sylvaen, 3, { round: 8 })

    const castIdx = res.events.findIndex((e) => e.t === 'spellCast')
    expect(castIdx).toBeGreaterThanOrEqual(0)
    // The spell's own resolution window contains no cover event: everything
    // before the spellCast marker belongs to the cast itself.
    expect(res.events.slice(0, castIdx).filter((e) => e.t === 'cover')).toHaveLength(0)
    const cast = res.events[castIdx]
    expect(cast.t === 'spellCast' && cast.targets).toContain('vg_crossbow@4')
  })

  it('melee never triggers Cover', () => {
    const attackers = { board: [stack('vg_militia', 30, 0)], hero: hero('h_sylvaen') }
    const defence = { board: [stack('vg_shieldmaiden', 8, 1), stack('vg_crossbow', 30, 4)], hero: hero('h_sylvaen') }
    const res = simulateBattle(attackers, defence, sylvaen, sylvaen, 9, { round: 4 })
    for (const c of covers(res.events)) expect(c.src).not.toBe('vg_militia@0')
  })
})

describe('Overwatch boon', () => {
  const line = () => [stack('vg_footman', 8, 1), stack('vg_crossbow', 30, 4)]

  it('grants Cover 1 to a front-row stack that has none', () => {
    const plain = simulateBattle(archers(), { board: line(), hero: hero('h_sylvaen') }, sylvaen, sylvaen, 1, { round: 5 })
    const watched = simulateBattle(
      archers(),
      { board: line(), hero: hero('h_sylvaen', { frontCover: 1 }) },
      sylvaen,
      sylvaen,
      1,
      { round: 5 },
    )
    expect(covers(plain.events)).toHaveLength(0)
    expect(covers(watched.events).length).toBeGreaterThan(0)
    expect(covers(watched.events)[0].by).toBe('vg_footman@1')
    expect(covers(watched.events)[0].left).toBe(0)
  })

  it('does not give the back row Cover', () => {
    const backOnly = { board: [stack('vg_crossbow', 30, 4)], hero: hero('h_sylvaen', { frontCover: 2 }) }
    const res = simulateBattle(archers(), backOnly, sylvaen, sylvaen, 1, { round: 5 })
    expect(covers(res.events)).toHaveLength(0)
  })
})

describe('determinism with Cover in play (§5.7)', () => {
  it('the same seed replays identically', () => {
    const build = () => ({
      a: { board: [stack('vg_militia', 30, 0), stack('vg_arbalest', 4, 4)], hero: hero('h_sylvaen') },
      b: {
        board: [stack('vg_shieldmaiden', 8, 1), stack('mc_pikewall', 6, 2), stack('vg_crossbow', 30, 4), stack('vg_cleric', 4, 5)],
        hero: hero('h_sylvaen', { frontCover: 1 }),
      },
    })
    const one = build()
    const two = build()
    const r1 = simulateBattle(one.a, one.b, sylvaen, sylvaen, 1, { round: 9 })
    const r2 = simulateBattle(two.a, two.b, sylvaen, sylvaen, 1, { round: 9 })
    expect(JSON.stringify(r1.events)).toEqual(JSON.stringify(r2.events))
    expect(r1.winner).toEqual(r2.winner)
    // The fixture must actually exercise Cover, or this proves nothing.
    expect(covers(r1.events).length).toBeGreaterThan(0)
  })

  it('the interceptor is chosen by charges, not by board order', () => {
    // Both stacks cover back slot 4. Shieldmaiden has 2 charges to Pike Wall's
    // 1, so she intercepts first however the array is ordered.
    const forward = {
      board: [stack('mc_pikewall', 6, 0), stack('vg_shieldmaiden', 6, 1), stack('vg_crossbow', 30, 4)],
      hero: hero('h_sylvaen'),
    }
    const reversed = {
      board: [stack('vg_crossbow', 30, 4), stack('vg_shieldmaiden', 6, 1), stack('mc_pikewall', 6, 0)],
      hero: hero('h_sylvaen'),
    }
    const r1 = simulateBattle(archers(), forward, sylvaen, sylvaen, 6, { round: 7 })
    const r2 = simulateBattle(archers(), reversed, sylvaen, sylvaen, 6, { round: 7 })
    expect(covers(r1.events).length).toBeGreaterThan(0)
    expect(covers(r1.events)[0].by).toBe('vg_shieldmaiden@1')
    expect(covers(r2.events)[0].by).toBe('vg_shieldmaiden@1')
  })
})
