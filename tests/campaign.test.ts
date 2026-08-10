import { describe, expect, it } from 'vitest'
import {
  START_HP,
  advanceRound,
  campaignRound,
  canMarchOn,
  lobbySeedFor,
  marchOn,
  marchedWarband,
  newRun,
  player,
  resolveBattles,
  startingHp,
  type RunState,
  type Warlord,
} from '../src/engine/run'
import { MAX_TALENT_POINTS } from '../src/engine/talents'
import { INTERLUDE_TALENT_POINTS, stipendFor } from '../src/data/arrival'
import { modsForTier } from '../src/data/tiers'

/**
 * The Long March (DN10). Two promises carry the whole feature and both fail
 * silently if broken:
 *
 *   §3  Nothing the player built is ever taken away by the climb.
 *   §7.6 A campaign that never marches is the game as it was, and a seed
 *        reproduces the whole climb rather than only its first lobby.
 *
 * A campaign that quietly drops a Banner Rank or re-rolls a board at the
 * boundary would look like a bug in the *next* lobby, hours later, and be
 * blamed on anything but the march.
 */

/** Everything about a warband that marching must not touch (§7.1). */
const warbandPrint = (w: Warlord): string =>
  [
    w.id,
    w.name,
    w.factionId,
    w.heroId,
    w.archetype,
    `camp:${w.camp.tier}/${w.camp.tierDiscount}`,
    `mods:${JSON.stringify(w.mods)}`,
    `talents:${w.talentsTaken.join('+')}`,
    w.board
      .slice()
      .sort((a, b) => a.slot - b.slot)
      .map((s) => `${s.uid}:${s.unitId}:${s.count}@${s.slot}:+${s.bonusAtk}/${s.bonusHp}:r${s.rank}:g${s.growthTicks}:s${s.spent}`)
      .join(','),
  ].join('|')

/** Play a lobby to its end with the player forced to survive and take first. */
function winLobby(run: RunState): RunState {
  for (let guard = 0; guard < 24 && !run.finished; guard++) {
    const you = player(run)
    // Nothing drafts a board for the player in a test, so an untouched banner
    // loses every fight. Propping the HP up is what lets a lobby reach a
    // victory at all; it changes no board and no pairing.
    if (you.alive) you.hp = 999
    resolveBattles(run)
    if (run.finished) break
    advanceRound(run)
  }
  return run
}

describe('the derived-seed rule', () => {
  it('leaves Tier 1 on the campaign seed itself', () => {
    expect(lobbySeedFor(4242, 1)).toBe(4242)
    expect(lobbySeedFor(4242, 0)).toBe(4242)
  })

  it('gives every rung above its own lobby, stably', () => {
    const seeds = [2, 3, 4, 5].map((t) => lobbySeedFor(4242, t))
    expect(new Set(seeds).size, 'two tiers drew the same lobby').toBe(4)
    // Stable across calls: the same campaign replays the same climb.
    expect(seeds).toEqual([2, 3, 4, 5].map((t) => lobbySeedFor(4242, t)))
    // ...and is a function of the campaign, not a global counter.
    expect(lobbySeedFor(9, 3)).not.toBe(lobbySeedFor(10, 3))
  })

  it('starts a campaign with the two seeds agreeing', () => {
    const run = newRun({ seed: 77, factionId: 'vanguard', heroId: 'h_berrik' })
    expect(run.campaignSeed).toBe(77)
    expect(run.seed).toBe(77)
    expect(run.roundsBefore).toBe(0)
    expect(run.bonusTalentPoints).toBe(0)
  })
})

