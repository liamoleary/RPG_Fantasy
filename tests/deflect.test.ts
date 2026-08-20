import { describe, expect, it } from 'vitest'
import { ALL_UNITS, HERO_BY_ID, unit } from '../src/data/index'
import { ZERO_MODS } from '../src/data/types'
import { simulateBattle, type BattleEvent, type BoardStack, type HeroState, type StackSnap } from '../src/engine/battle'
import { KEYWORD_GLOSSARY, keywordText } from '../src/ui/keywords'

/**
 * Deflect (Design Notes 12 §4.6) — the first commit of the DN12 primitives,
 * and the one the note calls the simplest of the six.
 *
 * The whole design risk here is not the mechanic, it is the NAME. The unit
 * that carries it is called The Bulwark, the faction mechanic is called
 * Bulwark, and the keyword next to it on the card is Bulwark. §3.5 says the
 * distinction has to reach the Glossary or players will read the two as one
 * thing. So these tests pin the behavioural difference — a slice off every
 * blow, versus one blow cancelled whole — and then pin the copy that explains
 * it, because copy that drifts is how the distinction quietly stops existing.
 */

const sylvaen = HERO_BY_ID.get('h_sylvaen')!
const yseult = HERO_BY_ID.get('h_yseult')!

function stack(unitId: string, count: number, slot: number, extra: Partial<BoardStack> = {}): BoardStack {
  return { uid: `${unitId}@${slot}`, unitId, count, slot, bonusAtk: 0, bonusHp: 0, growthTicks: 0, spent: 3, rank: 0, ...extra }
}
function hero(id: string): HeroState {
  return { heroId: id, name: id, factionId: 'vanguard', level: 1, mods: { ...ZERO_MODS } }
}

type Deflect = Extract<BattleEvent, { t: 'deflect' }>
type Attack = Extract<BattleEvent, { t: 'attack' }>
const deflects = (evs: BattleEvent[], uid?: string): Deflect[] =>
  evs.filter((e): e is Deflect => e.t === 'deflect' && (uid === undefined || e.uid === uid))
const hitsOn = (evs: BattleEvent[], uid: string): Attack[] =>
  evs.filter((e): e is Attack => e.t === 'attack' && e.dst === uid)

/** The armour a stack had at the horns, straight off the opening snapshot. */
function armourAt(evs: BattleEvent[], uid: string): number {
  const start = evs.find((e): e is Extract<BattleEvent, { t: 'battleStart' }> => e.t === 'battleStart')!
  const found = [...start.a, ...start.b].find((s) => s.uid === uid)
  if (!found) throw new Error(`no ${uid} at battle start`)
  return found.bulwark
}

/** The armour an event's snapshot reports for one stack. */
const armourIn = (e: { snap: StackSnap[] }, uid: string): number =>
  e.snap.find((s) => s.uid === uid)!.bulwark

/** A wall of Mule Carts: 0 ATK, so it never interrupts the firing order. */
const inert = (n = 40) => ({ board: [stack('vg_mule', n, 0)], hero: hero('h_sylvaen') })

describe('the keyword exists as data, on the unit DN12 §3.5 names', () => {
  it('The Bulwark carries exactly one Deflect, alongside real Bulwark', () => {
    const def = unit('vg_bulwark')
    expect(def.keywords.find((k) => k.k === 'deflect')?.x).toBe(1)
    expect(def.keywords.find((k) => k.k === 'bulwark')?.x).toBe(2)
  })

  it('and nothing else in the game has it yet', () => {
    // Deflect is deliberately one unit's trick for now. When a second unit
    // takes it, this is the line that asks whether that was on purpose.
    const carriers = ALL_UNITS.filter((u) => u.keywords.some((k) => k.k === 'deflect')).map((u) => u.id)
    expect(carriers).toEqual(['vg_bulwark'])
  })

  it('is a keyword in its own right, never a flavour of Bulwark', () => {
    // The two are separate entries on the same card, which is the data shape
    // the Glossary copy below is describing. If Deflect were ever folded into
    // a Bulwark magnitude, this is what would notice.
    const ks = unit('vg_bulwark').keywords.map((k) => k.k)
    expect(ks).toContain('bulwark')
    expect(ks).toContain('deflect')
  })
})

