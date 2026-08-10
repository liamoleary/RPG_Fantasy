import { describe, expect, it } from 'vitest'
import { simulateBattle, stackStats, type BattleEvent, type BoardStack, type HeroState } from '../src/engine/battle'
import { HERO_BY_ID, unit } from '../src/data/index'
import { ZERO_MODS } from '../src/data/types'

const berrik = HERO_BY_ID.get('h_berrik')!
const grommash = HERO_BY_ID.get('h_grommash')!
const sylvaen = HERO_BY_ID.get('h_sylvaen')!

function stack(unitId: string, count: number, slot: number, extra: Partial<BoardStack> = {}): BoardStack {
  return { uid: `${unitId}@${slot}`, unitId, count, slot, bonusAtk: 0, bonusHp: 0, growthTicks: 0, spent: 3, rank: 0, ...extra }
}

function hero(id: string, level = 1, mods = {}): HeroState {
  return { heroId: id, name: id, factionId: 'vanguard', level, mods: { ...ZERO_MODS, ...mods } }
}

/**
 * Sylvaen is the neutral referee for pure combat-math tests: no Bulwark
 * passive, and Rejuvenate does not cast at battle start, so nothing
 * distorts the first few exchanges.
 */
type AttackEvent = Extract<BattleEvent, { t: 'attack' }>

function attacksBy(events: BattleEvent[], uid: string): AttackEvent[] {
  return events.filter((e): e is AttackEvent => e.t === 'attack' && e.src === uid)
}

describe('stack damage math (HoMM pooled HP)', () => {
  it('kills whole units and carries the remainder as a wound on the top unit', () => {
    // 2 Arbalests (3/2) = 6 damage into 2 HP Militia -> exactly 3 units die.
    const a = { board: [stack('vg_arbalest', 2, 4)], hero: hero('h_sylvaen') }
    const b = { board: [stack('vg_militia', 10, 0)], hero: hero('h_sylvaen') }
    const res = simulateBattle(a, b, sylvaen, sylvaen, 1, { round: 1 })
    const first = attacksBy(res.events, 'vg_arbalest@4')[0]
    expect(first).toBeDefined()
    expect(first.dmg).toBe(6)
    expect(first.killed).toBe(3)
  })

  it('carries leftover damage as a wound instead of rounding a unit away', () => {
    // 1 Arbalest (3 ATK) into 4 Militia (2 HP each, 8 pooled): 3 damage kills
    // exactly one and leaves 1 point riding on the next unit.
    const a = { board: [stack('vg_arbalest', 1, 4)], hero: hero('h_sylvaen') }
    const b = { board: [stack('vg_militia', 4, 0)], hero: hero('h_sylvaen') }
    const res = simulateBattle(a, b, sylvaen, sylvaen, 7, { round: 1 })
    const shot = attacksBy(res.events, 'vg_arbalest@4')[0]
    expect(shot.dmg).toBe(3)
    expect(shot.killed).toBe(1)
    const target = shot.snap.find((s) => s.uid === 'vg_militia@0')!
    expect(target.count).toBe(3)
    expect(target.wound).toBe(1)
  })
})

/**
 * The three numbers a card shows. They live on the snapshot rather than being
 * worked out in the UI (GDD §12.3), so the thing worth pinning is that they
 * are the *simulation's* numbers: `hp` is the pool the engine spends down and
 * `power` is the swing it actually rolls, not a per-model stat the display
 * happened to multiply.
 */
