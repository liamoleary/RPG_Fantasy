import { describe, expect, it } from 'vitest'
import { ALL_UNITS, HERO_BY_ID, unit } from '../src/data/index'
import { ZERO_MODS } from '../src/data/types'
import { simulateBattle, type BattleEvent, type BoardStack, type HeroState } from '../src/engine/battle'
import { KEYWORD_GLOSSARY } from '../src/ui/keywords'

/**
 * The Forgeline tops (Design Notes 12 §3.6).
 *
 *   Runelord   the front rank intercepts — the back row cannot be reached
 *   Anvilborn  leaps the line and hits the whole enemy back row
 *
 * The two are the same fork having an argument, and that is deliberate: one
 * branch makes the back row unreachable and the other goes over the top of it.
 *
 * §3.6 asks for the intercept to REPLACE the Runelord's battle-start +2
 * Bulwark to all allies rather than stack with it, on a unit TODO.md has had
 * flagged since DN11. Both the ability and his own Guard come off in the same
 * commit, which is what makes the swap roughly cost-neutral rather than a
 * quiet buff.
 */

const sylvaen = HERO_BY_ID.get('h_sylvaen')!

function stack(unitId: string, count: number, slot: number, tag = '', extra: Partial<BoardStack> = {}): BoardStack {
  return { uid: `${unitId}@${slot}${tag}`, unitId, count, slot, bonusAtk: 0, bonusHp: 0, growthTicks: 0, spent: 3, rank: 0, ...extra }
}
function hero(id: string): HeroState {
  return { heroId: id, name: id, factionId: 'vanguard', level: 1, mods: { ...ZERO_MODS } }
}

type Attack = Extract<BattleEvent, { t: 'attack' }>
type Intercept = Extract<BattleEvent, { t: 'intercept' }>
const attacks = (evs: BattleEvent[]): Attack[] => evs.filter((e): e is Attack => e.t === 'attack')
const aimedBy = (evs: BattleEvent[], src: string): Attack[] =>
  attacks(evs).filter((e) => e.src === src && !e.retaliation)
const intercepts = (evs: BattleEvent[]): Intercept[] => evs.filter((e): e is Intercept => e.t === 'intercept')
const covers = (evs: BattleEvent[]) => evs.filter((e) => e.t === 'cover')
function whileAlive(evs: BattleEvent[], uid: string): BattleEvent[] {
  const died = evs.findIndex((e) => e.t === 'death' && e.uid === uid)
  return died < 0 ? evs : evs.slice(0, died)
}

/** A Runelord holding a wall, with something worth shooting behind it. */
const walled = () => ({
  board: [
    // Deep enough to outlive the gunners: the wall is explicitly conditional
    // on a front rank standing, so a Shieldmaiden who dies in cycle 1 would
    // have the tests measuring the wall's ABSENCE.
    stack('vg_shieldmaiden', 60, 0, 'd'),
    stack('vg_runelord', 4, 4, 'd'),
    stack('vg_crossbow', 6, 5, 'd'),
  ],
  hero: hero('h_sylvaen'),
})
/** The same shape with no wall: a Runesmith stands in for the Runelord. */
const open = () => ({
  board: [
    stack('vg_shieldmaiden', 60, 0, 'd'),
    stack('vg_runesmith', 4, 4, 'd'),
    stack('vg_crossbow', 6, 5, 'd'),
  ],
  hero: hero('h_sylvaen'),
})
const escort = (n = 80) => stack('vg_mule', n, 0)

describe('the Runelord traded his grant for a wall (§3.6 / §6)', () => {
  it('no longer grants Bulwark to all allies, and no longer carries Guard', () => {
    const rl = unit('vg_runelord')
    expect(rl.ability, 'the battle-start grant should be gone entirely').toBeUndefined()
    expect(rl.keywords.some((k) => k.k === 'guard'), 'he stops carrying Guard himself').toBe(false)
    expect(rl.keywords.some((k) => k.k === 'intercept')).toBe(true)
  })

  it('leaves the rest of the Forgeline’s single-target grants alone', () => {
    // The DN11 interim balance note said all three grants were flattened to +1
    // until a single-ally effect existed. It does exist, the Runelord's
    // board-wide one is gone, and so the line no longer stacks Bulwark on
    // everything — which was the whole reason for the flattening.
    expect(unit('vg_apprentice').ability?.effect).toEqual({ type: 'allyBulwark', x: 1, pick: 'randomFront' })
    expect(unit('vg_runesmith').ability?.effect).toEqual({ type: 'allyBulwark', x: 2, pick: 'lowestBulwark' })
    const boardWide = ALL_UNITS.filter(
      (u) => u.pool === 'vanguard' && u.ability?.effect.type === 'alliesBulwark',
    ).map((u) => u.id)
    expect(boardWide).toEqual(['vg_colossus'])
  })

  it('and nothing else in the game grants an intercept', () => {
    const carriers = ALL_UNITS.filter((u) => u.keywords.some((k) => k.k === 'intercept')).map((u) => u.id)
    expect(carriers).toEqual(['vg_runelord'])
  })
})

