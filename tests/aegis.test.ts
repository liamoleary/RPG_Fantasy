import { describe, expect, it } from 'vitest'
import { ALL_UNITS, HERO_BY_ID, unit } from '../src/data/index'
import { ZERO_MODS } from '../src/data/types'
import { simulateBattle, type BattleEvent, type BoardStack, type HeroState } from '../src/engine/battle'
import { KEYWORD_GLOSSARY } from '../src/ui/keywords'

/**
 * The Shieldmaiden fork (Design Notes 12 §3.4) — two women with the same
 * shield who disagree about what a shield is for.
 *
 *   Aegis of Light   §4.3  gathers light, hands the next blow back
 *   Aegis Warden     §4.4  throws it, and it ricochets through the line
 *
 * §3.4 flags the Warden as the balance risk in this note: "total damage across
 * a full board is enormous, so the decay and the base number are the whole
 * balance job". §6 fixes the decay at x0.75 and the passes at 2, which leaves
 * ATK as the only lever — so the arithmetic of the arc is pinned here in full,
 * not sampled.
 */

const sylvaen = HERO_BY_ID.get('h_sylvaen')!

function stack(unitId: string, count: number, slot: number, extra: Partial<BoardStack> = {}): BoardStack {
  return { uid: `${unitId}@${slot}`, unitId, count, slot, bonusAtk: 0, bonusHp: 0, growthTicks: 0, spent: 3, rank: 0, ...extra }
}
function hero(id: string): HeroState {
  return { heroId: id, name: id, factionId: 'vanguard', level: 1, mods: { ...ZERO_MODS } }
}

type Bounce = Extract<BattleEvent, { t: 'bounce' }>
type Reflect = Extract<BattleEvent, { t: 'reflect' }>
type Attack = Extract<BattleEvent, { t: 'attack' }>
const bounces = (evs: BattleEvent[]): Bounce[] => evs.filter((e): e is Bounce => e.t === 'bounce')
const reflects = (evs: BattleEvent[]): Reflect[] => evs.filter((e): e is Reflect => e.t === 'reflect')
const attacks = (evs: BattleEvent[]): Attack[] => evs.filter((e): e is Attack => e.t === 'attack')

/** A full seven-slot enemy board of inert Mule Carts: 0 ATK, huge pools. */
const fullBoard = (n = 60) => ({
  board: [0, 1, 2, 3, 4, 5, 6].map((slot) => stack('vg_mule', n, slot)),
  hero: hero('h_sylvaen'),
})

describe('both forms are data, at the tier §6 decided', () => {
  it('are the two leaves of the Shieldmaiden fork, both T4', () => {
    expect(unit('vg_shieldmaiden').linePaths).toEqual(['vg_aegis', 'vg_aegiswarden'])
    expect(unit('vg_aegis').tier).toBe(4)
    expect(unit('vg_aegiswarden').tier).toBe(4)
  })

  it('carry the two new primitives and nothing else does', () => {
    expect(unit('vg_aegis').keywords.find((k) => k.k === 'reflect')?.x).toBe(3)
    // The shape, not the tuning: §6 fixed 2 passes, and §7.10's balance pass
    // moved the decay. Pinning the tuned number here would make every future
    // tune look like a broken mechanic.
    const bounce = unit('vg_aegiswarden').ability!.effect
    expect(bounce.type).toBe('bounceAttack')
    expect((bounce as { passes: number }).passes).toBe(2)
    expect((bounce as { frac: number }).frac).toBeGreaterThan(0)
    expect((bounce as { frac: number }).frac).toBeLessThan(1)

    const reflectors = ALL_UNITS.filter((u) => u.keywords.some((k) => k.k === 'reflect')).map((u) => u.id)
    const throwers = ALL_UNITS.filter((u) => u.ability?.effect.type === 'bounceAttack').map((u) => u.id)
    expect(reflectors).toEqual(['vg_aegis'])
    expect(throwers).toEqual(['vg_aegiswarden'])
  })

  it('neither carries an Apex — DN04 §3 keeps meters to the six', () => {
    expect(unit('vg_aegis').apex).toBeUndefined()
    expect(unit('vg_aegiswarden').apex).toBeUndefined()
  })
})

