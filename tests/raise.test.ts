import { describe, expect, it } from 'vitest'
import { ALL_UNITS, HERO_BY_ID, unit } from '../src/data/index'
import { ZERO_MODS } from '../src/data/types'
import { simulateBattle, type BattleEvent, type BoardStack, type HeroState } from '../src/engine/battle'
import { KEYWORD_GLOSSARY } from '../src/ui/keywords'

/**
 * Raise (Design Notes 12 §4.2) and the Bannerguard's Paladin kit (§3.2).
 *
 * §3.2 resolved this as a TRUE raise rather than a save, and the reason is
 * Marshal Yseult: her Last Stand already keeps a stack from falling, so a
 * second save would have been her passive wearing a different hat. Coming back
 * *after* the stack is gone is a different effect that stacks with her
 * cleanly — and the note asks for a test of the pair, which is the third
 * describe below.
 *
 * The engine risk is smaller than it looks but sharper: a raise puts a stack
 * back mid-cycle, which means the battle's own "is anybody still standing?"
 * check has to see it. Raising the last stack on a side must un-end the
 * battle, not leave a corpse holding the field.
 */

const sylvaen = HERO_BY_ID.get('h_sylvaen')!
const yseult = HERO_BY_ID.get('h_yseult')!
const grommash = HERO_BY_ID.get('h_grommash')!

function stack(unitId: string, count: number, slot: number, extra: Partial<BoardStack> = {}): BoardStack {
  return { uid: `${unitId}@${slot}`, unitId, count, slot, bonusAtk: 0, bonusHp: 0, growthTicks: 0, spent: 3, rank: 0, ...extra }
}
function hero(id: string, factionId: 'vanguard' | 'stormtide' = 'vanguard'): HeroState {
  return { heroId: id, name: id, factionId, level: 1, mods: { ...ZERO_MODS } }
}

type Raise = Extract<BattleEvent, { t: 'raise' }>
type Death = Extract<BattleEvent, { t: 'death' }>
type LastStand = Extract<BattleEvent, { t: 'lastStand' }>
const raises = (evs: BattleEvent[]): Raise[] => evs.filter((e): e is Raise => e.t === 'raise')
const deaths = (evs: BattleEvent[]): Death[] => evs.filter((e): e is Death => e.t === 'death')
const lastStands = (evs: BattleEvent[]): LastStand[] => evs.filter((e): e is LastStand => e.t === 'lastStand')
const allHeals = (evs: BattleEvent[]) =>
  evs.filter((e): e is Extract<BattleEvent, { t: 'heal' }> => e.t === 'heal')

/** Enough Stormtide axes to actually wipe things, on a hero with no save. */
const killers = (n = 12) => ({
  board: [stack('st_reaver', n, 0), stack('st_reaver', n, 1)],
  hero: hero('h_grommash', 'stormtide'),
})

describe('the Paladin kit is data (§3.2)', () => {
  it('the Bannerguard carries one Raise and a periodic heal', () => {
    const def = unit('vg_bannerguard')
    expect(def.keywords.find((k) => k.k === 'raise')?.x).toBe(1)
    expect(def.ability?.trigger).toBe('everyExchange')
    expect(def.ability?.effect).toEqual({ type: 'healLowest', x: 2 })
  })

  it('reuses the Battle Cleric’s shape, and stays under its cadence', () => {
    // §3.2 says to reuse the Cleric's shape because the maths is understood.
    // Reused shape, deliberately slower: the Bannerguard gets a Raise too.
    const cleric = unit('vg_cleric').ability!
    const guard = unit('vg_bannerguard').ability!
    expect(guard.effect.type).toBe(cleric.effect.type)
    expect(guard.everyN!).toBeGreaterThan(cleric.everyN!)
  })

  it('and nothing else in the game raises yet', () => {
    const carriers = ALL_UNITS.filter((u) => u.keywords.some((k) => k.k === 'raise')).map((u) => u.id)
    expect(carriers).toEqual(['vg_bannerguard'])
  })

  it('actually heals on the field', () => {
    /**
     * Measured against a control rather than by looking for the Bannerguard's
     * uid on the event: `healStack` only stamps a `src` when the healer and
     * the healed are different stacks, and a front-row Paladin taking the
     * blows is usually its own most-wounded ally. So the evidence is the
     * difference a Footman-shaped hole in the same board does not produce.
     */
    const foe = () => ({ board: [stack('vg_footman', 10, 0), stack('vg_footman', 10, 1)], hero: hero('h_sylvaen') })
    const paladin = () => ({ board: [stack('vg_bannerguard', 4, 0), stack('vg_militia', 14, 1)], hero: hero('h_sylvaen') })
    const control = () => ({ board: [stack('vg_footman', 4, 0), stack('vg_militia', 14, 1)], hero: hero('h_sylvaen') })

    for (const seed of [5, 21, 99]) {
      const withIt = simulateBattle(paladin(), foe(), sylvaen, sylvaen, seed, { round: 6 })
      const without = simulateBattle(control(), foe(), sylvaen, sylvaen, seed, { round: 6 })
      expect(allHeals(withIt.events).length, `seed ${seed}`).toBeGreaterThan(allHeals(without.events).length)
    }
  })
})