describe('the back row cannot be reached while a front rank stands', () => {
  it('turns a volley aimed past the line onto the front rank', () => {
    const res = simulateBattle(
      { board: [escort(), stack('vg_crossbow', 12, 4)], hero: hero('h_sylvaen') },
      walled(),
      sylvaen,
      sylvaen,
      9,
      { round: 7 },
    )
    const alive = whileAlive(res.events, 'vg_runelord@4d')
    const aimed = aimedBy(alive, 'vg_crossbow@4')
    expect(aimed.length).toBeGreaterThan(0)
    for (const a of aimed) expect(a.dst).toBe('vg_shieldmaiden@0d')
    expect(intercepts(alive).length).toBeGreaterThan(0)

    // Without the wall the same archers do get through to the back row.
    const control = simulateBattle(
      { board: [escort(), stack('vg_crossbow', 12, 4)], hero: hero('h_sylvaen') },
      open(),
      sylvaen,
      sylvaen,
      9,
      { round: 7 },
    )
    const back = ['vg_runesmith@4d', 'vg_crossbow@5d']
    expect(aimedBy(control.events, 'vg_crossbow@4').some((a) => back.includes(a.dst))).toBe(true)
    expect(intercepts(control.events)).toEqual([])
  })

  it('stops Siege too, unlike Cover', () => {
    /**
     * The one place this deliberately parts company with Cover, which Siege
     * ignores unconditionally. §3.6's promise is unqualified — "the back row
     * cannot be reached while a front rank stands" — and a gunner strolling
     * through it would leave the Runelord paying for something he does not
     * have, since the wall replaced a board-wide +2 Bulwark.
     */
    const res = simulateBattle(
      { board: [escort(), stack('vg_cannon', 10, 4)], hero: hero('h_sylvaen') },
      walled(),
      sylvaen,
      sylvaen,
      13,
      { round: 8 },
    )
    const alive = whileAlive(res.events, 'vg_runelord@4d')
    const aimed = aimedBy(alive, 'vg_cannon@4')
    expect(aimed.length).toBeGreaterThan(0)
    for (const a of aimed) expect(a.dst).toBe('vg_shieldmaiden@0d')
  })

  it('spends no Cover charge — the free wall answers first', () => {
    // Same shape as Taunt's effect on Cover, and for the same reason: the blow
    // never reaches the back row, so there is nothing for a charge to save.
    const res = simulateBattle(
      { board: [escort(), stack('vg_crossbow', 12, 4)], hero: hero('h_sylvaen') },
      walled(),
      sylvaen,
      sylvaen,
      9,
      { round: 7 },
    )
    expect(covers(whileAlive(res.events, 'vg_runelord@4d'))).toEqual([])

    // The control shows a charge WOULD have been spent otherwise. Its back row
    // sits at slot 4 and nowhere else, because a Shieldmaiden at slot 0 covers
    // back slots 4 and 5 only — parking the target at 6 would prove nothing
    // except that Cover has a geometry.
    const control = simulateBattle(
      { board: [escort(), stack('vg_crossbow', 12, 4)], hero: hero('h_sylvaen') },
      { board: [stack('vg_shieldmaiden', 60, 0, 'd'), stack('vg_runesmith', 4, 4, 'd')], hero: hero('h_sylvaen') },
      sylvaen,
      sylvaen,
      9,
      { round: 7 },
    )
    expect(covers(control.events).length).toBeGreaterThan(0)
  })

  it('falls the moment he does', () => {
    const res = simulateBattle(
      { board: [escort(), stack('vg_cannon', 20, 4)], hero: hero('h_sylvaen') },
      { board: [stack('vg_militia', 3, 0, 'd'), stack('vg_runelord', 1, 4, 'd'), stack('vg_crossbow', 30, 5, 'd')], hero: hero('h_sylvaen') },
      sylvaen,
      sylvaen,
      3,
      { round: 10 },
    )
    const death = res.events.findIndex((e) => e.t === 'death' && e.uid === 'vg_runelord@4d')
    expect(death, 'the Runelord has to fall for this to measure anything').toBeGreaterThanOrEqual(0)
    expect(intercepts(res.events.slice(death))).toEqual([])
  })

  it('never lets a blow through a gap in the rank', () => {
    /**
     * The promise is absolute, so the wall prefers the front stack standing
     * OVER the target — the same geometry Cover uses — but falls back to the
     * leftmost when nobody is above it. Here the only front stack sits at slot
     * 0, which covers back slots 4 and 5 but not 6.
     */
    const res = simulateBattle(
      { board: [escort(), stack('vg_crossbow', 12, 4)], hero: hero('h_sylvaen') },
      {
        board: [stack('vg_shieldmaiden', 60, 0, 'd'), stack('vg_runelord', 4, 6, 'd')],
        hero: hero('h_sylvaen'),
      },
      sylvaen,
      sylvaen,
      17,
      { round: 7 },
    )
    const alive = whileAlive(res.events, 'vg_runelord@6d')
    for (const a of aimedBy(alive, 'vg_crossbow@4')) expect(a.dst).toBe('vg_shieldmaiden@0d')
  })
})

