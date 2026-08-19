/**
 * Banner Ranks (Design Notes 01 §3) — stack-size milestones.
 *
 * Rewards are defined per LINE, on the root form, so a Militia stack that
 * promotes into Footmen keeps the company's colours. Ranks live on the stack,
 * are permanent for the run, survive promotion and only ever go up.
 */
import { UNIT_BY_ID } from '../data/index'
import type { RankDef, UnitDef } from '../data/types'
import { LINES } from './lines'

/**
 * unitId -> the first form of its promotion line. Since DN11 a line is a tree
 * rather than a list, and the walk backwards lives in `lines.ts` with the rest
 * of the graph — but the rule this module cares about is unchanged, and is why
 * the graph refuses to load a form with two parents: a stack's banner is its
 * ROOT's banner, so every form must have exactly one.
 */
export function lineRootOf(unitId: string): string {
  return LINES.rootOf(unitId)
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
  // Raised for the longer campaign (DN10): at the old values 81% of boards
  // held an Honored stack by run end and the power-matched edge crept past
  // the +8% flag. A 26-round war earns the same banners a little later.
  const m = root.musterSize
  if (m >= 3) return [14, 28]
  if (m === 2) return [10, 20]
  return [5, 10]
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
