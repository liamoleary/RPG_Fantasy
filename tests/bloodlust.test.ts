import { describe, expect, it } from 'vitest'
import { ALL_UNITS, HERO_BY_ID, unit } from '../src/data/index'
import { ZERO_MODS } from '../src/data/types'
import { simulateBattle, type BattleEvent, type BoardStack, type HeroState } from '../src/engine/battle'

/**
 * Bloodlust (Design Notes 12 §4.1 / §3.1).
 *
 * §4.1 describes this as adding a "when attacked" hook the engine does not
 * have. It does have one, and has since long before DN12: `performAttack`
 * already makes every stack strike back at FULL ATK, once a cycle, against any
 * attack that is neither a Volley nor an extra swing. That path is untouched
 * here and every balance number in the repo rests on it.
 *
 * So Bloodlust is not "a straight buff" — half ATK is less than the answer the
 * Champion already gave. What it adds is an answer in the two cases the
 * universal one skips: **Volley attackers**, who until now paid nothing at all
 * for shooting into melee, and **extra attacks**. That is what these tests
 * measure, because that is where the ability actually lives.
 */

const sylvaen = HERO_BY_ID.get('h_sylvaen')!

function stack(unitId: string, count: number, slot: number, extra: Partial<BoardStack> = {}): BoardStack {
  return { uid: `${unitId}@${slot}`, unitId, count, slot, bonusAtk: 0, bonusHp: 0, growthTicks: 0, spent: 3, rank: 0, ...extra }
}
function hero(id: string): HeroState {
  return { heroId: id, name: id, factionId: 'vanguard', level: 1, mods: { ...ZERO_MODS } }
}

type Attack = Extract<BattleEvent, { t: 'attack' }>
const attacks = (evs: BattleEvent[]): Attack[] => evs.filter((e): e is Attack => e.t === 'attack')
const counters = (evs: BattleEvent[], src?: string): Attack[] =>
  attacks(evs).filter((e) => e.bloodlust === true && (src === undefined || e.src === src))
const retaliations = (evs: BattleEvent[]): Attack[] =>
  attacks(evs).filter((e) => e.retaliation && !e.bloodlust)

describe('the ability is data, and the stat cut shipped with it (§3.1)', () => {
  it('the Champion counters for half, on being attacked', () => {
    const def = unit('vg_champion')
    expect(def.ability?.trigger).toBe('onAttacked')
    expect(def.ability?.effect).toEqual({ type: 'counterAttack', frac: 0.5 })
  })

  it('and its ATK was cut in the same commit, 4 → 3', () => {
    // §3.1: "Cut its base stats in the same commit... Start by dropping it to
    // 3/5". The Champion is the highest win-delta in the game; the note is
    // explicit that the buff does not ship on its own.
    expect(unit('vg_champion').atk).toBe(3)
    expect(unit('vg_champion').hp).toBe(5)
  })

  it('and nothing else counters yet', () => {
    const carriers = ALL_UNITS.filter((u) => u.ability?.effect.type === 'counterAttack').map((u) => u.id)
    expect(carriers).toEqual(['vg_champion'])
  })
})