describe('the thrown shield across a full board (§4.4)', () => {
  /**
   * One Warden against seven stacks with no ATK and pools too deep to break,
   * so the arc runs its whole natural length uninterrupted. This is the case
   * §3.4 calls "enormous" and asks to be measured rather than guessed at.
   */
  const ONE_SWING = (count: number) => unit('vg_aegiswarden').atk * count
  /**
   * Read from the data, never hard-coded. A balance pass moves `frac` and
   * `passes` — DN12 §7.10 moved the decay once already — and a test that pins
   * the tuned NUMBER fails on every future tune while proving nothing about
   * the mechanism. What is worth pinning is the shape: geometric, floored,
   * slot order, wrapping, and a ceiling set by the decay.
   */
  const BOUNCE = unit('vg_aegiswarden').ability!.effect as { frac: number; passes: number }

  /** The first throw only: hop 0 is the ordinary blow, then its ricochets. */
  function firstArc(count: number): { hop: number; dst: string; dealt: number }[] {
    const res = simulateBattle(
      { board: [stack('vg_aegiswarden', count, 0)], hero: hero('h_sylvaen') },
      fullBoard(400),
      sylvaen,
      sylvaen,
      5,
      { round: 6 },
    )
    const out: { hop: number; dst: string; dealt: number }[] = []
    let started = false
    for (const e of res.events) {
      if (e.t === 'attack' && e.src === 'vg_aegiswarden@0' && !e.retaliation) {
        if (started) break
        started = true
        out.push({ hop: 0, dst: e.dst, dealt: e.dmg + e.absorbed })
      } else if (e.t === 'bounce' && started) {
        out.push({ hop: e.hop, dst: e.dst, dealt: e.dmg + e.absorbed })
      }
    }
    return out
  }

  it('decays geometrically a hop, floored, from the swing that threw it', () => {
    const arc = firstArc(12)
    const raw = ONE_SWING(12)
    expect(arc[0].dealt).toBe(raw)
    for (const h of arc) {
      expect(h.dealt, `hop ${h.hop}`).toBe(Math.floor(raw * Math.pow(BOUNCE.frac, h.hop)))
    }
    // Strictly non-increasing, and every hop a real hit: the tail is dropped
    // rather than logged as a row of zeroes.
    for (let i = 1; i < arc.length; i++) expect(arc[i].dealt).toBeLessThanOrEqual(arc[i - 1].dealt)
    expect(arc[arc.length - 1].dealt).toBeGreaterThan(0)
  })

  it('runs the line in slot order, wrapping, from wherever the throw landed', () => {
    const arc = firstArc(4)
    const openedOn = Number(arc[0].dst.split('@')[1])
    arc.forEach((h, i) => {
      expect(h.dst, `hop ${h.hop}`).toBe(`vg_mule@${(openedOn + i) % 7}`)
    })
  })

  it('stops when the decay reaches zero — two passes is a CAP, not a promise', () => {
    /**
     * The most useful thing these numbers say, and it survives retuning: the
     * loop is ALLOWED `passes` circuits, and the arithmetic usually stops it
     * first, because a floored geometric decay reaches zero. A small stack's
     * shield never finishes its second lap; a big one's does.
     */
    const hops = 7 * BOUNCE.passes
    const hitTwice = (arc: { dst: string }[]) => {
      const n = new Map<string, number>()
      for (const h of arc) n.set(h.dst, (n.get(h.dst) ?? 0) + 1)
      return [...n.values()].filter((c) => c === 2).length
    }

    const small = firstArc(4)
    expect(small.length).toBeLessThan(hops)
    expect(hitTwice(small)).toBeLessThan(7)
    expect(small[small.length - 1].dealt).toBeGreaterThan(0)

    // Big enough that the last hop still floors above zero, and both passes
    // complete: every stack on the board struck exactly twice.
    const need = Math.ceil(1 / Math.pow(BOUNCE.frac, hops - 1) / unit('vg_aegiswarden').atk)
    const big = firstArc(need)
    expect(big.length).toBe(hops)
    expect(hitTwice(big)).toBe(7)
  })

  it('cannot run away — the arc is capped by its own decay', () => {
    /**
     * The ceiling is the geometric series, 1 / (1 - frac), and flooring every
     * hop keeps the real total under it. So the arc is large in absolute terms
     * on a full board but bounded: ATK moves the total linearly and never
     * compounds it. That bound is what makes ATK a safe balance lever, and it
     * holds at whatever the decay is tuned to.
     */
    const ceiling = 1 / (1 - BOUNCE.frac)
    for (const count of [8, 14, 24]) {
      const arc = firstArc(count)
      const ratio = arc.reduce((n, h) => n + h.dealt, 0) / ONE_SWING(count)
      expect(ratio, `${count} units`).toBeLessThan(ceiling)
      expect(ratio, `${count} units`).toBeGreaterThan(ceiling * 0.8)
    }
  })

  it('spends no randomness of its own — the same ladder on every seed', () => {
    /**
     * The first target is chosen by the ordinary attack that precedes the
     * throw, exactly as any other stack picks one. Everything after it is
     * arithmetic, so with the target fixed the whole arc is fixed.
     */
    const shapes = new Set<string>()
    for (const seed of [1, 12345, 99991, 4242, 7]) {
      const res = simulateBattle(
        { board: [stack('vg_aegiswarden', 4, 0)], hero: hero('h_sylvaen') },
        fullBoard(400),
        sylvaen,
        sylvaen,
        seed,
        { round: 6 },
      )
      const arc = bounces(res.events).filter((e) => e.src === 'vg_aegiswarden@0').slice(0, 9)
      shapes.add(arc.map((b) => `${b.hop}:${b.dmg + b.absorbed}`).join('|'))
    }
    expect(shapes.size).toBe(1)
  })

  it('keeps its place in the arc when a stack dies part-way through', () => {
    // §3.4: "skipping nothing". The line is frozen at throw time, so a stack
    // that falls does not pull the rest of the sequence forward — the hop that
    // would have hit it is simply spent.
    const res = simulateBattle(
      { board: [stack('vg_aegiswarden', 24, 0)], hero: hero('h_sylvaen') },
      { board: [0, 1, 2, 3, 4, 5, 6].map((slot) => stack('vg_mule', 1, slot)), hero: hero('h_sylvaen') },
      sylvaen,
      sylvaen,
      5,
      { round: 6 },
    )
    const arc = bounces(res.events).filter((e) => e.src === 'vg_aegiswarden@0')
    expect(arc.length).toBeGreaterThan(0)
    // Hop numbers stay contiguous from 1 — nothing is skipped or re-aimed.
    const firstRun = arc.slice(0, arc.findIndex((b, i) => i > 0 && b.hop === 1) === -1 ? arc.length : arc.findIndex((b, i) => i > 0 && b.hop === 1))
    firstRun.forEach((b, i) => expect(b.hop).toBe(i + 1))
    // Some hops land on stacks already wiped and are spent for nothing.
    expect(firstRun.some((b) => b.dmg === 0 && b.absorbed === 0)).toBe(true)
  })
})