describe('marching carries the warband', () => {
  it('hands the next lobby the same army, unit for unit', () => {
    const run = winLobby(newRun({ seed: 31, factionId: 'verdant', heroId: 'h_maravel' }))
    const you = player(run)
    // Give the warband something worth losing, so the fingerprint has teeth.
    you.board.push(
      { uid: 'keep1', unitId: 'vd_thornbark', count: 7, slot: 0, bonusAtk: 3, bonusHp: 5, growthTicks: 4, spent: 9, rank: 2 },
      { uid: 'keep2', unitId: 'vd_moonshade', count: 5, slot: 4, bonusAtk: 1, bonusHp: 2, growthTicks: 1, spent: 6, rank: 1 },
    )
    you.camp = { ...you.camp, tier: 4, tierDiscount: 2 }
    you.talentsTaken = [...you.talentsTaken, 'x_test_a', 'x_test_b']
    const before = warbandPrint(you)

    // The crossing, before the next lobby's first Muster has run: this is the
    // boundary DN10 §3 is about, and nothing but the Interlude grants may
    // differ across it.
    expect(warbandPrint(marchedWarband(you, run.tier + 1))).toBe(before)
  })

  /**
   * ...and after arrival, the only thing that may have moved the board is the
   * new lobby's own first Muster. Growth is a unit keyword, so a Verdant
   * warband ticks on arrival exactly as it would on any round 1 — what must
   * never happen is a tick being *reset*, which is how a carried board would
   * quietly lose a campaign's worth of compounding (DN10 §6 flags this as the
   * number-one thing to watch).
   */
  it('continues Growth across the boundary instead of restarting it', () => {
    const run = winLobby(newRun({ seed: 31, factionId: 'verdant', heroId: 'h_maravel' }))
    const you = player(run)
    you.board.push({ uid: 'g1', unitId: 'vd_thornbark', count: 7, slot: 0, bonusAtk: 3, bonusHp: 5, growthTicks: 9, spent: 9, rank: 0 })
    const { run: next } = marchOn(run)
    const after = player(next).board.find((s) => s.uid === 'g1')!
    expect(after, 'the carried stack vanished').toBeDefined()
    expect(after.growthTicks).toBeGreaterThanOrEqual(9)
    expect(after.growthTicks).toBeLessThanOrEqual(10)
    expect(after.bonusHp).toBeGreaterThanOrEqual(5)
    expect(after.count).toBe(7)
  })

  it('puts them in a genuinely new lobby, not the old one renumbered', () => {
    const run = winLobby(newRun({ seed: 31, factionId: 'verdant', heroId: 'h_maravel' }))
    const oldRivals = run.warlords.filter((w) => !w.isPlayer).map((w) => w.name)
    const { run: next } = marchOn(run)
    expect(next.tier).toBe(run.tier + 1)
    expect(next.seed).toBe(lobbySeedFor(run.campaignSeed, run.tier + 1))
    expect(next.warlords).toHaveLength(run.warlords.length)
    expect(next.warlords.filter((w) => w.alive)).toHaveLength(run.warlords.length)
    const newRivals = next.warlords.filter((w) => !w.isPlayer).map((w) => w.name)
    expect(newRivals, 'the same seven rivals came back from the dead').not.toEqual(oldRivals)
    expect(next.round).toBe(1)
    expect(next.finished).toBe(false)
  })

  it('does not write through to the lobby just finished', () => {
    const run = winLobby(newRun({ seed: 12, factionId: 'vanguard', heroId: 'h_berrik' }))
    const you = player(run)
    you.board.push({ uid: 'k', unitId: 'vg_militia', count: 4, slot: 0, bonusAtk: 0, bonusHp: 0, growthTicks: 0, spent: 3, rank: 0 })
    const before = warbandPrint(you)
    const { run: next } = marchOn(run)
    const marched = player(next)
    marched.board[marched.board.length - 1].count = 99
    marched.camp.tier = 5
    expect(warbandPrint(you), 'the recap board was mutated by the next lobby').toBe(before)
  })

  it('carries the campaign round forward while the lobby round restarts', () => {
    const run = winLobby(newRun({ seed: 31, factionId: 'verdant', heroId: 'h_maravel' }))
    const played = run.round
    const { run: next } = marchOn(run)
    expect(next.round).toBe(1)
    expect(next.roundsBefore).toBe(played)
    // §5: the damage curve is the campaign's, so a fresh lobby is not a fresh
    // start for how hard a loss hits.
    expect(campaignRound(next)).toBe(played + 1)
    expect(campaignRound(next)).toBeGreaterThan(next.round)
  })
})

/**
 * DN10 §5's one crossing thread. A marched lobby restarts its round counter,
 * and if banner damage restarted with it a Tier 3 lobby could be coasted
 * through on a fresh 30 HP against round-1-sized losses. The two runs below
 * differ in exactly one field, so any difference in what a loss costs is that
 * field and nothing else.
 */
describe('a loss late in a campaign still lands like a late loss', () => {
  const lossDamage = (roundsBefore: number): number => {
    const run = newRun({ seed: 606, factionId: 'vanguard', heroId: 'h_berrik' })
    run.roundsBefore = roundsBefore
    resolveBattles(run)
    // The player drafts nothing in a test, so every one of its battles is a
    // loss — exactly the receipt this is about.
    const mine = run.reports.find((r) => r.aId === run.playerId || r.bId === run.playerId)!
    expect(mine, 'the fixture fought no battle').toBeDefined()
    return mine.damage
  }

  it('charges the campaign round, not the lobby round', () => {
    const fresh = lossDamage(0)
    const marched = lossDamage(12)
    expect(fresh).toBeGreaterThan(0)
    expect(marched, 'a marched lobby charged round-1 damage').toBeGreaterThan(fresh)
  })

  it('and is identical when nothing precedes the lobby', () => {
    expect(lossDamage(0)).toBe(lossDamage(0))
  })
})