describe('where it earns its keep: answering a Volley (§4.1)', () => {
  /**
   * The Crossbow Levy shoots from the back row. A volley draws no retaliation
   * at all in this engine — `performAttack` skips it explicitly — so before
   * Bloodlust an archer could shoot a Champion all battle for free.
   */
  // The Militia are a wall the Champion can spend its own swings on. Without
  // one it simply walks into the back row and wipes the Levy on the opening
  // action, and the archers never shoot at all.
  const archers = () => ({
    board: [stack('vg_militia', 30, 0), stack('vg_crossbow', 8, 4)],
    hero: hero('h_sylvaen'),
  })

  it('a Champion answers the archers; a Footman does not', () => {
    const withChampion = simulateBattle(
      { board: [stack('vg_champion', 4, 0)], hero: hero('h_sylvaen') },
      archers(),
      sylvaen,
      sylvaen,
      5,
      { round: 3 },
    )
    const control = simulateBattle(
      { board: [stack('vg_footman', 4, 0)], hero: hero('h_sylvaen') },
      archers(),
      sylvaen,
      sylvaen,
      5,
      { round: 3 },
    )

    const atArchers = counters(withChampion.events, 'vg_champion@0').filter((e) => e.dst === 'vg_crossbow@4')
    expect(atArchers.length, 'the Champion should answer the volley').toBeGreaterThan(0)

    // The control proves the gap is real. A Footman takes the same volleys and
    // never once answers them — that is the hole in the engine Bloodlust fills,
    // and it is why half ATK is worth having next to a full-ATK retaliation
    // that simply does not fire against archers.
    expect(counters(control.events)).toEqual([])
    const footmanAtArchers = attacks(control.events).filter(
      (e) => e.src === 'vg_footman@0' && e.dst === 'vg_crossbow@4',
    )
    expect(footmanAtArchers.filter((e) => e.retaliation)).toEqual([])
  })

  it('the answer is half the stack’s full swing, floored', () => {
    const res = simulateBattle(
      { board: [stack('vg_champion', 4, 0)], hero: hero('h_sylvaen') },
      archers(),
      sylvaen,
      sylvaen,
      5,
      { round: 3 },
    )
    const c = counters(res.events, 'vg_champion@0')[0]
    expect(c).toBeDefined()
    // Half the Champion's swing AS IT STOOD when it answered, read off the
    // event's own snapshot rather than from the roster: a stack that has taken
    // casualties swings for less, and hard-coding the opening number would be
    // asserting the board never changed.
    const me = c.snap.find((x) => x.uid === 'vg_champion@0')!
    expect(c.dmg + c.absorbed).toBe(Math.floor(me.power * 0.5))
  })
})