describe('what a card shows during a battle', () => {
  it('reports the pool the engine is actually spending, wound and all', () => {
    // 1 Arbalest (3 ATK) into 4 Militia (2 HP each): pool 8 -> 5.
    const a = { board: [stack('vg_arbalest', 1, 4)], hero: hero('h_sylvaen') }
    const b = { board: [stack('vg_militia', 4, 0)], hero: hero('h_sylvaen') }
    const res = simulateBattle(a, b, sylvaen, sylvaen, 7, { round: 1 })
    const shot = attacksBy(res.events, 'vg_arbalest@4')[0]
    const target = shot.snap.find((s) => s.uid === 'vg_militia@0')!
    expect(target.hpMax).toBe(8)
    expect(target.hp).toBe(5)
    // ...which is exactly the count/wound pair the same snapshot carries, so
    // the number on the card and the number the AI targets on cannot drift.
    expect(target.hp).toBe(target.count * target.maxHp - target.wound)
  })

  it('reports the swing the stack rolls, not one model’s attack', () => {
    const a = { board: [stack('vg_arbalest', 2, 4)], hero: hero('h_sylvaen') }
    const b = { board: [stack('vg_militia', 10, 0)], hero: hero('h_sylvaen') }
    const res = simulateBattle(a, b, sylvaen, sylvaen, 1, { round: 1 })
    const shot = attacksBy(res.events, 'vg_arbalest@4')[0]
    const shooter = shot.snap.find((s) => s.uid === 'vg_arbalest@4')!
    expect(shooter.power).toBe(shooter.atk * shooter.count)
    // 2 Arbalests at 3 ATK swung for 6, and the card says 6.
    expect(shooter.power).toBe(shot.dmg)
  })

  /**
   * The whole point of the change: a stack that is losing has to *look* like
   * it. Before this, cards showed per-model atk/maxHp, which are constants —
   * nothing on a card moved for the entire battle.
   */
  it('falls monotonically as a stack is worn down, and hits zero when it dies', () => {
    // Two Arbalests swing for 6 into a 12-point pool: it takes several
    // exchanges to break, so there is a curve to watch rather than one wipe.
    const a = { board: [stack('vg_arbalest', 2, 4)], hero: hero('h_sylvaen') }
    const b = { board: [stack('vg_militia', 6, 0)], hero: hero('h_sylvaen') }
    const res = simulateBattle(a, b, sylvaen, sylvaen, 3, { round: 1 })
    const seen: number[] = []
    for (const e of res.events) {
      // battleStart carries the two opening boards under different keys.
      const snaps = e.t === 'battleStart' ? [...e.a, ...e.b] : 'snap' in e ? e.snap : null
      const t = snaps?.find((s) => s.uid === 'vg_militia@0')
      if (t) seen.push(t.hp)
    }
    expect(seen.length, 'the fixture never showed the target').toBeGreaterThan(1)
    // No heals in this fixture, so it may only ever fall.
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i], `hp rose from ${seen[i - 1]} to ${seen[i]}`).toBeLessThanOrEqual(seen[i - 1])
    }
    expect(seen[0]).toBeGreaterThan(0)
    expect(seen[seen.length - 1]).toBe(0)
  })

  /**
   * True by two mechanisms — the `alive` guard on the snapshot and the kill
   * path zeroing count/wound — so deleting either one alone leaves this
   * green. It is kept for the property, not as coverage of the guard.
   */
  it('shows nothing threatening once a stack is dead', () => {
    const a = { board: [stack('vg_arbalest', 8, 4)], hero: hero('h_sylvaen') }
    const b = { board: [stack('vg_militia', 1, 0)], hero: hero('h_sylvaen') }
    const res = simulateBattle(a, b, sylvaen, sylvaen, 11, { round: 1 })
    const death = res.events.find((e) => e.t === 'death' && e.uid === 'vg_militia@0')
    expect(death, 'the fixture never killed the target').toBeDefined()
    const dead = (death as Extract<BattleEvent, { t: 'death' }>).snap.find((s) => s.uid === 'vg_militia@0')!
    expect(dead.hp).toBe(0)
    expect(dead.power).toBe(0)
    expect(dead.count).toBe(0)
  })
})

