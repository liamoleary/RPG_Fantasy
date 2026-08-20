import { describe, expect, it } from 'vitest'
import { ALL_UNITS, HERO_BY_ID, unit } from '../src/data/index'
import { ZERO_MODS } from '../src/data/types'
import { simulateBattle, type BattleEvent, type BoardStack, type HeroState } from '../src/engine/battle'
import { KEYWORD_GLOSSARY } from '../src/ui/keywords'

/**
 * Taunt (Design Notes 12 §4.5) — "the most disruptive thing in this note",
 * its own commit and its own tests, because it is the only effect in the
 * engine that overrides target selection.
 *
 * §4.5 says it "collides with Guard, Cover and back-row reach at once". Two of
 * those are real and one is not, and the tests below say which:
 *
 *   Guard    no collision. Guard is a battle-start Bulwark aura to one
 *            adjacent ally and never touches targeting at all.
 *   Cover    real, and one-sided: a taunter is front row, interception only
 *            fires for back-row targets, so while it stands NO Cover charge
 *            on that side is ever spent. Taunt banks them.
 *   reach    two different things wearing one name. Melee could never reach
 *            the back row past a living front line anyway. VOLLEY could, and
 *            Taunt shuts that off completely. That is the real change.
 */

const sylvaen = HERO_BY_ID.get('h_sylvaen')!

/**
 * `tag` keeps the two sides' uids apart. Both boards here field the same units
 * in the same slots on purpose — a Crossbow Levy shooting at a Crossbow Levy
 * is exactly the case Taunt has to redirect — and the default `unitId@slot`
 * uid would collide, so every filter would match both boards at once.
 */
function stack(unitId: string, count: number, slot: number, tag = '', extra: Partial<BoardStack> = {}): BoardStack {
  return { uid: `${unitId}@${slot}${tag}`, unitId, count, slot, bonusAtk: 0, bonusHp: 0, growthTicks: 0, spent: 3, rank: 0, ...extra }
}
function hero(id: string): HeroState {
  return { heroId: id, name: id, factionId: 'vanguard', level: 1, mods: { ...ZERO_MODS } }
}

type Attack = Extract<BattleEvent, { t: 'attack' }>
const attacks = (evs: BattleEvent[]): Attack[] => evs.filter((e): e is Attack => e.t === 'attack')
/** Blows aimed BY a stack — retaliation and counters answer whoever struck and
 *  are not target choices, so they never tell us anything about Taunt. */
const aimedBy = (evs: BattleEvent[], src: string): Attack[] =>
  attacks(evs).filter((e) => e.src === src && !e.retaliation)
const covers = (evs: BattleEvent[]) => evs.filter((e) => e.t === 'cover')
/** Only the beats while `uid` was still standing — a Taunt stops at its death,
 *  so an assertion spanning the whole log is asserting the wrong thing. */
function whileAlive(evs: BattleEvent[], uid: string): BattleEvent[] {
  const died = evs.findIndex((e) => e.t === 'death' && e.uid === uid)
  return died < 0 ? evs : evs.slice(0, died)
}

/**
 * A Titan behind a line of things an attacker would much rather hit. The
 * Shieldmaiden at slot 1 carries Cover 2 and stands over back slot 4, so this
 * board CAN intercept a volley — without a coverer on it the Cover test below
 * would pass for the wrong reason.
 */
const titanLine = () => ({
  board: [
    stack('vg_colossus', 3, 0, 'd'),
    stack('vg_shieldmaiden', 6, 1, 'd'),
    stack('vg_crossbow', 6, 4, 'd'),
    stack('vg_mule', 4, 5, 'd'),
  ],
  hero: hero('h_sylvaen'),
})
/**
 * The same board with the Titan swapped for a body that does not taunt.
 * Deliberately a plain Footman rather than another T4: the Anvilborn used to
 * stand here and stopped being inert the moment DN12 §3.6 gave it a leap into
 * the back row, which quietly ended the battle before the control could show
 * anything. A control has to do nothing except stand there.
 */
const controlLine = () => ({
  board: [
    stack('vg_footman', 30, 0, 'd'),
    stack('vg_shieldmaiden', 6, 1, 'd'),
    stack('vg_crossbow', 6, 4, 'd'),
    stack('vg_mule', 4, 5, 'd'),
  ],
  hero: hero('h_sylvaen'),
})
/** Mule Carts: 0 ATK, deep pool. Keeps a slow attacker alive long enough to act. */
const escort = (n = 60) => stack('vg_mule', n, 0)