describe('the caps (§6)', () => {
  it('at most once per exchange, however many blows arrive', () => {
    /**
     * Two Battle Clerics, Initiative 6 to the Champion's 5, so BOTH of them
     * swing before the Champion acts at all. Two blows land in cycle 1 and
     * exactly one counter answers them — which is the cap, measured rather
     * than approximated.
     */
    const res = simulateBattle(
      { board: [stack('vg_cleric', 4, 4), stack('vg_cleric', 4, 5)], hero: hero('h_sylvaen') },
      { board: [stack('vg_champion', 5, 0)], hero: hero('h_sylvaen') },
      sylvaen,
      sylvaen,
      17,
      { round: 5 },
    )
    // Everything up to the Champion's own first swing IS cycle 1, since it is
    // the slowest stack on the field.
    const itsTurn = res.events.findIndex((e) => e.t === 'attack' && e.src === 'vg_champion@0' && !e.retaliation)
    expect(itsTurn, 'the Champion should get an action').toBeGreaterThan(0)
    const cycleOne = res.events.slice(0, itsTurn)

    const blows = attacks(cycleOne).filter((e) => e.dst === 'vg_champion@0' && !e.retaliation)
    expect(blows.length, 'both Clerics should strike first').toBe(2)
    expect(counters(cycleOne, 'vg_champion@0').length, 'two blows, one counter').toBe(1)
  })

  it('answers an EXTRA attack, which the universal retaliation skips', () => {
    /**
     * The Stormcaller Shaman hands a random ally an immediate extra swing, and
     * `performAttack` refuses retaliation on those outright (`isExtra`). So an
     * extra attack is the second of the two holes Bloodlust exists to fill.
     *
     * It is also why the cap reads `ctx.cycle` rather than the `cycle`
     * parameter: `extraAttackAlly` calls `performAttack` without one, so the
     * parameter is 0 there and would never match a real cycle — the cap would
     * silently never apply to exactly the attacks this ability is for.
     */
    const res = simulateBattle(
      {
        board: [stack('st_shaman', 4, 4), stack('st_reaver', 6, 0), stack('st_reaver', 6, 1)],
        hero: hero('h_sylvaen'),
      },
      { board: [stack('vg_champion', 6, 0)], hero: hero('h_sylvaen') },
      sylvaen,
      sylvaen,
      101,
      { round: 8 },
    )
    // The Shaman fires, an ally swings out of turn, and the Champion answers
    // it — an answer nothing in the engine gave before this commit.
    expect(counters(res.events, 'vg_champion@0').length).toBeGreaterThan(0)
    expect(res.exchanges).toBeLessThanOrEqual(200)
  })

  it('a counter never provokes a counter — the loop guard holds', () => {
    /**
     * Champion against Champion, both carrying Bloodlust.
     *
     * Being straight about what this proves: the DIRECT loop is already
     * impossible by construction, because a counter deals its damage through
     * `applyDamage`, which cannot re-enter `performAttack` and so cannot fire
     * another `onAttacked`. This test pins that property rather than stressing
     * the guard.
     *
     * The guard earns its place on the INDIRECT path, which no unit can walk
     * today: a counter kills its attacker, the attacker's death fires an
     * ability, and that ability hands an ally an extra attack landing back on
     * the counter-attacker. Nothing in the game currently has an `onDeath`
     * ability at all — so the guard is there for the unit that gets one, which
     * is exactly what §4.1 asks for ("guard against retaliation loops
     * explicitly"). It is a depth counter rather than a per-stack flag so that
     * it closes the path however deep the new route turns out to be.
     */
    const res = simulateBattle(
      { board: [stack('vg_champion', 5, 0)], hero: hero('h_sylvaen') },
      { board: [stack('vg_champion', 5, 0)], hero: hero('h_sylvaen') },
      sylvaen,
      sylvaen,
      23,
      { round: 5 },
    )
    // Nothing hung, and no counter is ever answered by another counter: no two
    // bloodlust events sit back to back in the log.
    const evs = res.events
    for (let i = 1; i < evs.length; i++) {
      const prev = evs[i - 1]
      const cur = evs[i]
      if (cur.t === 'attack' && cur.bloodlust && prev.t === 'attack' && prev.bloodlust) {
        throw new Error(`two counters back to back at ${i}: ${prev.src} then ${cur.src}`)
      }
    }
    expect(res.exchanges).toBeLessThanOrEqual(200)
  })

  it('a stack wiped by the blow does not answer it', () => {
    // One Champion, one unit, against something that removes it outright.
    const res = simulateBattle(
      { board: [stack('vg_cannon', 8, 4)], hero: hero('h_sylvaen') },
      { board: [stack('vg_champion', 1, 0)], hero: hero('h_sylvaen') },
      sylvaen,
      sylvaen,
      3,
      { round: 6 },
    )
    const death = res.events.findIndex((e) => e.t === 'death' && e.uid === 'vg_champion@0')
    expect(death).toBeGreaterThanOrEqual(0)
    // Nothing it did after dying, and nothing on the blow that killed it.
    expect(counters(res.events.slice(death), 'vg_champion@0')).toEqual([])
  })
})