describe('the Interlude grants exactly three things', () => {
  it('restores the banner, sets the stipend and adds a talent point', () => {
    const run = winLobby(newRun({ seed: 31, factionId: 'verdant', heroId: 'h_maravel' }))
    const you = player(run)
    you.hp = 3
    you.gold = 40
    const { run: next, grants } = marchOn(run)
    const arrived = player(next)

    expect(arrived.hp).toBe(startingHp(next.tier))
    expect(arrived.gold).toBe(stipendFor(next.tier))
    expect(next.bonusTalentPoints).toBe(run.bonusTalentPoints + INTERLUDE_TALENT_POINTS)

    // Everything applied is on the grant sheet — that is what the screen lists.
    expect(grants).toEqual({
      tier: next.tier,
      hp: arrived.hp,
      gold: arrived.gold,
      talentPoints: INTERLUDE_TALENT_POINTS,
    })
  })

  it('never lets gold bank across a boundary', () => {
    const rich = winLobby(newRun({ seed: 8, factionId: 'stormtide', heroId: 'h_zhala' }))
    const poor = winLobby(newRun({ seed: 8, factionId: 'stormtide', heroId: 'h_zhala' }))
    player(rich).gold = 200
    player(poor).gold = 0
    expect(player(marchOn(rich).run).gold).toBe(player(marchOn(poor).run).gold)
  })

  it('restores to the banner the tier actually allows, not a flat number', () => {
    // Thin Rations is Tier 4, so a march into it heals to less than START_HP.
    expect(startingHp(1)).toBe(START_HP)
    expect(startingHp(4)).toBe(START_HP + modsForTier(4).playerHp!)
    expect(startingHp(4)).toBeLessThan(START_HP)
  })

  it('raises the talent ceiling one point per tier climbed', () => {
    let run = winLobby(newRun({ seed: 5, factionId: 'vanguard', heroId: 'h_berrik' }))
    for (let i = 1; i <= 3; i++) {
      run = marchOn(run).run
      expect(run.bonusTalentPoints).toBe(i)
      expect(MAX_TALENT_POINTS + run.bonusTalentPoints).toBe(MAX_TALENT_POINTS + i)
      run = winLobby(run)
    }
  })
})

describe('the fork is offered exactly when it should be', () => {
  it('is not offered mid-lobby', () => {
    const run = newRun({ seed: 3, factionId: 'vanguard', heroId: 'h_berrik' })
    expect(canMarchOn(run)).toBe(false)
  })

  it('is not offered to a campaign that lost', () => {
    const run = newRun({ seed: 3, factionId: 'vanguard', heroId: 'h_berrik' })
    run.finished = true
    player(run).placement = 5
    expect(canMarchOn(run)).toBe(false)
  })

  it('is offered to a winner, and stops at the top of the ladder', () => {
    const run = winLobby(newRun({ seed: 31, factionId: 'verdant', heroId: 'h_maravel' }))
    expect(player(run).placement).toBe(1)
    expect(canMarchOn(run)).toBe(true)
    run.tier = 10
    expect(canMarchOn(run), 'marched off the top of the ladder').toBe(false)
  })
})

describe('a seed reproduces the whole climb', () => {
  const climb = (seed: number) => {
    let run = winLobby(newRun({ seed, factionId: 'vanguard', heroId: 'h_berrik' }))
    const marks: string[] = []
    for (let i = 0; i < 3; i++) {
      run = marchOn(run).run
      marks.push(
        [
          `T${run.tier}`,
          `seed:${run.seed}`,
          `before:${run.roundsBefore}`,
          run.warlords.map((w) => `${w.id}:${w.name}:${w.factionId}:${w.heroId}:${w.archetype}:${w.gold}`).join(';'),
        ].join('|'),
      )
      run = winLobby(run)
    }
    return marks.join('\n')
  }

  it('plays out identically for the same campaign seed', () => {
    expect(climb(4242)).toBe(climb(4242))
  })

  it('and differently for a different one', () => {
    expect(climb(4242)).not.toBe(climb(4243))
  })
})

describe('a campaign that never marches is the game as it was', () => {
  /**
   * The equivalence proof §7.6 asks for. Nothing about campaign state may leak
   * into a Tier 1 lobby: same seed, same rivals, same gold, same battles, same
   * eliminations, round for round.
   */
  it('is fingerprint-identical to a pre-DN10 Tier 1 run', () => {
    const fingerprint = (run: RunState) =>
      run.warlords
        .map((w) =>
          [
            w.id,
            w.hp,
            w.alive ? 1 : 0,
            w.placement ?? '-',
            w.gold,
            w.talentsTaken.join('+'),
            w.board.map((s) => `${s.unitId}:${s.count}:${s.slot}:${s.bonusAtk}/${s.bonusHp}`).join(','),
          ].join('|'),
        )
        .join('\n')

    const play = (tier?: number) => {
      const run = newRun({ seed: 4242, factionId: 'verdant', heroId: 'h_maravel', difficulty: 'standard', tier })
      const marks: string[] = []
      for (let guard = 0; guard < 20 && !run.finished; guard++) {
        marks.push(`R${run.round}\n${fingerprint(run)}`)
        resolveBattles(run)
        if (run.finished) break
        advanceRound(run)
      }
      marks.push(`END\n${fingerprint(run)}`)
      return marks.join('\n--\n')
    }

    expect(play(1)).toBe(play(undefined))
  })

  it('leaves the damage curve exactly where it was', () => {
    const run = newRun({ seed: 9, factionId: 'vanguard', heroId: 'h_berrik' })
    for (let r = 1; r <= 12; r++) {
      run.round = r
      expect(campaignRound(run)).toBe(r)
    }
  })
})