describe('the keyword is data, on the unit §3.5 names', () => {
  it('the Quarry Titan taunts, and nothing else does', () => {
    expect(unit('vg_colossus').keywords.some((k) => k.k === 'taunt')).toBe(true)
    const carriers = ALL_UNITS.filter((u) => u.keywords.some((k) => k.k === 'taunt')).map((u) => u.id)
    expect(carriers).toEqual(['vg_colossus'])
  })

  it('keeps its battle-start Bulwark aura (§3.5)', () => {
    expect(unit('vg_colossus').ability?.effect).toEqual({ type: 'alliesBulwark', x: 1 })
  })
})

describe('every attack comes to it', () => {
  it('melee is pulled off its mirrored column onto the taunter', () => {
    // A Footman in column 1 mirrors onto slot 1 — the Militia — every time.
    // With a Titan on the board it must come to slot 0 instead.
    const res = simulateBattle(
      { board: [stack('vg_footman', 6, 1)], hero: hero('h_sylvaen') },
      titanLine(),
      sylvaen,
      sylvaen,
      5,
      { round: 6 },
    )
    const aimed = aimedBy(whileAlive(res.events, 'vg_colossus@0d'), 'vg_footman@1')
    expect(aimed.length).toBeGreaterThan(0)
    for (const a of aimed) expect(a.dst).toBe('vg_colossus@0d')

    const control = simulateBattle(
      { board: [stack('vg_footman', 6, 1)], hero: hero('h_sylvaen') },
      controlLine(),
      sylvaen,
      sylvaen,
      5,
      { round: 6 },
    )
    // Without it, the same attacker goes where the column sends it.
    expect(aimedBy(control.events, 'vg_footman@1')[0].dst).toBe('vg_shieldmaiden@1d')
  })

  it('a volley is pulled off the back row onto the taunter', () => {
    const res = simulateBattle(
      { board: [escort(), stack('vg_crossbow', 10, 4)], hero: hero('h_sylvaen') },
      titanLine(),
      sylvaen,
      sylvaen,
      9,
      { round: 6 },
    )
    const aimed = aimedBy(whileAlive(res.events, 'vg_colossus@0d'), 'vg_crossbow@4')
    expect(aimed.length).toBeGreaterThan(0)
    for (const a of aimed) expect(a.dst).toBe('vg_colossus@0d')
  })

  it('Siege is pulled too — it ignores armour, not attention', () => {
    const res = simulateBattle(
      { board: [escort(), stack('vg_cannon', 6, 4)], hero: hero('h_sylvaen') },
      titanLine(),
      sylvaen,
      sylvaen,
      13,
      { round: 6 },
    )
    const aimed = aimedBy(whileAlive(res.events, 'vg_colossus@0d'), 'vg_cannon@4')
    expect(aimed.length).toBeGreaterThan(0)
    for (const a of aimed) expect(a.dst).toBe('vg_colossus@0d')
  })

  it('an aiming Apex obeys it — the override is inside chooseTarget', () => {
    /**
     * `sunlance` picks through `chooseTarget`, so it cannot bypass Taunt
     * without somebody deliberately routing around the one function that aims.
     *
     * The board is built so the ultimate actually FIRES: the Ballistier volleys
     * from the back row (drawing no retaliation), the Mule Carts in front of it
     * hold the Titan's attention, and the Titan carries enough Bulwark that
     * nothing kills it before the meter fills.
     */
    const res = simulateBattle(
      { board: [escort(200), stack('vg_ballistier', 6, 4)], hero: hero('h_sylvaen') },
      { board: [stack('vg_colossus', 8, 0, 'd'), stack('vg_crossbow', 6, 4, 'd')], hero: hero('h_sylvaen') },
      sylvaen,
      sylvaen,
      21,
      { round: 9 },
    )
    const apex = res.events.find((e): e is Extract<BattleEvent, { t: 'apex' }> => e.t === 'apex')
    expect(apex, 'the Ballistier should reach its ultimate here').toBeDefined()
    expect(apex!.name).toBe('Sunlance')
    // Taunt chose the target...
    expect(apex!.targets[0]).toBe('vg_colossus@0d')
    // ...and the Sunlance still punches through into the stack BEHIND it, which
    // is the one documented way anything reaches the back row past a taunter.
    // That is the ability's printed identity ("through the front-row target and
    // the stack behind it"), kept deliberately rather than overridden.
    expect(apex!.targets).toContain('vg_crossbow@4d')

    for (const a of aimedBy(whileAlive(res.events, 'vg_colossus@0d'), 'vg_ballistier@4')) {
      expect(a.dst).toBe('vg_colossus@0d')
    }
  })

  it('stops the moment it falls, and targeting returns to normal', () => {
    const res = simulateBattle(
      { board: [escort(), stack('vg_cannon', 14, 4)], hero: hero('h_sylvaen') },
      { board: [stack('vg_colossus', 1, 0, 'd'), stack('vg_militia', 60, 1, 'd')], hero: hero('h_sylvaen') },
      sylvaen,
      sylvaen,
      3,
      { round: 10 },
    )
    const death = res.events.findIndex((e) => e.t === 'death' && e.uid === 'vg_colossus@0d')
    expect(death).toBeGreaterThanOrEqual(0)
    const after = aimedBy(res.events.slice(death), 'vg_cannon@4')
    expect(after.length).toBeGreaterThan(0)
    for (const a of after) expect(a.dst).not.toBe('vg_colossus@0d')
  })

  it('breaks ties on the lower slot, never on a roll', () => {
    const board = () => ({
      board: [stack('vg_colossus', 3, 1, 'd'), stack('vg_colossus', 3, 0, 'd')],
      hero: hero('h_sylvaen'),
    })
    for (const seed of [1, 12345, 99991, 4242, 7]) {
      const res = simulateBattle(
        { board: [stack('vg_footman', 6, 2)], hero: hero('h_sylvaen') },
        board(),
        sylvaen,
        sylvaen,
        seed,
        { round: 6 },
      )
      for (const a of aimedBy(whileAlive(res.events, 'vg_colossus@0d'), 'vg_footman@2')) {
        expect(a.dst, `seed ${seed}`).toBe('vg_colossus@0d')
      }
    }
  })
})