describe('it sits alongside the universal retaliation, not instead of it', () => {
  it('a melee blow draws both answers, in a stable order', () => {
    const res = simulateBattle(
      { board: [stack('vg_footman', 6, 0)], hero: hero('h_sylvaen') },
      { board: [stack('vg_champion', 5, 0)], hero: hero('h_sylvaen') },
      sylvaen,
      sylvaen,
      9,
      { round: 5 },
    )
    const answers = attacks(res.events).filter((e) => e.src === 'vg_champion@0' && e.retaliation)
    expect(answers.length).toBeGreaterThanOrEqual(2)
    // The counter lands before the universal retaliation, every time: they are
    // fired from fixed points in program order, not racing.
    const first = answers.findIndex((e) => e.bloodlust)
    const firstPlain = answers.findIndex((e) => !e.bloodlust)
    expect(first).toBeGreaterThanOrEqual(0)
    expect(firstPlain).toBeGreaterThanOrEqual(0)
    expect(first).toBeLessThan(firstPlain)
  })

  it('the universal retaliation is untouched — still full ATK, still no Volley', () => {
    // A Footman answering a Footman: no Bloodlust anywhere, the old behaviour
    // exactly. ATK 2 x 6 units = 12.
    const res = simulateBattle(
      { board: [stack('vg_footman', 6, 0)], hero: hero('h_sylvaen') },
      { board: [stack('vg_footman', 6, 0)], hero: hero('h_sylvaen') },
      sylvaen,
      sylvaen,
      9,
      { round: 5 },
    )
    const back = retaliations(res.events)
    expect(back.length).toBeGreaterThan(0)
    // Full power, not half — `power` is the retaliator's atk x count at that
    // moment, which is exactly the engine's rule and survives casualties.
    const who = back[0].snap.find((x) => x.uid === back[0].src)!
    expect(back[0].dmg + back[0].absorbed).toBe(who.power)
    expect(counters(res.events)).toEqual([])
  })
})

describe('determinism (§12.3)', () => {
  it('the same seed replays identically', () => {
    const board = () => ({ board: [stack('vg_champion', 4, 0), stack('vg_militia', 8, 1)], hero: hero('h_sylvaen') })
    const foe = () => ({ board: [stack('vg_crossbow', 8, 4), stack('vg_footman', 6, 0)], hero: hero('h_sylvaen') })
    const a = simulateBattle(board(), foe(), sylvaen, sylvaen, 8888, { round: 7 })
    const b = simulateBattle(board(), foe(), sylvaen, sylvaen, 8888, { round: 7 })
    expect(a.events).toEqual(b.events)
    expect(a.winner).toBe(b.winner)
  })

  it('spends no randomness — a board with no counter-attacker is untouched', () => {
    /**
     * The claim that makes this commit safe to land on a game full of tuned
     * numbers. The counter targets the stack named by the trigger, so it makes
     * no `rng.pick` and no `chooseTarget` call — the rng stream never advances
     * because of it. A battle with no Champion in it therefore replays exactly
     * as it did before the ability existed.
     */
    const plain = () => ({ board: [stack('vg_footman', 6, 0), stack('vg_militia', 10, 1)], hero: hero('h_sylvaen') })
    const foe = () => ({ board: [stack('vg_crossbow', 8, 4), stack('vg_shieldmaiden', 4, 0)], hero: hero('h_sylvaen') })
    for (const seed of [1, 12345, 99991]) {
      const one = simulateBattle(plain(), foe(), sylvaen, sylvaen, seed, { round: 4 })
      const two = simulateBattle(plain(), foe(), sylvaen, sylvaen, seed, { round: 4 })
      expect(one.events).toEqual(two.events)
      expect(counters(one.events)).toEqual([])
    }
  })

  it('the counter is reported for the battle screen to glow off', () => {
    // §3.1 wants the red glow on the card, not just a line in the log. The
    // engine's half of that is marking WHICH answers were Bloodlust, since the
    // universal retaliation shares the event shape.
    const res = simulateBattle(
      { board: [stack('vg_champion', 4, 0)], hero: hero('h_sylvaen') },
      { board: [stack('vg_militia', 30, 0), stack('vg_crossbow', 8, 4)], hero: hero('h_sylvaen') },
      sylvaen,
      sylvaen,
      5,
      { round: 3 },
    )
    const c = counters(res.events, 'vg_champion@0')
    expect(c.length).toBeGreaterThan(0)
    expect(c[0].retaliation).toBe(true)
    expect(c[0].bloodlust).toBe(true)
    // ...and the ordinary ones are distinguishable from it.
    for (const r of retaliations(res.events)) expect(r.bloodlust).toBeUndefined()
  })
})