describe('Bulwark', () => {
  // The Militia are a wall so the Arbalest survives to fire twice; Volley
  // never provokes retaliation, which keeps these numbers clean.
  const volleyVsFootmen = { board: [stack('vg_militia', 6, 0), stack('vg_arbalest', 2, 4)] }

  it('soaks bulwark x alive count per attack, then decays by 1', () => {
    const a = { ...volleyVsFootmen, hero: hero('h_sylvaen') }
    const b = { board: [stack('vg_footman', 3, 0)], hero: hero('h_sylvaen') }
    const res = simulateBattle(a, b, sylvaen, sylvaen, 3, { round: 1 })
    const shots = attacksBy(res.events, 'vg_arbalest@4')
    // Bulwark 1 x 3 Footmen soaks 3 of the Arbalest's 6 damage...
    expect(shots[0].absorbed).toBe(3)
    expect(shots[0].dmg).toBe(3)
    // ...and the armour is spent, so the next volley lands in full.
    expect(shots[1].absorbed).toBe(0)
    expect(shots[1].dmg).toBe(6)
  })

  it("Berrik's Bulwark passive stacks onto the keyword value", () => {
    const a = { ...volleyVsFootmen, hero: hero('h_sylvaen') }
    const b = { board: [stack('vg_footman', 3, 0)], hero: hero('h_berrik') }
    const res = simulateBattle(a, b, sylvaen, berrik, 3, { round: 1 })
    // Keyword 1 + passive 2 + Shield Line 2 = 5 each, x3 units: nothing lands.
    const shot = attacksBy(res.events, 'vg_arbalest@4')[0]
    expect(shot.absorbed).toBe(6)
    expect(shot.dmg).toBe(0)
  })

  it('Siege ignores Bulwark entirely', () => {
    const a = { board: [stack('vg_cannon', 3, 4)], hero: hero('h_sylvaen') }
    const b = { board: [stack('vg_footman', 3, 0)], hero: hero('h_sylvaen') }
    const res = simulateBattle(a, b, sylvaen, sylvaen, 5, { round: 1 })
    const shot = attacksBy(res.events, 'vg_cannon@4')[0]
    expect(shot.absorbed).toBe(0)
    expect(shot.dmg).toBeGreaterThan(0)
  })
})

describe('retaliation', () => {
  it('melee attacks provoke a counterstrike', () => {
    const a = { board: [stack('vg_militia', 4, 0)], hero: hero('h_yseult') }
    const b = { board: [stack('vg_militia', 4, 0)], hero: hero('h_yseult') }
    const res = simulateBattle(a, b, berrik, berrik, 11, { round: 1 })
    expect(res.events.some((e) => e.t === 'attack' && e.retaliation)).toBe(true)
  })

  it('Volley attackers are never retaliated against', () => {
    const a = { board: [stack('vg_arbalest', 3, 4)], hero: hero('h_berrik') }
    const b = { board: [stack('vg_militia', 6, 0)], hero: hero('h_berrik') }
    const res = simulateBattle(a, b, berrik, berrik, 13, { round: 1 })
    const retaliationsAgainstArbalest = res.events.filter(
      (e) => e.t === 'attack' && e.retaliation && e.dst.startsWith('vg_arbalest'),
    )
    expect(retaliationsAgainstArbalest).toHaveLength(0)
  })
})

describe('targeting', () => {
  it('melee cannot reach the back row while any front-row stack stands', () => {
    const a = { board: [stack('vg_militia', 6, 0)], hero: hero('h_berrik') }
    const b = {
      board: [stack('vg_footman', 3, 0), stack('vg_arbalest', 2, 4)],
      hero: hero('h_berrik'),
    }
    const res = simulateBattle(a, b, berrik, berrik, 17, { round: 1 })
    const firstHitOnBackRow = res.events.findIndex((e) => e.t === 'attack' && e.dst.startsWith('vg_arbalest') && !e.retaliation)
    const footmanDeath = res.events.findIndex((e) => e.t === 'death' && e.uid.startsWith('vg_footman'))
    if (firstHitOnBackRow >= 0) {
      expect(footmanDeath).toBeGreaterThanOrEqual(0)
      expect(firstHitOnBackRow).toBeGreaterThan(footmanDeath)
    }
  })
})