describe('the Anvilborn leaps it (§3.6)', () => {
  it('hits every enemy back-row stack, in slot order, for its share of the swing', () => {
    const res = simulateBattle(
      { board: [stack('vg_anvilborn', 6, 0)], hero: hero('h_sylvaen') },
      {
        // Nothing here can hurt him: the Militia's whole swing is inside his
        // Bulwark and Mule Carts have no ATK at all. The leap is what is being
        // measured, not whether he outlives the board.
        board: [
          stack('vg_militia', 10, 0, 'd'),
          stack('vg_mule', 40, 4, 'd'),
          stack('vg_mule', 40, 5, 'd'),
          stack('vg_mule', 40, 6, 'd'),
        ],
        hero: hero('h_sylvaen'),
      },
      sylvaen,
      sylvaen,
      5,
      { round: 7 },
    )
    const swung = aimedBy(res.events, 'vg_anvilborn@0')
    // The ordinary blow lands on the front rank first...
    expect(swung[0].dst).toBe('vg_militia@0d')
    // ...then the leap takes the whole back row, ascending, at half power.
    const leap = swung.slice(1, 4)
    expect(leap.map((a) => a.dst)).toEqual(['vg_mule@4d', 'vg_mule@5d', 'vg_mule@6d'])
    // `frac` is the lever §3.6 leaves and §7.10 tuned, so it is read rather
    // than pinned: what matters is that every back-row stack takes the same
    // share of the same swing.
    const frac = (unit('vg_anvilborn').ability!.effect as { frac: number }).frac
    const me = leap[0].snap.find((s) => s.uid === 'vg_anvilborn@0')!
    for (const a of leap) expect(a.dmg + a.absorbed).toBe(Math.floor(me.power * frac))
  })

  it('goes over a rune-wall — the fork answers itself', () => {
    /**
     * The Runelord makes the back row unreachable by anything AIMED past the
     * front rank. The Anvilborn does not aim; he jumps. Both halves of §3.6
     * are true at once and the two branches of the Forgeline are each other's
     * answer, which is the most interesting thing in this commit.
     */
    const res = simulateBattle(
      { board: [stack('vg_anvilborn', 6, 0)], hero: hero('h_sylvaen') },
      walled(),
      sylvaen,
      sylvaen,
      5,
      { round: 7 },
    )
    const alive = whileAlive(res.events, 'vg_runelord@4d')
    const reached = aimedBy(alive, 'vg_anvilborn@0').filter((a) => a.dst === 'vg_runelord@4d')
    expect(reached.length, 'the leap should reach the Runelord himself').toBeGreaterThan(0)
    // And no intercept was logged for those blows: they were never aimed past
    // the rank, so the wall had nothing to answer.
    expect(intercepts(alive)).toEqual([])
  })

  it('spends no randomness — the same row, the same order, every seed', () => {
    const shapes = new Set<string>()
    for (const seed of [1, 12345, 99991, 4242]) {
      const res = simulateBattle(
        { board: [stack('vg_anvilborn', 6, 0)], hero: hero('h_sylvaen') },
        {
          board: [
            stack('vg_militia', 10, 0, 'd'),
            stack('vg_mule', 40, 4, 'd'),
            stack('vg_mule', 40, 5, 'd'),
            stack('vg_mule', 40, 6, 'd'),
          ],
          hero: hero('h_sylvaen'),
        },
        sylvaen,
        sylvaen,
        seed,
        { round: 7 },
      )
      shapes.add(
        aimedBy(res.events, 'vg_anvilborn@0')
          .slice(1, 4)
          .map((a) => `${a.dst}:${a.dmg + a.absorbed}`)
          .join('|'),
      )
    }
    expect(shapes.size).toBe(1)
  })
})

describe('determinism (§12.3)', () => {
  it('the same seed replays identically with both tops on the field', () => {
    const board = () => ({
      board: [stack('vg_anvilborn', 5, 0), stack('vg_runelord', 3, 4)],
      hero: hero('h_sylvaen'),
    })
    const a = simulateBattle(board(), walled(), sylvaen, sylvaen, 24601, { round: 9 })
    const b = simulateBattle(board(), walled(), sylvaen, sylvaen, 24601, { round: 9 })
    expect(a.events).toEqual(b.events)
    expect(a.winner).toBe(b.winner)
  })
})

describe('the Glossary tells the wall from Cover', () => {
  const entry = (id: string) => KEYWORD_GLOSSARY.find((k) => k.id === id)

  it('ships Intercept as its own entry naming Cover and Siege', () => {
    const text = entry('intercept')!.text
    expect(entry('intercept')?.name).toBe('Intercept')
    expect(text).toMatch(/Cover/)
    expect(text).toMatch(/Siege/)
    expect(text).toMatch(/no charges/)
  })

  it('warns that leaping the line still gets through', () => {
    expect(entry('intercept')!.text).toMatch(/leaps the line/)
  })
})