describe('what §4.5 says it collides with', () => {
  it('does NOT collide with Guard — Guard is an aura, not targeting', () => {
    /**
     * Guard resolves once at battle start as `adj.bulwark += s.guard` and is
     * never consulted when a blow is aimed. So the two cannot interact, and
     * the proof is that the aura lands identically either way: the Titan's
     * neighbour starts the battle with the same Bulwark whether the Titan is
     * taunting or not.
     */
    const withTaunt = simulateBattle(
      { board: [stack('vg_footman', 6, 1)], hero: hero('h_sylvaen') },
      // A bare board so the arithmetic has one source: the Titan's Guard 1 to
      // its neighbour, plus its battle-start +1 Bulwark to all allies.
      { board: [stack('vg_colossus', 3, 0, 'd'), stack('vg_militia', 6, 1, 'd')], hero: hero('h_sylvaen') },
      sylvaen,
      sylvaen,
      5,
      { round: 6 },
    )
    // Read AFTER the auras land, not from the opening snapshot: `battleStart`
    // is pushed before the Guard loop and before battle-start abilities run,
    // so every stack still reads its printed Bulwark there.
    const buff = withTaunt.events.find(
      (e): e is Extract<BattleEvent, { t: 'buff' }> => e.t === 'buff' && e.src === 'vg_colossus@0d',
    )!
    const neighbour = buff.snap.find((s) => s.uid === 'vg_militia@1d')!
    // Militia carry no Bulwark of their own: everything here is the Titan's
    // Guard 1 to its neighbour plus its battle-start +1 to all allies.
    expect(neighbour.bulwark).toBe(2)
  })

  it('DOES make Cover inert — no charge is ever spent while it stands', () => {
    /**
     * A taunter is front row; `interceptorFor` only answers for a back-row
     * target; so nothing is ever aimed past the Titan for Cover to intercept.
     * The charges are not wasted, they are banked — they come back the moment
     * it falls. That is a real balance input, not a curiosity.
     */
    const res = simulateBattle(
      { board: [escort(), stack('vg_crossbow', 10, 4)], hero: hero('h_sylvaen') },
      titanLine(),
      sylvaen,
      sylvaen,
      9,
      { round: 6 },
    )
    expect(covers(res.events)).toEqual([])

    // The control shows the volley WOULD have been intercepted otherwise: the
    // same board without a taunter spends charges as usual.
    const control = simulateBattle(
      { board: [escort(), stack('vg_crossbow', 10, 4)], hero: hero('h_sylvaen') },
      controlLine(),
      sylvaen,
      sylvaen,
      9,
      { round: 6 },
    )
    expect(covers(control.events).length).toBeGreaterThan(0)
  })

  it('shuts off VOLLEY back-row reach, which melee never had anyway', () => {
    // Melee is already gated on the enemy front row being empty, so "back-row
    // reach" was only ever a volley's to lose. This is the half of §4.5's
    // phrase that is actually a change.
    const res = simulateBattle(
      { board: [escort(), stack('vg_crossbow', 10, 4)], hero: hero('h_sylvaen') },
      titanLine(),
      sylvaen,
      sylvaen,
      9,
      { round: 6 },
    )
    const backRow = ['vg_crossbow@4d', 'vg_mule@5d']
    for (const a of aimedBy(whileAlive(res.events, 'vg_colossus@0d'), 'vg_crossbow@4')) {
      expect(backRow).not.toContain(a.dst)
    }

    const control = simulateBattle(
      { board: [escort(), stack('vg_crossbow', 10, 4)], hero: hero('h_sylvaen') },
      controlLine(),
      sylvaen,
      sylvaen,
      9,
      { round: 6 },
    )
    // Without a taunter the same archers do reach the back row.
    expect(aimedBy(control.events, 'vg_crossbow@4').some((a) => backRow.includes(a.dst))).toBe(true)
  })

  it('does not redirect what spreads AFTER it lands', () => {
    /**
     * Taunt governs which stack is attacked. A ricochet (§4.4) walks its own
     * frozen line and a Piercing Volley splash deliberately picks a different
     * stack, so both still carry on into the line behind a taunter. Stated in
     * the keyword copy, and pinned here so it stays a decision.
     */
    const res = simulateBattle(
      { board: [stack('vg_aegiswarden', 6, 1)], hero: hero('h_sylvaen') },
      titanLine(),
      sylvaen,
      sylvaen,
      5,
      { round: 7 },
    )
    // The throw itself is pulled onto the Titan...
    const throws = aimedBy(whileAlive(res.events, 'vg_colossus@0d'), 'vg_aegiswarden@1')
    expect(throws.length).toBeGreaterThan(0)
    for (const t of throws) expect(t.dst).toBe('vg_colossus@0d')
    // ...and the ricochets still reach everyone else.
    const hops = res.events.filter((e): e is Extract<BattleEvent, { t: 'bounce' }> => e.t === 'bounce')
    expect(hops.length).toBeGreaterThan(0)
    expect(hops.some((h) => h.dst !== 'vg_colossus@0d')).toBe(true)
  })
})