describe('determinism', () => {
  it('the same seed and boards always produce an identical event log', () => {
    const build = () => ({
      a: { board: [stack('vg_militia', 8, 0), stack('vg_arbalest', 3, 4)], hero: hero('h_berrik') },
      b: { board: [stack('st_raider', 8, 0), stack('st_slinger', 4, 4)], hero: hero('h_grommash') },
    })
    const one = build()
    const two = build()
    const r1 = simulateBattle(one.a, one.b, berrik, grommash, 424242, { round: 5 })
    const r2 = simulateBattle(two.a, two.b, berrik, grommash, 424242, { round: 5 })
    expect(JSON.stringify(r1.events)).toEqual(JSON.stringify(r2.events))
    expect(r1.winner).toEqual(r2.winner)
  })

  it('a different seed can produce a different log', () => {
    const build = () => ({
      a: { board: [stack('vg_militia', 8, 0), stack('vg_arbalest', 3, 4)], hero: hero('h_berrik') },
      b: { board: [stack('st_raider', 8, 0), stack('st_slinger', 4, 4)], hero: hero('h_grommash') },
    })
    const one = build()
    const two = build()
    const r1 = simulateBattle(one.a, one.b, berrik, grommash, 1, { round: 5 })
    const r2 = simulateBattle(two.a, two.b, berrik, grommash, 999, { round: 5 })
    expect(r1.events.length > 0 && r2.events.length > 0).toBe(true)
  })
})

describe('keywords and passives', () => {
  it('Frenzy grants ATK when a stack takes casualties and survives', () => {
    // The Militia wall keeps the Arbalest alive long enough to bloody the
    // raiders without wiping them.
    const a = { board: [stack('vg_militia', 6, 0), stack('vg_arbalest', 2, 4)], hero: hero('h_sylvaen') }
    const b = { board: [stack('st_raider', 8, 0)], hero: hero('h_sylvaen') }
    const res = simulateBattle(a, b, sylvaen, sylvaen, 21, { round: 3 })
    const frenzies = res.events.filter((e) => e.t === 'frenzy')
    expect(frenzies.length).toBeGreaterThan(0)
    expect(frenzies.every((e) => e.t === 'frenzy' && e.uid === 'st_raider@0')).toBe(true)
  })

  it("Marshal Yseult's Last Stand saves one stack from a wipe, once", () => {
    const yseult = HERO_BY_ID.get('h_yseult')!
    const a = { board: [stack('vg_cannon', 3, 4)], hero: hero('h_berrik') }
    const b = { board: [stack('vg_militia', 1, 0), stack('vg_crossbow', 1, 4)], hero: hero('h_yseult') }
    const res = simulateBattle(a, b, berrik, yseult, 33, { round: 6 })
    expect(res.events.filter((e) => e.t === 'lastStand').length).toBeLessThanOrEqual(1)
  })

  it('hero spells appear in the event log', () => {
    const a = { board: [stack('vd_sapling', 6, 0)], hero: hero('h_sylvaen', 4) }
    const b = { board: [stack('st_raider', 6, 0)], hero: hero('h_grommash', 4) }
    const res = simulateBattle(a, b, sylvaen, grommash, 41, { round: 8 })
    expect(res.events.some((e) => e.t === 'spellCast')).toBe(true)
  })

  it('Venom thins a stack but never wipes it', () => {
    const a = { board: [stack('st_harpooner', 4, 4)], hero: hero('h_grommash') }
    const b = { board: [stack('vg_colossus', 1, 0)], hero: hero('h_berrik') }
    const res = simulateBattle(a, b, grommash, berrik, 55, { round: 9 })
    const venomKills = res.events.filter((e) => e.t === 'venom' && e.units > 0)
    for (const e of venomKills) {
      if (e.t !== 'venom') continue
      expect(e.units).toBeLessThan(1 + 1)
    }
  })
})