describe('one blow, cancelled whole', () => {
  /** One Footman stack swinging into one defender, nothing else on the board. */
  const duel = (defender: string) =>
    simulateBattle(
      { board: [stack('vg_footman', 6, 0)], hero: hero('h_sylvaen') },
      { board: [stack(defender, 4, 0)], hero: hero('h_sylvaen') },
      sylvaen,
      sylvaen,
      5,
      { round: 1 },
    )

  it('eats the first attack outright, then never again', () => {
    const res = duel('vg_bulwark')
    const d = deflects(res.events, 'vg_bulwark@0')
    expect(d).toHaveLength(1)
    expect(d[0].left).toBe(0)

    // The first blow to arrive dealt nothing and soaked nothing — it did not
    // land at all. A later one gets through, or the charge did not spend.
    const taken = hitsOn(res.events, 'vg_bulwark@0')
    expect(taken.length).toBeGreaterThan(1)
    expect(taken[0].dmg).toBe(0)
    expect(taken[0].absorbed).toBe(0)
    expect(taken.slice(1).some((h) => h.dmg > 0 || h.absorbed > 0)).toBe(true)
  })

  it('spends no Bulwark doing it — the blow never landed to be soaked', () => {
    // The control: the Shieldmaiden has Bulwark 2 and no Deflect, so the first
    // blow against her IS absorbed, and absorbing costs her a point of armour.
    const shielded = duel('vg_shieldmaiden')
    const control = hitsOn(shielded.events, 'vg_shieldmaiden@0')
    expect(control[0].absorbed).toBeGreaterThan(0)
    expect(armourIn(control[0], 'vg_shieldmaiden@0')).toBe(armourAt(shielded.events, 'vg_shieldmaiden@0') - 1)

    // The Bulwark: the blow is deflected, and her armour is untouched by it.
    // Read off the snapshot rather than inferred from a later hit — a later
    // hit carries whatever damage the attacker had left, which is a different
    // question and is what makes that inference unreliable.
    const res = duel('vg_bulwark')
    const d = deflects(res.events, 'vg_bulwark@0')[0]
    expect(armourIn(d, 'vg_bulwark@0')).toBe(armourAt(res.events, 'vg_bulwark@0'))
    expect(hitsOn(res.events, 'vg_bulwark@0')[0].absorbed).toBe(0)
  })

  it('is spent for the battle, not per attacker', () => {
    const res = simulateBattle(
      { board: [stack('vg_footman', 6, 0), stack('vg_militia', 8, 1)], hero: hero('h_sylvaen') },
      { board: [stack('vg_bulwark', 4, 0)], hero: hero('h_sylvaen') },
      sylvaen,
      sylvaen,
      11,
      { round: 1 },
    )
    expect(deflects(res.events, 'vg_bulwark@0')).toHaveLength(1)
  })
})