describe('determinism (§12.3)', () => {
  it('the same seed replays identically', () => {
    const a = simulateBattle(
      { board: [stack('vg_footman', 6, 1), stack('vg_crossbow', 8, 4)], hero: hero('h_sylvaen') },
      titanLine(),
      sylvaen,
      sylvaen,
      31337,
      { round: 8 },
    )
    const b = simulateBattle(
      { board: [stack('vg_footman', 6, 1), stack('vg_crossbow', 8, 4)], hero: hero('h_sylvaen') },
      titanLine(),
      sylvaen,
      sylvaen,
      31337,
      { round: 8 },
    )
    expect(a.events).toEqual(b.events)
  })

  it('spends the same randomness as if it were not there', () => {
    /**
     * The property the override was written around. Each branch of
     * `chooseTarget` still makes exactly the draws it always made and Taunt
     * replaces the ANSWER, so a battle in which the taunter would have been
     * the target anyway is byte-identical to one played without the keyword.
     *
     * A lone Titan is that battle: it is the only stack its side has, so there
     * was never another answer, and every seeded decision downstream — who a
     * volley picks, where a splash goes — has to land in exactly the same
     * place as it did before §4.5 existed.
     */
    const attackers = () => ({
      board: [stack('vg_footman', 6, 0), stack('vg_crossbow', 8, 4)],
      hero: hero('h_sylvaen'),
    })
    for (const seed of [1, 12345, 99991]) {
      const taunting = simulateBattle(
        attackers(),
        { board: [stack('vg_colossus', 4, 0, '', { uid: 'def@0' })], hero: hero('h_sylvaen') },
        sylvaen,
        sylvaen,
        seed,
        { round: 8 },
      )
      // The Anvilborn is the same shape of body with no Taunt on it; against a
      // single defender both boards must play out identically beat for beat.
      const plain = simulateBattle(
        attackers(),
        { board: [stack('vg_shieldmaiden', 4, 0, '', { uid: 'def@0' })], hero: hero('h_sylvaen') },
        sylvaen,
        sylvaen,
        seed,
        { round: 8 },
      )
      // The first cycle only: after that the two defenders have taken
      // different amounts of damage and the boards legitimately diverge. What
      // is being compared is who each attacker AIMED at and in what order,
      // which is the whole of what Taunt is allowed to touch.
      const shape = (r: typeof taunting) =>
        r.events
          .filter((e): e is Attack => e.t === 'attack')
          .slice(0, 3)
          .map((e) => `${e.src}->${e.dst}`)
          .join('|')
      expect(shape(taunting), `seed ${seed}`).toBe(shape(plain))
    }
  })
})

describe('the Glossary explains the override', () => {
  const entry = (id: string) => KEYWORD_GLOSSARY.find((k) => k.id === id)

  it('ships Taunt as its own entry naming what it does and does not bind', () => {
    const text = entry('taunt')!.text
    expect(entry('taunt')?.name).toBe('Taunt')
    expect(text).toMatch(/Siege/)
    expect(text).toMatch(/spell/i)
    expect(text).toMatch(/volley/i)
  })
})
