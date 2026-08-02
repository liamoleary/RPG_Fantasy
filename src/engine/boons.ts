/** Boon offers: three cards, one per branch, drawn without replacement. */
import { BOONS } from '../data/index'
import type { BoonBranch, BoonDef, FactionId } from '../data/types'
import type { RNG } from './rng'

export const LEVEL_UP_ROUNDS = [2, 4, 6, 8, 10, 12]
export const BRANCHES: BoonBranch[] = ['might', 'magic', 'command']

export function isLevelUpRound(round: number): boolean {
  return LEVEL_UP_ROUNDS.includes(round)
}

export function heroLevel(round: number): number {
  return 1 + LEVEL_UP_ROUNDS.filter((r) => r <= round).length
}

function eligible(b: BoonDef, round: number, heroId: string, factionId: FactionId, taken: Set<string>): boolean {
  if (taken.has(b.id)) return false
  if (b.minRound > round) return false
  if (b.heroId && b.heroId !== heroId) return false
  if (b.factionId && b.factionId !== factionId) return false
  return true
}

/**
 * One boon per branch. Late rounds bias hard toward capstones so rounds 10–12
 * feel like build-defining picks rather than another +1 ATK.
 */
export function offerBoons(round: number, heroId: string, factionId: FactionId, taken: Set<string>, rng: RNG): BoonDef[] {
  const out: BoonDef[] = []
  for (const branch of BRANCHES) {
    const pool = BOONS.filter((b) => b.branch === branch && eligible(b, round, heroId, factionId, taken))
    if (pool.length === 0) continue
    const weights = pool.map((b) => {
      let w = 1
      if (b.heroId) w *= 2.2 // signature boons should show up
      if (b.capstone) w *= round >= 10 ? 4 : 0.01
      else if (round >= 10) w *= 0.6
      if (b.minRound >= 6 && round >= 8) w *= 1.6
      return w
    })
    out.push(rng.weighted(pool, weights))
  }
  return out
}
