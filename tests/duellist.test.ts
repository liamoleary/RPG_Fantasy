import { describe, expect, it } from 'vitest'
import { ALL_UNITS, HERO_BY_ID, unit } from '../src/data/index'
import { UNIT_ART } from '../src/data/art'
import { ZERO_MODS } from '../src/data/types'
import { simulateBattle, type BattleEvent, type BoardStack, type HeroState } from '../src/engine/battle'

/**
 * The Arbalest fork (Design Notes 12 §3.3) — the crossbow line learns to fork,
 * the way the Footman line did in DN11.
 *
 *   Sunlance Ballistier  one target, one enormous bolt, and an Apex
 *   Sunshot Duellist     two targets at once, two pistols fired together
 *
 * §3.3 names the lever in so many words: "the Ballistier's single hit overkills
 * small stacks, the Duellist never wastes a point but never one-shots a T5
 * either." That is the sentence these tests turn into numbers, because it is
 * also the whole of what keeps the fork off DN11 §6's 35/65 auto-pick band.
 */

const sylvaen = HERO_BY_ID.get('h_sylvaen')!

function stack(unitId: string, count: number, slot: number, tag = '', extra: Partial<BoardStack> = {}): BoardStack {
  return { uid: `${unitId}@${slot}${tag}`, unitId, count, slot, bonusAtk: 0, bonusHp: 0, growthTicks: 0, spent: 3, rank: 0, ...extra }
}
function hero(id: string): HeroState {
  return { heroId: id, name: id, factionId: 'vanguard', level: 1, mods: { ...ZERO_MODS } }
}

type Attack = Extract<BattleEvent, { t: 'attack' }>
const aimedBy = (evs: BattleEvent[], src: string): Attack[] =>
  evs.filter((e): e is Attack => e.t === 'attack' && e.src === src && !e.retaliation)

/** Four fat, harmless stacks: nothing dies, nothing shoots back. */
const targets = () => ({
  board: [
    stack('vg_mule', 60, 0, 'd'),
    stack('vg_mule', 60, 1, 'd'),
    stack('vg_mule', 60, 4, 'd'),
    stack('vg_mule', 60, 5, 'd'),
  ],
  hero: hero('h_sylvaen'),
})

describe('the fork and the unit (§3.3 / §6)', () => {
  it('forks the Arbalest into both tops, keeping the id §6 fixed', () => {
    expect(unit('vg_arbalest').linePaths).toEqual(['vg_ballistier', 'vg_marksman'])
    // §6: "the id stays `vg_marksman`, the display name is 'Sunshot Duellist'".
    expect(unit('vg_marksman').id).toBe('vg_marksman')
    expect(unit('vg_marksman').name).toBe('Sunshot Duellist')
  })

  it('ships its plate in the same commit as the unit', () => {
    // tests/art.test.ts holds this both ways across the whole roster; this is
    // the same promise said out loud where the unit was added.
    expect(UNIT_ART['vg_marksman']).toBe('/art/units/vg_marksman.webp')
  })

  it('is a T4 leaf beside the Ballistier, with no Apex', () => {
    expect(unit('vg_marksman').tier).toBe(4)
    expect(unit('vg_marksman').linePaths).toBeUndefined()
    // DN04 §3 keeps meters to the six named tops; apex.test.ts checks the
    // whole roster, this says it at the point the unit was introduced.
    expect(unit('vg_marksman').apex).toBeUndefined()
  })

  it('is built under the Ballistier per shot and over it in total', () => {
    /**
     * §3.3's lever as arithmetic. Per barrel he is weaker than the Ballistier
     * — that is "never one-shots a T5". Across both barrels he throws more
     * than it does — that is "never wastes a point". Neither branch dominates,
     * which is what DN11 §6's 35/65 band is asking for.
     */
    const duel = unit('vg_marksman')
    const ball = unit('vg_ballistier')
    expect(duel.atk).toBeLessThan(ball.atk)
    const frac = (duel.ability!.effect as { frac: number }).frac
    expect(duel.atk * (1 + frac)).toBeGreaterThan(ball.atk)

    // A typical stack's single barrel stays under a T5 Colossus's per-unit
    // pool, so it cannot delete one outright however the board is arranged.
    expect(duel.atk * 4).toBeLessThan(unit('vg_colossus').hp * 1 + unit('vg_colossus').hp * 0.2)
  })

  it('and nothing else fires a second barrel', () => {
    const carriers = ALL_UNITS.filter((u) => u.ability?.effect.type === 'strikeSecondTarget').map((u) => u.id)
    expect(carriers).toEqual(['vg_marksman'])
  })
})

