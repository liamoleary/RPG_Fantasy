import { describe, expect, it } from 'vitest'
import { WAR_BANKS, newRun, player, resolveBattles, type Warlord } from '../src/engine/run'
import type { BoardStack } from '../src/engine/battle'
import { FRONT_SLOTS } from '../src/engine/battle'

/**
 * The war banks (feat/balance-01).
 *
 * Growth used to be the only mechanic in the game that banked permanent power,
 * and one faction owned it: measured over 300 lobbies, Verdant carried ~1958
 * points of permanent bonus by round 14 against exactly 0 for Vanguard and
 * Stormtide, and four times Vanguard's board power. Ablation showed why
 * tuning could not fix it — quadrupling Bulwark bought Vanguard 0.51 places
 * and quadrupling Frenzy bought Stormtide 0.26, while deleting Growth
 * outright bought 0.70. The mechanics on two of three factions were inert.
 *
 * So all three factions bank, each on its own trigger. What these tests hold
 * is the *trigger*, not the rate — rates are the harness's to tune, and it
 * will keep tuning them. A trigger that silently stops firing is the failure
 * that would not show up as a test failure anywhere else.
 */
const stack = (unitId: string, count: number, slot: number, uid: string): BoardStack => ({
  uid,
  unitId,
  count,
  slot,
  bonusAtk: 0,
  bonusHp: 0,
  growthTicks: 0,
  spent: 0,
  rank: 0,
})

/** A lobby where the player is `factionId`, with a board we control. */
function runWith(factionId: 'vanguard' | 'stormtide' | 'verdant', heroId: string, seed: number, board: BoardStack[]) {
  const run = newRun({ seed, factionId, heroId, difficulty: 'standard' })
  player(run).board = board
  return run
}

const survivorsOf = (run: ReturnType<typeof newRun>, uid: string) =>
  run.reports.flatMap((r) => [...r.result.survivorsA, ...r.result.survivorsB]).find((s) => s.uid === uid)

const bankedOn = (p: Warlord, uid: string) => {
  const s = p.board.find((x) => x.uid === uid)!
  return { atk: s.bonusAtk, hp: s.bonusHp }
}

describe('war banks — the configuration', () => {
  it('gives Vanguard and Stormtide a bank, and leaves Verdant to the Growth keyword', () => {
    expect(WAR_BANKS.vanguard.trigger).toBe('held')
    expect(WAR_BANKS.stormtide.trigger).toBe('stood')
    // Verdant already banks through Growth; a second source would double-dip.
    expect(WAR_BANKS.verdant).toBeUndefined()
  })

  it('banks something on every faction that has one', () => {
    for (const [id, bank] of Object.entries(WAR_BANKS)) {
      expect(bank.atk + bank.hp, `${id} banks nothing, so its mechanic is inert again`).toBeGreaterThan(0)
    }
  })
})

describe('Vanguard — the wall thickens', () => {
  it('banks on a front-row stack that held the line', () => {
    const run = runWith('vanguard', 'h_berrik', 3, [stack('vg_footman', 12, 0, 'front')])
    resolveBattles(run)
    const survived = survivorsOf(run, 'front')
    expect(survived?.count, 'fixture must survive for this to test anything').toBeGreaterThan(0)
    expect(bankedOn(player(run), 'front')).toEqual({ atk: WAR_BANKS.vanguard.atk, hp: WAR_BANKS.vanguard.hp })
  })

  it('banks nothing on a back-row stack, however well it did', () => {
    const board = [stack('vg_footman', 12, 0, 'front'), stack('vg_crossbow', 10, FRONT_SLOTS, 'back')]
    const run = runWith('vanguard', 'h_berrik', 3, board)
    resolveBattles(run)
    const back = survivorsOf(run, 'back')
    expect(back?.count, 'fixture must survive for this to test anything').toBeGreaterThan(0)
    // The line it held is the point; archers behind it did not hold anything.
    expect(bankedOn(player(run), 'back')).toEqual({ atk: 0, hp: 0 })
  })
})

describe('Stormtide — blood remembers', () => {
  it('banks on any stack that walked off the field', () => {
    const run = runWith('stormtide', 'h_grommash', 3, [stack('st_raider', 12, 0, 'raiders')])
    resolveBattles(run)
    const survived = survivorsOf(run, 'raiders')
    expect(survived?.count, 'fixture must survive for this to test anything').toBeGreaterThan(0)
    expect(bankedOn(player(run), 'raiders')).toEqual({ atk: WAR_BANKS.stormtide.atk, hp: WAR_BANKS.stormtide.hp })
  })

  /**
   * The trigger was 'bled' — took casualties AND survived — which reads well
   * and measured 1.5 places worse, because it stops firing exactly when you
   * are losing. A comeback mechanic that needs you to be winning is not one.
   */
  it('banks on a stack that came through clean, not only a bloodied one', () => {
    // Deliberately unkillable, so the bank is measured as a delta off the
    // padding rather than as an absolute.
    const run = runWith('stormtide', 'h_grommash', 31, [
      { ...stack('st_raider', 12, 0, 'unhurt'), bonusAtk: 20, bonusHp: 40 },
    ])
    resolveBattles(run)
    expect(survivorsOf(run, 'unhurt')?.count, 'the fixture is deliberately unkillable').toBe(12)
    expect(bankedOn(player(run), 'unhurt').atk - 20).toBe(WAR_BANKS.stormtide.atk)
  })
})

describe('war banks — what they must never do', () => {
  /* There is deliberately no test for the ghost guard below. `bankWarSpoils`
     skips a pairing's B side when it is a ghost, mirroring `growSurvivors` —
     but the guard has no observable effect: a warlord's board is snapshotted
     into run.ghostBoards at elimination and never read from the warlord again,
     so banking onto the dead changes nothing anyone can see. Three attempts at
     a test for it all passed with the guard deleted, which is worse than no
     test. The guard stays because it is correct and symmetric; the coverage
     claim does not. */

  it('is deterministic for a seed — the same lobby banks the same amount twice', () => {
    const bankTotal = () => {
      const run = runWith('vanguard', 'h_berrik', 909, [
        stack('vg_footman', 12, 0, 'a'),
        stack('vg_shieldmaiden', 8, 1, 'b'),
      ])
      resolveBattles(run)
      return player(run).board.reduce((n, s) => n + s.bonusAtk + s.bonusHp, 0)
    }
    expect(bankTotal()).toBe(bankTotal())
  })
})

/**
 * The faction picker prints these numbers, so they have to be the numbers the
 * engine uses. Rates get tuned; text does not get re-read. This is the cheap
 * guard against the game quietly lying to a player about its own mechanic.
 */
describe('war banks — the text matches the config', () => {
  it('prints the rate each faction actually banks', async () => {
    const { FACTION_BY_ID } = await import('../src/data/index')
    for (const [id, bank] of Object.entries(WAR_BANKS)) {
      const text = FACTION_BY_ID.get(id as never)?.mechanicText ?? ''
      expect(text, `${id} never mentions its bank`).toMatch(/for the rest of the run/)
      expect(text, `${id} text does not print +${bank.atk} ATK`).toContain(`+${bank.atk} ATK`)
      expect(text, `${id} text does not print +${bank.hp} HP`).toContain(`+${bank.hp} HP`)
    }
  })
})
