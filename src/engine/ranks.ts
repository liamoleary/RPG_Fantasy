/**
 * Banner Ranks (Design Notes 01 §3) — stack-size milestones.
 *
 * Rewards are defined per LINE, on the root form, so a Militia stack that
 * promotes into Footmen keeps the company's colours. Ranks live on the stack,
 * are permanent for the run, survive promotion and only ever go up.
 */
import { ALL_UNITS, UNIT_BY_ID } from '../data/index'
import type { RankDef, UnitDef } from '../data/types'

/**
 * unitId -> the first form of its promotion line. `lineNext` only points
 * forward, so the root is found by walking a predecessor map built once here.
 */
const LINE_ROOT: Map<string, string> = (() => {
  const prev = new Map<string, string>()
  for (const u of ALL_UNITS) if (u.lineNext) prev.set(u.lineNext, u.id)
  const root = new Map<string, string>()
  for (const u of ALL_UNITS) {
    let cur = u.id
    const seen = new Set<string>([cur])
    for (;;) {
      const p = prev.get(cur)
      if (!p || seen.has(p)) break
      cur = p
      seen.add(p)
    }
    root.set(u.id, cur)
  }
  return root
})()

export function lineRootOf(unitId: string): string {
  return LINE_ROOT.get(unitId) ?? unitId
}

export function rankDefOf(unitId: string): RankDef | null {
  return UNIT_BY_ID.get(lineRootOf(unitId))?.rank ?? null
}

/**
 * Thresholds key off the ROOT form's muster size — the root is what you buy,
 * and promoting must never move the goalposts mid-run.
 */
export function thresholdsOf(def: RankDef, root: UnitDef): [number, number] {
  if (def.thresholds) return def.thresholds
  const m = root.musterSize
  if (m >= 3) return [12, 24]
  if (m === 2) return [8, 16]
  return [4, 8]
}

/** Thresholds for a unit id, or null if its line defines no ranks. */
export function thresholdsFor(unitId: string): [number, number] | null {
  const def = rankDefOf(unitId)
  if (!def) return null
  const root = UNIT_BY_ID.get(lineRootOf(unitId))
  if (!root) return null
  return thresholdsOf(def, root)
}

export function rankForCount(count: number, thresholds: [number, number]): 0 | 1 | 2 {
  if (count >= thresholds[1]) return 2
  if (count >= thresholds[0]) return 1
  return 0
}

/** Structural view of a stack — keeps this module free of a battle.ts import. */
export interface RankableStack {
  unitId: string
  count: number
  rank?: number
}

/**
 * The stack's rank after a count change. Never lowers: battle casualties and
 * sales cannot take a banner away (§3.1).
 */
export function applyRankProgress(stack: RankableStack): number {
  const earned = stack.rank ?? 0
  const th = thresholdsFor(stack.unitId)
  if (!th) return earned
  return Math.max(earned, rankForCount(stack.count, th))
}

/** Bring a whole board up to date after counts moved (Muster, Growth, boons). */
export function refreshRanks(board: RankableStack[]) {
  for (const s of board) s.rank = applyRankProgress(s)
}

export const RANK_NAMES = ['', 'Veteran', 'Honored'] as const

/** Plain-language copy for the Veteran bonus, for the Inspect sheet. */
export function veteranText(def: RankDef): string {
  const bits: string[] = []
  if (def.veteran.atk) bits.push(`+${def.veteran.atk} ATK`)
  if (def.veteran.hp) bits.push(`+${def.veteran.hp} HP`)
  return bits.length > 0 ? `${bits.join(' and ')} per unit in the stack` : 'No bonus'
}
