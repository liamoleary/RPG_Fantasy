import { describe, expect, it } from 'vitest'
import {
  BOSS_BOARDS,
  MAX_WAR_TIER,
  WAR_TIERS,
  clampTier,
  modsForTier,
  renownMultiplier,
  rulesForTier,
} from '../src/data/tiers'
import { UNIT_BY_ID } from '../src/data/index'
import { FRONT_SLOTS, TOTAL_SLOTS } from '../src/engine/battle'
import { advanceRound, newRun, player, resolveBattles, tierMods, type RunState } from '../src/engine/run'
import { income } from '../src/engine/camp'
import { ZERO_MODS } from '../src/data/types'

/**
 * War Tiers (DN09). Two contracts matter more than any individual number here,
 * because both fail silently:
 *
 *   §8.1  Tier 1 is byte-identical to the game without tiers.
 *   §8.7  A run at Tier N carries exactly rules 2..N — no more, no fewer.
 *
 * Rates and rule *values* are the harness's to tune and are deliberately not
 * asserted; what is asserted is the shape, the stacking and the boundaries.
 */

describe('the ladder itself', () => {
  it('has one rule per tier from 2 to the cap, and none at Tier 1', () => {
    expect(WAR_TIERS).toHaveLength(MAX_WAR_TIER)
    expect(WAR_TIERS[0].tier).toBe(1)
    expect(WAR_TIERS[0].name).toBeNull()
    expect(Object.keys(WAR_TIERS[0].mods)).toEqual([])
    for (const t of WAR_TIERS.slice(1)) {
      expect(t.name, `tier ${t.tier} has no name`).toBeTruthy()
      expect(t.text, `tier ${t.tier} has no player-facing text`).toBeTruthy()
      expect(Object.keys(t.mods).length, `tier ${t.tier} changes nothing`).toBeGreaterThan(0)
    }
    expect(WAR_TIERS.map((t) => t.tier)).toEqual([...Array(MAX_WAR_TIER)].map((_, i) => i + 1))
  })

  it('never removes a toy — no rule touches slots, points or ranks', () => {
    // §3's authoring rule. Pressure comes from opposition and margins; a tier
    // that took away board slots or talent points would be a different game.
    const forbidden = ['slots', 'talentPoints', 'rankThreshold', 'boardSlots', 'levelUps']
    for (const t of WAR_TIERS) {
      for (const key of Object.keys(t.mods)) {
        expect(forbidden, `tier ${t.tier} removes a toy via ${key}`).not.toContain(key)
      }
    }
  })
})

describe('stacking — exactly rules 2..N', () => {
  it('carries every rule below it and nothing above it', () => {
    for (let tier = 1; tier <= MAX_WAR_TIER; tier++) {
      const rules = rulesForTier(tier)
      expect(rules.map((r) => r.tier)).toEqual(
        [...Array(Math.max(0, tier - 1))].map((_, i) => i + 2),
      )
    }
  })

  it('is strictly cumulative — every tier is a superset of the one below', () => {
    for (let tier = 2; tier <= MAX_WAR_TIER; tier++) {
      const below = new Set(rulesForTier(tier - 1).map((r) => r.tier))
      for (const t of below) {
        expect(rulesForTier(tier).map((r) => r.tier), `tier ${tier} dropped rule ${t}`).toContain(t)
      }
    }
  })

  it('merges numeric knobs by adding them', () => {
    // Rich Foes is the only rivalIncome rule today, so tier 3 and tier 10 must
    // agree — this catches a future rule quietly double-counting.
    const three = modsForTier(3)
    const ten = modsForTier(MAX_WAR_TIER)
    expect(ten.rivalIncome).toBe(three.rivalIncome)
    expect(ten.playerHp).toBe(modsForTier(4).playerHp)
  })

  it('takes the sharpest rival AI on offer, not the last one declared', () => {
    // Veteran Rivals sets noise 1 at tier 2; Elite Muster sets 0 at tier 5.
    // Merging must not let the earlier, looser rule win.
    expect(modsForTier(2).rivalNoise).toBe(1)
    expect(modsForTier(5).rivalNoise).toBe(0)
    expect(modsForTier(MAX_WAR_TIER).rivalNoise).toBe(0)
  })

  it('clamps anything outside the ladder onto it', () => {
    expect(clampTier(0)).toBe(1)
    expect(clampTier(-4)).toBe(1)
    expect(clampTier(MAX_WAR_TIER + 9)).toBe(MAX_WAR_TIER)
    expect(clampTier(3.7)).toBe(3)
    expect(clampTier(NaN)).toBe(1)
    expect(modsForTier(9999)).toEqual(modsForTier(MAX_WAR_TIER))
  })
})