describe('the charged shield (§4.3)', () => {
  /**
   * The Mule Cart is a wall the Aegis cannot chew through quickly, so the
   * battle lasts long enough for a 3-charge meter to fill. Against a lone
   * Footman she wins in three exchanges and the shield never lights at all —
   * which is itself worth knowing: Reflect 3 is a long-battle ability.
   */
  const attacker = () => ({
    board: [stack('vg_mule', 200, 0), stack('vg_footman', 8, 1)],
    hero: hero('h_sylvaen'),
  })

  it('starts empty, fills as she acts, and fires at full', () => {
    const res = simulateBattle(
      { board: [stack('vg_aegis', 5, 0)], hero: hero('h_sylvaen') },
      attacker(),
      sylvaen,
      sylvaen,
      11,
      { round: 6 },
    )
    const start = res.events.find((e): e is Extract<BattleEvent, { t: 'battleStart' }> => e.t === 'battleStart')!
    const me = start.a.find((s) => s.uid === 'vg_aegis@0')!
    expect(me.reflectMax).toBe(3)
    expect(me.reflectCharge).toBe(0)

    expect(reflects(res.events).length).toBeGreaterThan(0)
  })

  it('sends the whole blow back and takes nothing', () => {
    const res = simulateBattle(
      { board: [stack('vg_aegis', 5, 0)], hero: hero('h_sylvaen') },
      attacker(),
      sylvaen,
      sylvaen,
      11,
      { round: 6 },
    )
    const r = reflects(res.events)[0]
    expect(r.uid).toBe('vg_aegis@0')
    expect(r.dst).toBe('vg_footman@1')
    // The reflected blow is what the attacker threw, not a fraction of it.
    expect(r.dmg + r.absorbed).toBeGreaterThan(0)
    // And no attack event lands on her in the same breath: the blow never hit.
    const at = res.events.indexOf(r)
    const landed = attacks(res.events.slice(at - 1, at + 1)).filter((e) => e.dst === 'vg_aegis@0')
    expect(landed).toEqual([])
  })

  it('empties the meter, so it is a rhythm and not a wall', () => {
    const res = simulateBattle(
      { board: [stack('vg_aegis', 5, 0)], hero: hero('h_sylvaen') },
      attacker(),
      sylvaen,
      sylvaen,
      11,
      { round: 6 },
    )
    const r = reflects(res.events)[0]
    const after = r.snap.find((s) => s.uid === 'vg_aegis@0')!
    expect(after.reflectCharge).toBe(0)
    // Blows do land on her between reflects — she is not immune.
    const landed = attacks(res.events).filter((e) => e.dst === 'vg_aegis@0' && e.dmg + e.absorbed > 0)
    expect(landed.length).toBeGreaterThan(0)
  })

  it('carries the meter in the snapshot for the card to draw (§3.4)', () => {
    // The ring on the card reads this and nothing else, so the display can
    // never disagree with the simulation.
    const res = simulateBattle(
      { board: [stack('vg_aegis', 5, 0)], hero: hero('h_sylvaen') },
      attacker(),
      sylvaen,
      sylvaen,
      11,
      { round: 6 },
    )
    const seen = new Set<number>()
    for (const e of res.events) {
      if (!('snap' in e)) continue
      for (const s of e.snap) if (s.uid === 'vg_aegis@0') seen.add(s.reflectCharge)
    }
    // The meter is observed at more than one value — it visibly fills.
    expect(seen.size).toBeGreaterThan(1)
    for (const v of seen) expect(v).toBeLessThanOrEqual(3)
  })

  it('leaves stacks without the keyword reporting an empty meter', () => {
    const res = simulateBattle(
      { board: [stack('vg_footman', 6, 0)], hero: hero('h_sylvaen') },
      attacker(),
      sylvaen,
      sylvaen,
      3,
      { round: 2 },
    )
    const start = res.events.find((e): e is Extract<BattleEvent, { t: 'battleStart' }> => e.t === 'battleStart')!
    for (const s of [...start.a, ...start.b]) {
      expect(s.reflectMax).toBe(0)
      expect(s.reflectCharge).toBe(0)
    }
    expect(reflects(res.events)).toEqual([])
  })
})

