import { describe, expect, it } from 'vitest'
import { HERO_BY_ID, unit } from '../src/data/index'
import { ZERO_MODS } from '../src/data/types'
import { simulateBattle, type BattleEvent, type BoardStack, type HeroState } from '../src/engine/battle'
import { beginRound, newRun } from '../src/engine/run'

/**
 * The DN11 riders (§2.2, §2.3). Four units shipped in commit 2 carrying only
 * their bodies, because each signature effect needed a kind the engine did not
 * have. These are those kinds — added to the closed effect table the way boons
 * and Banner Ranks already work, so which unit uses one, and how big it is,
 * stays data.
 */

const sylvaen = HERO_BY_ID.get('h_sylvaen')!
const zhala = HERO_BY_ID.get('h_zhala')!

function stack(unitId: string, count: number, slot: number, extra: Partial<BoardStack> = {}): BoardStack {
  return { uid: `${unitId}@${slot}`, unitId, count, slot, bonusAtk: 0, bonusHp: 0, growthTicks: 0, spent: 3, rank: 0, ...extra }
}
function hero(id: string): HeroState {
  return { heroId: id, name: id, factionId: 'vanguard', level: 1, mods: { ...ZERO_MODS } }
}
const buffs = (evs: BattleEvent[], text: string) =>
  evs.filter((e): e is Extract<BattleEvent, { t: 'buff' }> => e.t === 'buff' && e.text === text)
const attacks = (evs: BattleEvent[], src: string) =>
  evs.filter((e): e is Extract<BattleEvent, { t: 'attack' }> => e.t === 'attack' && e.src === src)

const wall = (n = 30) => ({
  board: [stack('vg_mule', n, 0), stack('vg_mule', n, 1), stack('vg_mule', n, 4), stack('vg_mule', n, 5)],
  hero: hero('h_sylvaen'),
})

describe('allyBulwark — one shield, not the whole board (§2.2)', () => {
  const smithBoard = () => ({
    board: [stack('vg_runesmith', 3, 4), stack('vg_militia', 6, 0), stack('vg_footman', 6, 1)],
    hero: hero('h_sylvaen'),
  })

  it('the Runesmith finds the ally with the least Bulwark', () => {
    // Militia carry none, Footmen carry 1 — so the +2 must land on the Militia.
    const res = simulateBattle(smithBoard(), wall(), sylvaen, sylvaen, 5, { round: 1 })
    const b = buffs(res.events, '+2 Bulwark')
    expect(b.length).toBeGreaterThan(0)
    expect(b[0].uids).toEqual(['vg_militia@0'])
  })

  it('grants to exactly one stack, never the board', () => {
    const res = simulateBattle(smithBoard(), wall(), sylvaen, sylvaen, 5, { round: 1 })
    for (const b of buffs(res.events, '+2 Bulwark')) expect(b.uids).toHaveLength(1)
  })

  it('the Apprentice picks a FRONT-line ally, never a back-row one', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const res = simulateBattle(
        {
          board: [stack('vg_apprentice', 3, 5), stack('vg_militia', 6, 0), stack('vg_footman', 6, 1), stack('vg_crossbow', 4, 4)],
          hero: hero('h_sylvaen'),
        },
        wall(),
        sylvaen,
        sylvaen,
        seed,
        { round: 1 },
      )
      const b = buffs(res.events, '+1 Bulwark')
      expect(b.length).toBeGreaterThan(0)
      for (const uid of b[0].uids) expect(['vg_militia@0', 'vg_footman@1']).toContain(uid)
    }
  })

  it('is seeded — the same board and seed pick the same shield twice', () => {
    const go = () =>
      buffs(
        simulateBattle(
          { board: [stack('vg_apprentice', 3, 5), stack('vg_militia', 6, 0), stack('vg_footman', 6, 1)], hero: hero('h_sylvaen') },
          wall(),
          sylvaen,
          sylvaen,
          77,
          { round: 1 },
        ).events,
        '+1 Bulwark',
      )[0].uids
    expect(go()).toEqual(go())
  })
})

describe('adjacentHpPerGrowth — the wall that remembers (§2.2)', () => {
  it('pays its neighbours one HP per Growth tick it carries', () => {
    const res = simulateBattle(
      { board: [stack('vd_oakheart', 2, 1, { growthTicks: 4 }), stack('vg_militia', 6, 0)], hero: hero('h_sylvaen') },
      wall(),
      sylvaen,
      sylvaen,
      9,
      { round: 1 },
    )
    const b = buffs(res.events, '+4 HP')
    expect(b.length).toBeGreaterThan(0)
    expect(b[0].uids).toEqual(['vg_militia@0'])
  })

  it('pays nothing on a stack that has never grown', () => {
    const res = simulateBattle(
      { board: [stack('vd_oakheart', 2, 1, { growthTicks: 0 }), stack('vg_militia', 6, 0)], hero: hero('h_sylvaen') },
      wall(),
      sylvaen,
      sylvaen,
      9,
      { round: 1 },
    )
    expect(res.events.filter((e) => e.t === 'buff' && e.text.endsWith(' HP'))).toHaveLength(0)
  })

  it('reaches only the stacks beside it, not the whole row', () => {
    const res = simulateBattle(
      {
        board: [stack('vd_oakheart', 2, 1, { growthTicks: 3 }), stack('vg_militia', 6, 0), stack('vg_footman', 6, 3)],
        hero: hero('h_sylvaen'),
      },
      wall(),
      sylvaen,
      sylvaen,
      9,
      { round: 1 },
    )
    const b = buffs(res.events, '+3 HP')
    expect(b.length).toBeGreaterThan(0)
    expect(b[0].uids).toEqual(['vg_militia@0'])
  })
})