describe('a wiped stack comes back at 1 unit', () => {
  /** The Militia are there to be killed; the Bannerguard is there to answer. */
  const paladinBoard = () => ({
    board: [stack('vg_militia', 4, 0), stack('vg_bannerguard', 5, 1)],
    hero: hero('h_sylvaen'),
  })

  it('raises the fallen ally, once, and reports who did it', () => {
    const res = simulateBattle(paladinBoard(), killers(), sylvaen, grommash, 21, { round: 6 })
    const r = raises(res.events)
    expect(r.length).toBe(1)
    expect(r[0].by).toBe('vg_bannerguard@1')
    expect(r[0].uid).toBe('vg_militia@0')
    expect(r[0].left).toBe(0)
  })

  it('puts it back at exactly 1 unit, alive, after its death was logged', () => {
    const res = simulateBattle(paladinBoard(), killers(), sylvaen, grommash, 21, { round: 6 })
    const r = raises(res.events)[0]
    const back = r.snap.find((s) => s.uid === 'vg_militia@0')!
    expect(back.alive).toBe(true)
    expect(back.count).toBe(1)

    // The death is logged first: the stack really fell, and was then hauled up.
    // That ordering is the difference between this and a save, on the board and
    // in the log both.
    const deathAt = res.events.findIndex((e) => e.t === 'death' && e.uid === 'vg_militia@0')
    const raiseAt = res.events.findIndex((e) => e.t === 'raise')
    expect(deathAt).toBeGreaterThanOrEqual(0)
    expect(raiseAt).toBeGreaterThan(deathAt)
  })

  it('spends the charge — a second wipe stays dead', () => {
    // One Paladin, one charge, and a Militia stack beaten down twice over. The
    // controlled board from the slot test is reused because it guarantees the
    // Militia is the only thing that dies, so "died twice, raised once" is a
    // statement about the charge rather than about who the axes found.
    const one = () => ({
      board: [stack('vg_bannerguard', 6, 0), stack('vg_militia', 1, 2)],
      hero: hero('h_sylvaen'),
    })
    // Eight Champions rather than three: Bulwark 2 x 8 soaks the Paladin's
    // whole swing, so it is still standing on the second cycle to kill the
    // Militia a second time. A smaller one dies first and proves nothing.
    const champion = () => ({ board: [stack('vg_champion', 8, 2)], hero: hero('h_sylvaen') })
    const res = simulateBattle(one(), champion(), sylvaen, sylvaen, 33, { round: 8 })

    const militiaDeaths = deaths(res.events).filter((d) => d.uid === 'vg_militia@2')
    expect(militiaDeaths.length, 'the Militia must fall twice for this to mean anything').toBeGreaterThan(1)
    expect(raises(res.events).length).toBe(1)
  })

  it('cannot raise itself — it is the one on the floor', () => {
    // A lone Bannerguard, wiped. Nobody left holding a charge, so it stays down.
    const res = simulateBattle(
      { board: [stack('vg_bannerguard', 1, 0)], hero: hero('h_sylvaen') },
      killers(30),
      sylvaen,
      grommash,
      7,
      { round: 10 },
    )
    expect(deaths(res.events).some((d) => d.uid === 'vg_bannerguard@0')).toBe(true)
    expect(raises(res.events)).toEqual([])
  })

  it('un-ends the battle when the raised stack was the last one standing', () => {
    /**
     * The sharp edge. `onDeath` runs inside another stack's action, and the
     * loop's "is anybody still alive?" check runs at the top of the next one —
     * so a stack put back mid-cycle has to be visible to it. If it were not,
     * the side would be declared wiped while one of its stacks is on the field.
     */
    // A lone Militia with one Paladin behind it. When the Militia falls the
    // side is momentarily empty of everything but the Bannerguard; when the
    // Bannerguard falls with the Militia already gone, the raise is the only
    // thing keeping the side on the field at all.
    const res = simulateBattle(
      { board: [stack('vg_bannerguard', 6, 0), stack('vg_militia', 1, 2)], hero: hero('h_sylvaen') },
      { board: [stack('vg_champion', 3, 2)], hero: hero('h_sylvaen') },
      sylvaen,
      sylvaen,
      99,
      { round: 6 },
    )
    const r = raises(res.events)
    expect(r.length).toBe(1)

    // The raised stack is on the board after the raise, and the battle kept
    // going: there are events after it, and the log does not end at the death.
    const raiseAt = res.events.indexOf(r[0])
    expect(res.events.length).toBeGreaterThan(raiseAt + 1)
    expect(r[0].snap.find((s) => s.uid === r[0].uid)!.alive).toBe(true)

    // And the outcome is self-consistent: nobody is declared wiped while the
    // result still lists survivors for them.
    if (res.winner === 'b') expect(res.survivorsA).toEqual([])
    if (res.winner === 'a') expect(res.survivorsB).toEqual([])
  })
})