describe('determinism (§12.3)', () => {
  it('the same seed replays identically for both forms', () => {
    const board = () => ({
      board: [stack('vg_aegis', 4, 0), stack('vg_aegiswarden', 4, 1)],
      hero: hero('h_sylvaen'),
    })
    const foe = () => ({
      board: [stack('vg_footman', 8, 0), stack('vg_militia', 12, 1), stack('vg_crossbow', 6, 4)],
      hero: hero('h_sylvaen'),
    })
    const a = simulateBattle(board(), foe(), sylvaen, sylvaen, 5150, { round: 7 })
    const b = simulateBattle(board(), foe(), sylvaen, sylvaen, 5150, { round: 7 })
    expect(a.events).toEqual(b.events)
    expect(a.winner).toBe(b.winner)
  })
})

describe('the Glossary tells Reflect from Deflect', () => {
  const entry = (id: string) => KEYWORD_GLOSSARY.find((k) => k.id === id)

  it('ships Reflect as its own entry that names Deflect', () => {
    // Third instance of the same discipline: the confusion is between the two,
    // so a definition that never mentions its twin has not done the job.
    expect(entry('reflect')?.name).toBe('Reflect')
    expect(entry('reflect')?.text).toMatch(/Deflect/)
  })

  it('states the difference: the blow travels back rather than stopping', () => {
    const text = entry('reflect')!.text
    expect(text).toMatch(/back at whoever threw it/)
    expect(text).toMatch(/does not walk away/)
  })
})