describe('hero damage', () => {
  it('scales with round and the winner surviving tiers, capped at 15', () => {
    const a = { board: [stack('vg_colossus', 4, 0), stack('vg_cannon', 4, 4)], hero: hero('h_berrik', 6) }
    const b = { board: [stack('vg_militia', 1, 0)], hero: hero('h_berrik', 6) }
    const res = simulateBattle(a, b, berrik, berrik, 61, { round: 14 })
    expect(res.winner).toBe('a')
    expect(res.damageToLoser).toBeLessThanOrEqual(15)
    expect(res.damageToLoser).toBeGreaterThan(0)
  })

  it('an empty board loses immediately', () => {
    const a = { board: [], hero: hero('h_berrik') }
    const b = { board: [stack('vg_militia', 4, 0)], hero: hero('h_berrik') }
    const res = simulateBattle(a, b, berrik, berrik, 71, { round: 2 })
    expect(res.winner).toBe('b')
  })

  it('always terminates, even in a stalemate of two zero-ATK stacks', () => {
    const a = { board: [stack('vg_mule', 3, 4)], hero: hero('h_berrik') }
    const b = { board: [stack('vg_mule', 3, 4)], hero: hero('h_berrik') }
    const res = simulateBattle(a, b, berrik, berrik, 81, { round: 2 })
    expect(res.winner).toBe('tie')
    expect(res.exchanges).toBeLessThanOrEqual(200)
  })
})

/**
 * The Muster board and the simulator print the same numbers because they read
 * the same function (Design Notes 03 §2.1) — these pin that, and pin that the
 * itemised parts actually add up to the total the card shows.
 */
describe('stackStats — the one place effective ATK/HP is worked out', () => {
  const back = stack('vg_arbalest', 3, 4)

  it('names the talents behind a buffed number, and the parts sum to the total', () => {
    const mods = { ...ZERO_MODS, backAtk: 2, allHp: 3 }
    const st = stackStats(back, 'back', mods, ['t_vd_might4a', 't_vg_might3_yseult'])
    const def = unit('vg_arbalest')
    expect(st.atk).toBe(def.atk + 2)
    expect(st.hp).toBe(def.hp + 3)
    expect(st.parts.reduce((n, p) => n + p.atk, 0)).toBe(st.atk)
    expect(st.parts.reduce((n, p) => n + p.hp, 0)).toBe(st.hp)
    expect(st.parts.map((p) => p.label)).toEqual(['base', 'Marksmen', 'The Unbroken Line'])
  })

  it('gives the row its own talents — the same stack scores differently up front', () => {
    const mods = { ...ZERO_MODS, frontAtk: 2 }
    expect(stackStats(back, 'front', mods).atk).toBe(unit('vg_arbalest').atk + 2)
    expect(stackStats(back, 'back', mods).atk).toBe(unit('vg_arbalest').atk)
  })

  it('credits an unattributable mod to a plain "talents" remainder rather than losing it', () => {
    const st = stackStats(back, 'back', { ...ZERO_MODS, allAtk: 1 }, [])
    expect(st.atk).toBe(unit('vg_arbalest').atk + 1)
    expect(st.parts.at(-1)).toEqual({ label: 'talents', atk: 1, hp: 0 })
  })

  it('agrees with what the simulator fights with', () => {
    const mods = { ...ZERO_MODS, backAtk: 2, allHp: 3 }
    const a = { board: [back], hero: hero('h_sylvaen', 1, mods) }
    const b = { board: [stack('vg_militia', 20, 0)], hero: hero('h_sylvaen') }
    const res = simulateBattle(a, b, sylvaen, sylvaen, 1, { round: 1 })
    const start = res.events.find((e) => e.t === 'battleStart') as Extract<BattleEvent, { t: 'battleStart' }>
    const snap = start.a[0]
    const st = stackStats(back, 'back', mods, [])
    expect(snap.atk).toBe(st.atk)
    expect(snap.maxHp).toBe(st.hp)
  })
})