describe('with Marshal Yseult — a save and a raise are different effects (§3.2)', () => {
  /**
   * Her Last Stand is x: 2 — "the first two times each battle a friendly stack
   * would be wiped, it survives with 1 unit". It fires inside `applyDamage`
   * and stops the wipe happening at all, so `onDeath` never runs and the
   * Bannerguard's charge is never touched. It takes THREE wipes to see both.
   */
  const together = () => ({
    board: [
      stack('vg_militia', 3, 0),
      stack('vg_crossbow', 3, 4),
      stack('vg_mule', 2, 5),
      stack('vg_bannerguard', 6, 1),
    ],
    hero: hero('h_yseult'),
  })

  it('Yseult’s x is 2, so the pair is only visible past the third wipe', () => {
    expect(HERO_BY_ID.get('h_yseult')!.passive.id).toBe('lastStand')
    expect(HERO_BY_ID.get('h_yseult')!.passive.x).toBe(2)
  })

  it('a stack she saves is never wiped, so it never draws a raise', () => {
    /**
     * The mechanism, stated as an invariant over the whole log: a Last Stand
     * happens INSIDE applyDamage and stops the wipe, so no `death` is ever
     * logged for it — and a raise answers a `death`. So every raised stack
     * must have a death of its own earlier in the log, and no raise may sit
     * immediately after a save, which would mean one wipe produced both.
     */
    const res = simulateBattle(together(), killers(10), yseult, grommash, 2, { round: 9 })
    expect(lastStands(res.events).length).toBeGreaterThan(0)
    expect(raises(res.events).length).toBeGreaterThan(0)

    for (const r of raises(res.events)) {
      const at = res.events.indexOf(r)
      const deathOfIt = res.events
        .slice(0, at)
        .filter((e): e is Death => e.t === 'death' && e.uid === r.uid)
      expect(deathOfIt.length, `${r.uid} was raised without ever dying`).toBeGreaterThan(0)
      expect(res.events[at - 1]?.t, 'a save and a raise answered the same wipe').not.toBe('lastStand')
    }
  })

  it('both fire in the same battle — the pair is additive, not overlapping', () => {
    /**
     * The claim §3.2 makes, measured directly: BOTH of her saves land AND the
     * Bannerguard's raise lands, in one battle. If the raise were a save in
     * disguise they would compete for the same moments; instead her two go
     * first, and the raise answers a death she had nothing left to prevent.
     *
     * Deliberately not measured by comparing exchange counts against a
     * different hero — the heroes have different SPELLS, so that comparison
     * is not power-matched and says nothing about the passives.
     */
    const res = simulateBattle(together(), killers(10), yseult, grommash, 2, { round: 9 })
    expect(lastStands(res.events).length).toBe(2)
    const r = raises(res.events)
    expect(r.length).toBe(1)
    // The charge was spent by a real death, not nibbled at by her saves.
    expect(r[0].left).toBe(0)
    expect(r[0].by).toBe('vg_bannerguard@1')

    // Her saves come first: she cannot decline to save in order to leave a
    // death for the Paladin, so every Last Stand precedes the raise.
    const raiseAt = res.events.findIndex((e) => e.t === 'raise')
    for (const ls of lastStands(res.events)) {
      expect(res.events.indexOf(ls)).toBeLessThan(raiseAt)
    }
  })
})