describe('splitNextAttack — chain lightning (§2.2)', () => {
  const wyvernFight = () =>
    simulateBattle(
      { board: [stack('st_wyvern', 4, 4)], hero: hero('h_zhala') },
      { board: [stack('vg_militia', 8, 0), stack('vg_militia', 8, 1)], hero: hero('h_sylvaen') },
      zhala,
      sylvaen,
      13,
      { round: 1 },
    )

  it('arms after casualties and divides the next attack across two stacks', () => {
    const res = wyvernFight()
    const split = res.events.filter((e) => e.t === 'buff' && e.text === 'Splits ×2')
    expect(split.length).toBeGreaterThan(0)
    const idx = res.events.indexOf(split[0])
    expect(attacks(res.events.slice(idx), 'st_wyvern@4').length).toBeGreaterThanOrEqual(2)
  })

  it('spreads one swing rather than repeating it at full strength', () => {
    const res = wyvernFight()
    const split = res.events.filter((e) => e.t === 'buff' && e.text === 'Splits ×2')
    const idx = res.events.indexOf(split[0])
    const before = attacks(res.events.slice(0, idx), 'st_wyvern@4')
    const after = attacks(res.events.slice(idx), 'st_wyvern@4').slice(0, 2)
    expect(after).toHaveLength(2)
    expect(before.length).toBeGreaterThan(0)
    const unsplit = before[0].dmg + before[0].absorbed
    const prong = after[0].dmg + after[0].absorbed
    expect(prong).toBeLessThan(unsplit)
  })

  it('is spent on one attack — it does not keep splitting for free', () => {
    const res = wyvernFight()
    const armed = res.events.filter((e) => e.t === 'buff' && e.text === 'Splits ×2').length
    const swings = attacks(res.events, 'st_wyvern@4').length
    // Every prong beyond the first belongs to an arming, so extra prongs can
    // never outnumber the times the split was actually charged.
    expect(swings).toBeLessThanOrEqual(armed * 2 + res.exchanges)
  })
})

describe('allyFrenzy — the Windspeaker quickens whoever bled (§2.3)', () => {
  it('grants Initiative to the stack that triggered Frenzy, not to itself', () => {
    const res = simulateBattle(
      { board: [stack('st_windspeaker', 2, 4), stack('st_raider', 8, 0)], hero: hero('h_zhala') },
      { board: [stack('vg_militia', 10, 0), stack('vg_footman', 8, 1)], hero: hero('h_sylvaen') },
      zhala,
      sylvaen,
      21,
      { round: 1 },
    )
    const init = buffs(res.events, '+1 Init')
    expect(init.length).toBeGreaterThan(0)
    expect(init[0].uids).toEqual(['st_raider@0'])
  })

  it('grants nothing when no friendly stack ever frenzies', () => {
    const res = simulateBattle(
      { board: [stack('st_windspeaker', 2, 4)], hero: hero('h_zhala') },
      { board: [stack('vg_mule', 40, 0)], hero: hero('h_sylvaen') },
      zhala,
      sylvaen,
      4,
      { round: 1 },
    )
    expect(buffs(res.events, '+1 Init')).toHaveLength(0)
  })
})

describe('growthVenom — the thorns sharpen (§2.2)', () => {
  it('is declared on the Reaper and nowhere else in the line', () => {
    expect(unit('vd_reaper').growthVenom).toEqual({ x: 1, cap: 5 })
    expect(unit('vd_blackthorn').growthVenom).toBeUndefined()
    expect(unit('vd_whisperseed').growthVenom).toBeUndefined()
  })

  /**
   * Driven through real Musters rather than by poking the field: the cap has to
   * hold against the loop that actually runs.
   */
  it('accumulates at Muster and never passes the form’s total cap', () => {
    const run = newRun({ seed: 4242, factionId: 'verdant', heroId: 'h_sylvaen', difficulty: 'standard' })
    const p = run.warlords.find((w) => w.isPlayer)!
    p.board = [stack('vd_reaper', 2, 0)]
    const base = unit('vd_reaper').keywords.find((k) => k.k === 'venom')!.x!
    const headroom = unit('vd_reaper').growthVenom!.cap - base

    let last = 0
    for (let i = 0; i < 10; i++) {
      run.round += 1
      beginRound(run)
      const now = p.board[0].bonusVenom ?? 0
      expect(now).toBeGreaterThanOrEqual(last)
      expect(now).toBeLessThanOrEqual(headroom)
      last = now
    }
    expect(last).toBe(headroom)
  })

  it('carries the earned Venom into battle on top of the printed keyword', () => {
    const venomOf = (evs: BattleEvent[]) =>
      evs.filter((e): e is Extract<BattleEvent, { t: 'venom' }> => e.t === 'venom')[0]?.units ?? 0
    const fight = (bonusVenom?: number) =>
      simulateBattle(
        { board: [stack('vd_reaper', 3, 0, bonusVenom === undefined ? {} : { bonusVenom })], hero: hero('h_sylvaen') },
        wall(),
        sylvaen,
        sylvaen,
        6,
        { round: 1 },
      )
    expect(venomOf(fight(3).events)).toBe(venomOf(fight().events) + 3)
  })

  it('a stack with no earned Venom fights exactly as it did before DN11', () => {
    const a = simulateBattle({ board: [stack('vd_reaper', 3, 0)], hero: hero('h_sylvaen') }, wall(), sylvaen, sylvaen, 6, { round: 1 })
    const b = simulateBattle(
      { board: [stack('vd_reaper', 3, 0, { bonusVenom: 0 })], hero: hero('h_sylvaen') },
      wall(),
      sylvaen,
      sylvaen,
      6,
      { round: 1 },
    )
    expect(a.events.length).toBe(b.events.length)
    expect(a.winner).toBe(b.winner)
  })
})