describe('Tier 1 is the game as shipped', () => {
  it('adds no modifiers at all', () => {
    expect(modsForTier(1)).toEqual({})
    expect(rulesForTier(1)).toEqual([])
  })

  it('is what a run gets when no tier is asked for', () => {
    const run = newRun({ seed: 5, factionId: 'vanguard', heroId: 'h_berrik' })
    expect(run.tier).toBe(1)
    expect(tierMods(run)).toEqual({})
  })

  /**
   * The equivalence proof §8.1 asks for. A tier-1 run and a run created with no
   * tier at all must be the same lobby, round for round — same boards, same
   * gold, same battles, same eliminations. Anything a modifier touches that
   * leaks at Tier 1 shows up here as a divergence.
   */
  it('plays out identically to a run created without tiers, for a whole lobby', () => {
    const fingerprint = (run: RunState) =>
      run.warlords
        .map((w) =>
          [
            w.id,
            w.hp,
            w.alive ? 1 : 0,
            w.placement ?? '-',
            w.gold,
            w.mods.income,
            w.mods.frontBulwark,
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

  it('leaves the income curve exactly where it was', () => {
    for (let round = 1; round <= 16; round++) {
      expect(income(round, ZERO_MODS)).toBe(income(round, ZERO_MODS, undefined))
    }
  })
})

describe('the rules reach the run', () => {
  it('Thin Rations trims the player and nobody else', () => {
    const base = newRun({ seed: 9, factionId: 'vanguard', heroId: 'h_berrik', tier: 1 })
    const thin = newRun({ seed: 9, factionId: 'vanguard', heroId: 'h_berrik', tier: 4 })
    expect(thin.warlords[0].hp).toBe(base.warlords[0].hp + modsForTier(4).playerHp!)
    for (let i = 1; i < base.warlords.length; i++) {
      expect(thin.warlords[i].hp, 'a rival lost HP to the player rule').toBe(base.warlords[i].hp)
    }
  })

  it('Rich Foes pays rivals and never the player', () => {
    const run = newRun({ seed: 9, factionId: 'vanguard', heroId: 'h_berrik', tier: 3 })
    expect(player(run).mods.income).toBe(0)
    for (const w of run.warlords.filter((x) => !x.isPlayer)) {
      expect(w.mods.income).toBe(modsForTier(3).rivalIncome)
    }
  })

  it('Iron Banners thickens rival front lines through the mod the engine already reads', () => {
    const run = newRun({ seed: 9, factionId: 'vanguard', heroId: 'h_berrik', tier: 9 })
    expect(player(run).mods.frontBulwark).toBe(0)
    for (const w of run.warlords.filter((x) => !x.isPlayer)) {
      expect(w.mods.frontBulwark).toBe(modsForTier(9).rivalFrontBulwark)
    }
  })

  it('Long Supply Lines lowers the ceiling, not the early rounds', () => {
    const cap = 10 + modsForTier(7).playerIncomeCap!
    // Below the ceiling the curve is untouched...
    expect(income(3, ZERO_MODS, cap)).toBe(income(3, ZERO_MODS))
    // ...and at it, the player is short by exactly the rule.
    expect(income(12, ZERO_MODS, cap)).toBe(income(12, ZERO_MODS) + modsForTier(7).playerIncomeCap!)
  })

  it('Grudge Pairings puts the strongest rival opposite you on its cadence', () => {
    const every = modsForTier(8).grudgeEvery!
    const run = newRun({ seed: 21, factionId: 'vanguard', heroId: 'h_berrik', tier: 8 })
    let checked = 0
    for (let guard = 0; guard < 16 && !run.finished; guard++) {
      if (run.round % every === 0 && player(run).alive) {
        const mine = run.pairings.find((p) => p.aId === run.playerId || p.bId === run.playerId)
        expect(mine, `no pairing for the player in round ${run.round}`).toBeDefined()
        const foeId = mine!.aId === run.playerId ? mine!.bId : mine!.aId
        const foes = run.warlords.filter((w) => w.alive && !w.isPlayer)
        if (foes.length > 0) {
          const strongest = Math.max(...foes.map((w) => w.hp))
          expect(run.warlords.find((w) => w.id === foeId)!.hp).toBe(strongest)
          checked += 1
        }
      }
      resolveBattles(run)
      if (run.finished) break
      advanceRound(run)
    }
    expect(checked, 'the fixture never reached a grudge round').toBeGreaterThan(0)
  })
})

describe('the Crownless Throne', () => {
  it('authors legal boards — real units, real slots', () => {
    expect(BOSS_BOARDS.length).toBeGreaterThan(0)
    for (const b of BOSS_BOARDS) {
      expect(b.name).toBeTruthy()
      const slots = new Set<number>()
      for (const s of b.stacks) {
        const def = UNIT_BY_ID.get(s.unitId)
        expect(def, `${b.name} fields an unknown unit ${s.unitId}`).toBeDefined()
        expect(s.count).toBeGreaterThan(0)
        expect(s.slot).toBeGreaterThanOrEqual(0)
        expect(s.slot).toBeLessThan(TOTAL_SLOTS)
        expect(slots.has(s.slot), `${b.name} double-books slot ${s.slot}`).toBe(false)
        slots.add(s.slot)
        // A back-only unit cannot hold a front slot, same as any other board.
        if (def!.row === 'back') expect(s.slot).toBeGreaterThanOrEqual(FRONT_SLOTS)
        if (def!.row === 'front') expect(s.slot).toBeLessThan(FRONT_SLOTS)
      }
    }
  })

  it('only shows up at the tier that authors it', () => {
    expect(modsForTier(9).bossRounds).toBeUndefined()
    expect(modsForTier(10).bossRounds).toBeGreaterThan(0)
  })
})

describe('renown pays for altitude', () => {
  it('scales with the tier and is never a penalty', () => {
    expect(renownMultiplier(1)).toBe(1)
    for (let t = 2; t <= MAX_WAR_TIER; t++) {
      expect(renownMultiplier(t)).toBeGreaterThan(renownMultiplier(t - 1))
    }
    expect(renownMultiplier(MAX_WAR_TIER)).toBeCloseTo(1 + 0.15 * (MAX_WAR_TIER - 1), 5)
  })

  it('clamps like everything else, so a corrupt save cannot mint renown', () => {
    expect(renownMultiplier(9999)).toBe(renownMultiplier(MAX_WAR_TIER))
    expect(renownMultiplier(-3)).toBe(1)
  })
})