describe('determinism (§12.3)', () => {
  const board = () => ({
    board: [stack('vg_militia', 4, 0), stack('vg_bannerguard', 5, 1)],
    hero: hero('h_yseult'),
  })

  it('the same seed replays identically', () => {
    const a = simulateBattle(board(), killers(), yseult, grommash, 31337, { round: 7 })
    const b = simulateBattle(board(), killers(), yseult, grommash, 31337, { round: 7 })
    expect(a.events).toEqual(b.events)
    expect(a.winner).toBe(b.winner)
  })

  it('draws no randomness — the raiser is picked by slot, never by roll', () => {
    /**
     * Two Bannerguards, both alive and both holding a charge when the Militia
     * falls. The lower slot answers, on every seed — if this were an
     * `rng.pick` the seeds would disagree, and every board in the game would
     * have shifted underneath it.
     *
     * The Champion is the attacker because it outruns both Paladins on
     * Initiative (5 to 4) and mirrors onto column 2, so the Militia is the
     * only stack that ever dies. A heavier attacker kills a Bannerguard by
     * retaliation first, and then "the lowest slot" is a different question.
     */
    const twoPaladins = () => ({
      board: [stack('vg_bannerguard', 6, 0), stack('vg_bannerguard', 6, 1), stack('vg_militia', 1, 2)],
      hero: hero('h_sylvaen'),
    })
    const champion = () => ({ board: [stack('vg_champion', 3, 2)], hero: hero('h_sylvaen') })

    for (const seed of [1, 12345, 99991, 4242, 7, 31337, 555]) {
      const res = simulateBattle(twoPaladins(), champion(), sylvaen, sylvaen, seed, { round: 8 })
      const r = raises(res.events)
      expect(r.length, `seed ${seed}`).toBe(1)
      expect(r[0].uid).toBe('vg_militia@2')
      expect(r[0].by, `seed ${seed} picked a different raiser`).toBe('vg_bannerguard@0')
    }
  })

  it('two Paladins haul each other up, lower slot first', () => {
    /**
     * Found while writing these tests rather than designed: a Bannerguard that
     * is raised comes back with its OWN charge unspent, so a pair can answer
     * for each other. Pinned because it is a real consequence of charges being
     * per-stack, and because the day someone makes the charge per-side this is
     * the test that asks whether that was deliberate.
     */
    const pair = () => ({
      board: [stack('vg_militia', 3, 2), stack('vg_bannerguard', 5, 1), stack('vg_bannerguard', 5, 0)],
      hero: hero('h_sylvaen'),
    })
    const res = simulateBattle(pair(), killers(16), sylvaen, grommash, 1, { round: 8 })
    const r = raises(res.events)
    expect(r.length).toBe(2)
    // Each answered for the other, and each spent its own single charge.
    expect(r[0].uid).toBe('vg_bannerguard@1')
    expect(r[0].by).toBe('vg_bannerguard@0')
    expect(r[1].uid).toBe('vg_bannerguard@0')
    expect(r[1].by).toBe('vg_bannerguard@1')
    expect(r.every((x) => x.left === 0)).toBe(true)
  })
})

describe('the Glossary tells Raise from Last Stand', () => {
  const entry = (id: string) => KEYWORD_GLOSSARY.find((k) => k.id === id)

  it('ships Raise as its own entry that names Yseult’s passive', () => {
    // Same discipline as Deflect vs Bulwark: the confusion is between the two,
    // so a definition that never mentions its twin has not done the job.
    expect(entry('raise')?.name).toBe('Raise')
    expect(entry('raise')?.text).toMatch(/Last Stand/)
  })

  it('states the difference that matters: before falling, versus after', () => {
    const text = entry('raise')!.text
    expect(text).toMatch(/after/i)
    expect(text).toMatch(/wiped out/i)
  })
})