describe('both pistols, on two different stacks', () => {
  it('fires twice per action, at two distinct enemies, for the same damage', () => {
    const res = simulateBattle(
      { board: [stack('vg_marksman', 5, 4)], hero: hero('h_sylvaen') },
      targets(),
      sylvaen,
      sylvaen,
      7,
      { round: 7 },
    )
    const shots = aimedBy(res.events, 'vg_marksman@4')
    expect(shots.length).toBeGreaterThanOrEqual(2)
    const [first, second] = shots
    expect(second.dst).not.toBe(first.dst)
    // frac is 1, so both barrels carry the full swing: ATK 3 x 5 units = 15.
    const me = first.snap.find((s) => s.uid === 'vg_marksman@4')!
    expect(first.dmg + first.absorbed).toBe(me.power)
    expect(second.dmg + second.absorbed).toBe(me.power)
  })

  it('takes the next stack by slot, wrapping — no roll of its own', () => {
    const shapes = new Set<string>()
    for (const seed of [1, 12345, 99991, 4242, 7]) {
      const res = simulateBattle(
        { board: [stack('vg_marksman', 5, 4)], hero: hero('h_sylvaen') },
        targets(),
        sylvaen,
        sylvaen,
        seed,
        { round: 7 },
      )
      const [first, second] = aimedBy(res.events, 'vg_marksman@4')
      const slots = [0, 1, 4, 5]
      // The uid is `unitId@slot` plus the side tag, so the slot has to be
      // matched rather than sliced — `Number('1d')` is NaN and every lookup
      // silently becomes index 0.
      const slotOf = (uid: string) => Number(uid.match(/@(\d+)/)![1])
      const i = slots.indexOf(slotOf(first.dst))
      // Whatever the volley rolled for the first barrel, the second is the
      // next living stack along, so the pair is fixed once the first is aimed.
      expect(second.dst, `seed ${seed}`).toBe(`vg_mule@${slots[(i + 1) % slots.length]}d`)
      shapes.add(`${first.dmg}|${second.dmg}`)
    }
    // Same damage on every seed: only which stack it opens on can vary.
    expect(shapes.size).toBe(1)
  })

  it('does not fire the second barrel at a lone enemy', () => {
    /**
     * With one stack on the field there is nowhere for the second pistol to
     * go, and it is not fired into the first target twice.
     *
     * Measured as barrels per CYCLE, which needs the actor count: `exchanges`
     * counts every stack's action on both sides, so putting a second mule on
     * the board grows the denominator as well as the numerator and a raw
     * shots-per-exchange ratio understates the effect by a third. Nothing dies
     * in either battle, so the actor count is constant throughout.
     */
    const rate = (enemies: BoardStack[]) => {
      const res = simulateBattle(
        { board: [stack('vg_marksman', 5, 4)], hero: hero('h_sylvaen') },
        { board: enemies, hero: hero('h_sylvaen') },
        sylvaen,
        sylvaen,
        7,
        { round: 7 },
      )
      const shots = aimedBy(res.events, 'vg_marksman@4')
      expect(shots.length).toBeGreaterThan(0)
      const actors = enemies.length + 1
      return (shots.length * actors) / res.exchanges
    }
    expect(rate([stack('vg_mule', 200, 0, 'd')])).toBeCloseTo(1, 1)
    expect(rate([stack('vg_mule', 200, 0, 'd'), stack('vg_mule', 200, 1, 'd')])).toBeCloseTo(2, 1)
  })

  it('clears a line of small stacks faster than the Ballistier — §3.3’s lever', () => {
    /**
     * §3.3: "the Ballistier's single hit overkills small stacks, the Duellist
     * never wastes a point". Measured as how long each takes to clear the same
     * board of stacks too small to absorb a sunlance.
     *
     * NOT measured by summing `dmg` on the events: `applyDamage` sets `dealt`
     * to the damage THROWN, before it checks whether the pool could take it,
     * so an overkilling blow reports its full size and the waste is invisible
     * there. Exchanges spent is the honest version of the same question.
     */
    const small = () => ({
      board: [0, 1, 4, 5].map((slot) => stack('vg_mule', 2, slot, 'd')),
      hero: hero('h_sylvaen'),
    })
    const duel = simulateBattle(
      { board: [stack('vg_marksman', 5, 4)], hero: hero('h_sylvaen') },
      small(),
      sylvaen,
      sylvaen,
      11,
      { round: 7 },
    )
    const ball = simulateBattle(
      { board: [stack('vg_ballistier', 5, 4)], hero: hero('h_sylvaen') },
      small(),
      sylvaen,
      sylvaen,
      11,
      { round: 7 },
    )
    expect(duel.winner).toBe('a')
    expect(ball.winner).toBe('a')
    // Two barrels clear four small stacks in half the actions one big bolt does.
    expect(duel.exchanges).toBeLessThan(ball.exchanges)
  })

  it('spreads past a Taunt, like every other second blow', () => {
    /**
     * Commit 7's rule: Taunt governs which stack is ATTACKED, not where an
     * effect that spreads afterwards goes. The first barrel is pulled onto the
     * Quarry Titan; the second still finds someone else.
     */
    const res = simulateBattle(
      { board: [stack('vg_marksman', 6, 4)], hero: hero('h_sylvaen') },
      { board: [stack('vg_colossus', 6, 0, 'd'), stack('vg_mule', 60, 1, 'd')], hero: hero('h_sylvaen') },
      sylvaen,
      sylvaen,
      5,
      { round: 8 },
    )
    const shots = aimedBy(res.events, 'vg_marksman@4')
    expect(shots.length).toBeGreaterThanOrEqual(2)
    expect(shots[0].dst).toBe('vg_colossus@0d')
    expect(shots[1].dst).toBe('vg_mule@1d')
  })
})

describe('determinism (§12.3)', () => {
  it('the same seed replays identically', () => {
    const board = () => ({
      board: [stack('vg_marksman', 4, 4), stack('vg_ballistier', 4, 5)],
      hero: hero('h_sylvaen'),
    })
    const foe = () => ({
      board: [stack('vg_footman', 10, 0, 'd'), stack('vg_militia', 14, 1, 'd'), stack('vg_crossbow', 8, 4, 'd')],
      hero: hero('h_sylvaen'),
    })
    const a = simulateBattle(board(), foe(), sylvaen, sylvaen, 60613, { round: 9 })
    const b = simulateBattle(board(), foe(), sylvaen, sylvaen, 60613, { round: 9 })
    expect(a.events).toEqual(b.events)
    expect(a.winner).toBe(b.winner)
  })
})