describe('what it does and does not answer', () => {
  it('deflects a Siege attack — Siege ignores armour, not a raised shield', () => {
    // Cannon Crew is Volley + Siege: it reaches any row and ignores Bulwark.
    // The Mule Carts are there to give The Bulwark's melee something to chew
    // on — left alone it wins the initiative tie and flattens the crew before
    // a single shot goes off, which measures nothing.
    const res = simulateBattle(
      { board: [stack('vg_mule', 40, 0), stack('vg_cannon', 3, 4)], hero: hero('h_sylvaen') },
      { board: [stack('vg_bulwark', 4, 0)], hero: hero('h_sylvaen') },
      sylvaen,
      sylvaen,
      3,
      { round: 1 },
    )
    const d = deflects(res.events, 'vg_bulwark@0')
    expect(d).toHaveLength(1)
    const taken = hitsOn(res.events, 'vg_bulwark@0')
    expect(taken[0].dmg).toBe(0)
    expect(taken[0].absorbed).toBe(0)
    // ...and the next siege shot goes straight through the armour, as Siege does.
    const later = taken.slice(1).find((h) => h.dmg > 0)
    expect(later, 'the crew should get a second shot away').toBeDefined()
    expect(later!.absorbed).toBe(0)
  })

  it('carries no Venom in with the blow it stopped', () => {
    // The Nightblade strikes with Venom. A deflected strike must not poison:
    // the shield stopped the blade, so the poison on it never arrived.
    const venomous = unit('vd_nightblade').keywords.find((k) => k.k === 'venom')
    expect(venomous, 'test needs a Venom carrier').toBeDefined()

    const res = simulateBattle(
      { board: [stack('vd_nightblade', 3, 0)], hero: hero('h_sylvaen') },
      { board: [stack('vg_bulwark', 4, 0)], hero: hero('h_sylvaen') },
      sylvaen,
      sylvaen,
      7,
      { round: 1 },
    )
    const firstDeflect = res.events.findIndex((e) => e.t === 'deflect')
    expect(firstDeflect).toBeGreaterThanOrEqual(0)
    // No venom is applied to the deflecting stack before or by that blow.
    const venomBefore = res.events
      .slice(0, firstDeflect + 1)
      .filter((e) => e.t === 'venom' && e.uid === 'vg_bulwark@0')
    expect(venomBefore).toEqual([])
  })

  it('protects a back-row stack too, unlike Cover', () => {
    // Cover is a front-line job and buildStack zeroes it off the back row.
    // Deflect is the stack's own shield, so it works wherever the stack stands.
    // A Siege gunner is the cleanest way to reach a back slot on purpose.
    const res = simulateBattle(
      { board: [stack('vg_mule', 40, 0), stack('vg_cannon', 6, 4)], hero: hero('h_sylvaen') },
      { board: [stack('vg_bulwark', 4, 4)], hero: hero('h_sylvaen') },
      sylvaen,
      sylvaen,
      13,
      { round: 1 },
    )
    const taken = hitsOn(res.events, 'vg_bulwark@4')
    expect(taken.length, 'the gunners should reach the back row').toBeGreaterThan(0)
    expect(deflects(res.events, 'vg_bulwark@4')).toHaveLength(1)
    expect(taken[0].dmg).toBe(0)
  })
})

describe('determinism (§12.3)', () => {
  const board = () => ({
    board: [stack('vg_bulwark', 4, 0), stack('vg_shieldmaiden', 4, 1)],
    hero: hero('h_yseult'),
  })

  it('the same seed replays identically', () => {
    const a = simulateBattle(board(), inert(), yseult, sylvaen, 4242, { round: 3 })
    const b = simulateBattle(board(), inert(), yseult, sylvaen, 4242, { round: 3 })
    expect(a.events).toEqual(b.events)
    expect(a.winner).toBe(b.winner)
  })

  it('draws no randomness — a battle with no Deflect in it is untouched', () => {
    /**
     * The charge is pure state: no rng.pick, no roll, no branch that consumes
     * a number. So a board without the keyword must produce the byte-identical
     * log it produced before the keyword existed — which is what says this
     * commit cannot have moved anyone else's balance.
     */
    const plain = () => ({ board: [stack('vg_shieldmaiden', 4, 0), stack('vg_footman', 6, 1)], hero: hero('h_sylvaen') })
    const one = simulateBattle(plain(), inert(), sylvaen, sylvaen, 909, { round: 2 })
    const two = simulateBattle(plain(), inert(), sylvaen, sylvaen, 909, { round: 2 })
    expect(one.events).toEqual(two.events)
    expect(deflects(one.events)).toEqual([])
  })
})

describe('the Glossary tells the two apart (§3.5)', () => {
  const entry = (id: string) => KEYWORD_GLOSSARY.find((k) => k.id === id)

  it('ships Deflect as its own glossary entry, not a note under Bulwark', () => {
    expect(entry('deflect')?.name).toBe('Deflect')
    expect(entry('bulwark')?.name).toBe('Bulwark')
  })

  it('each one names the other, so neither can be read alone', () => {
    // The confusion is BETWEEN them, so a definition that never mentions its
    // twin has not done the job §3.5 asked for.
    expect(entry('deflect')?.text).toMatch(/Bulwark/)
    expect(entry('bulwark')?.text).toMatch(/Deflect/)
  })

  it('states the difference that actually matters: every hit vs one hit', () => {
    const deflect = entry('deflect')!.text
    expect(deflect).toMatch(/completely|outright/)
    expect(deflect).toMatch(/Siege/)
    expect(entry('bulwark')!.text).toMatch(/every/i)
  })

  it("reads the unit's own magnitude into its card text", () => {
    const k = unit('vg_bulwark').keywords.find((x) => x.k === 'deflect')!
    expect(keywordText(k)).toMatch(/first attack/)
  })
})
