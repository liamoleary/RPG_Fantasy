import { describe, expect, it } from 'vitest'
import { unit } from '../src/data/index'
import { ZERO_MODS } from '../src/data/types'
import type { BoardStack } from '../src/engine/battle'
import { newCamp, promote, recruit, recruitPlan, resetUid } from '../src/engine/camp'

/**
 * Line-aware recruiting (Design Notes 04 §1). The shop used to invert: a
 * Militia bought into a Footman stack added four Footmen for 3g, so the cheap
 * form was strictly the better buy all game and the upgraded offers were dead
 * cards. Recruits now train up, and training costs bodies.
 */

function stack(unitId: string, count: number, slot: number, extra: Partial<BoardStack> = {}): BoardStack {
  return { uid: `u_${unitId}`, unitId, count, slot, bonusAtk: 0, bonusHp: 0, growthTicks: 0, spent: 3, rank: 0, ...extra }
}

const plan = (board: BoardStack[], id: string) => recruitPlan(board, id, ZERO_MODS)

describe('recruit conversion (§1.1)', () => {
  // Vanguard melee line: Militia +4 -> Footman +3 -> Sunforged Champion +1.
  it('buying the stack’s own form adds the full muster', () => {
    expect(plan([stack('vg_footman', 6, 0)], 'vg_footman').added).toBe(unit('vg_footman').musterSize)
    expect(plan([stack('vg_militia', 6, 0)], 'vg_militia').added).toBe(unit('vg_militia').musterSize)
  })

  it('halves the intake per form behind — the spec’s worked examples', () => {
    const footmen = [stack('vg_footman', 6, 0)]
    expect(plan(footmen, 'vg_militia').added).toBe(2)
    expect(plan(footmen, 'vg_footman').added).toBe(3)

    const champions = [stack('vg_champion', 3, 0)]
    expect(plan(champions, 'vg_militia').added).toBe(1)
    expect(plan(champions, 'vg_footman').added).toBe(1)
    expect(plan(champions, 'vg_champion').added).toBe(1)
  })

  it('never converts a purchase down to nothing', () => {
    // Crossbow line: Levy +3 -> Arbalest -> Ballistier. 3 / 2^2 floors to 0
    // without the min, and a paid recruit must always put someone on the field.
    expect(unit('vg_crossbow').musterSize).toBe(3)
    const p = plan([stack('vg_ballistier', 2, 4)], 'vg_crossbow')
    expect(p.stepsBehind).toBe(2)
    expect(p.added).toBe(1)
  })

  it('buying above your stack’s form starts its own stack (§1.2)', () => {
    const p = plan([stack('vg_militia', 8, 0)], 'vg_footman')
    expect(p.target).toBeNull()
    expect(p.added).toBe(unit('vg_footman').musterSize)
  })

  it('prefers the least-advanced eligible stack, losing the fewest recruits', () => {
    const board = [stack('vg_militia', 8, 0), { ...stack('vg_champion', 2, 1), uid: 'u_champ' }]
    const p = plan(board, 'vg_militia')
    expect(p.target?.unitId).toBe('vg_militia')
    expect(p.added).toBe(4)
  })

  it('keeps separate lines separate', () => {
    // Crossbow Levy is Vanguard, but a different line from the Militia one.
    expect(plan([stack('vg_footman', 6, 0)], 'vg_crossbow').target).toBeNull()
  })

  it('recruit() puts the converted count on the board, and ranks off it', () => {
    const board = [stack('vg_footman', 6, 0)]
    const res = recruit(board, 9, 'vg_militia', ZERO_MODS)
    expect(res.ok).toBe(true)
    expect(res.board).toHaveLength(1)
    expect(res.board[0].unitId).toBe('vg_footman')
    expect(res.board[0].count).toBe(8)
    expect(res.gold).toBe(6)
  })

  it('the higher form is never the worse buy for a promoted stack', () => {
    // The whole point of §1: on a Footman stack, Footmen beat Militia.
    const board = [stack('vg_footman', 6, 0)]
    expect(plan(board, 'vg_footman').added).toBeGreaterThan(plan(board, 'vg_militia').added)
  })
})

describe('auto-merge on promote (§1.2)', () => {
  it('folds a promoted stack into one it already fields', () => {
    resetUid(500)
    const board = [stack('vg_militia', 12, 0), { ...stack('vg_footman', 6, 1), uid: 'u_foot' }]
    const res = promote(board, 20, 'u_vg_militia', { ...newCamp(), tier: 2 }, ZERO_MODS)
    expect(res.ok).toBe(true)
    expect(res.board).toHaveLength(1)
    const merged = res.board[0]
    expect(merged.unitId).toBe('vg_footman')
    expect(merged.count).toBe(18)
    // 12 Militia at [12, 24] thresholds were Veteran; the company stays Veteran.
    expect(merged.rank).toBe(1)
    expect(merged.spent).toBe(3 + 3 + 3)
  })

  it('keeps the promoted stack’s identity and frees the duplicate’s slot', () => {
    const board = [stack('vg_militia', 4, 0), { ...stack('vg_footman', 4, 2), uid: 'u_foot' }]
    const res = promote(board, 20, 'u_vg_militia', { ...newCamp(), tier: 2 }, ZERO_MODS)
    expect(res.board.map((s) => s.uid)).toEqual(['u_vg_militia'])
    expect(res.board[0].slot).toBe(0)
  })

  it('takes the better Growth bonus rather than pooling two half-grown stacks', () => {
    const board = [
      stack('vd_sapling', 6, 0, { bonusAtk: 1, bonusHp: 3, growthTicks: 4 }),
      { ...stack('vd_thornbark', 4, 1, { bonusAtk: 0, bonusHp: 1, growthTicks: 1 }), uid: 'u_thorn' },
    ]
    const res = promote(board, 20, 'u_vd_sapling', { ...newCamp(), tier: 3 }, ZERO_MODS)
    expect(res.board).toHaveLength(1)
    expect(res.board[0].bonusAtk).toBe(1)
    expect(res.board[0].bonusHp).toBe(3)
    expect(res.board[0].growthTicks).toBe(4)
  })

  it('leaves a promotion with no duplicate alone', () => {
    const board = [stack('vg_militia', 12, 0)]
    const res = promote(board, 20, 'u_vg_militia', { ...newCamp(), tier: 2 }, ZERO_MODS)
    expect(res.board).toHaveLength(1)
    expect(res.board[0].unitId).toBe('vg_footman')
    expect(res.board[0].count).toBe(12)
  })
})
