/**
 * The War Council (Design Notes 05 §6) — replaces engine/boons.ts.
 *
 * Selection is now a ladder walk with no randomness in it anywhere: a point
 * always takes its branch's next tier, and at tiers 2 and 4 that tier offers a
 * fork. Everything here is a pure function of (tree, picks so far), which is
 * what makes the run replay-safe from the stored pick sequence and what lets
 * the whole tree be shown from round 1.
 *
 * Effects are untouched. `applyTalent` does what `applyBoon` did, through the
 * same addMods pipeline — §6 is explicit that this is a re-plumbing of
 * selection, not of effects.
 */
import { ALL_TALENTS, nodesAt, treeFor, type Branch, type TalentNode, type Tier } from '../data/talents/index'
import { BRANCHES, TIER_WEIGHT } from '../data/talents/index'
import type { FactionId, HeroMods } from '../data/types'

export const LEVEL_UP_ROUNDS = [2, 4, 6, 8, 10, 12]
/** §2.1: six points a run — capstone plus a one-point dip is the deepest build. */
export const MAX_TALENT_POINTS = LEVEL_UP_ROUNDS.length
export const MAX_TIER: Tier = 5

export { BRANCHES }

export function isLevelUpRound(round: number): boolean {
  return LEVEL_UP_ROUNDS.includes(round)
}

export function heroLevel(round: number): number {
  return 1 + LEVEL_UP_ROUNDS.filter((r) => r <= round).length
}

/** How many points this run has put into a branch — which is also its depth. */
export function pointsIn(tree: readonly TalentNode[], taken: readonly string[], branch: Branch): number {
  let n = 0
  for (const id of taken) {
    const node = tree.find((t) => t.id === id)
    if (node?.branch === branch) n += 1
  }
  return n
}

/** The tier a point would take next in this branch, or null when it is full. */
export function nextTier(tree: readonly TalentNode[], taken: readonly string[], branch: Branch): Tier | null {
  const next = pointsIn(tree, taken, branch) + 1
  return next <= MAX_TIER ? (next as Tier) : null
}

export interface TalentOffer {
  branch: Branch
  tier: Tier
  /** One node on a fixed tier; both sides of the fork on tiers 2 and 4, plus
   *  any feat-unlocked options that widen it (§2.3). */
  options: TalentNode[]
}

/**
 * What a level-up offers: each branch's *actual* next node. No draw, no pool —
 * the same three ladders every run, at whatever depth this run has reached.
 */
export function offersFor(tree: readonly TalentNode[], taken: readonly string[]): TalentOffer[] {
  const out: TalentOffer[] = []
  for (const branch of BRANCHES) {
    const tier = nextTier(tree, taken, branch)
    if (tier === null) continue // branch exhausted
    const options = nodesAt(tree, branch, tier)
    if (options.length > 0) out.push({ branch, tier, options })
  }
  return out
}

/** Is this node a legal pick right now? The only gate that exists (§2.1). */
export function canTake(
  tree: readonly TalentNode[],
  taken: readonly string[],
  nodeId: string,
  /** DN10 §3: an Interlude raises this above the base six, one per tier. */
  max = MAX_TALENT_POINTS,
): boolean {
  if (taken.length >= max) return false
  if (taken.includes(nodeId)) return false
  return offersFor(tree, taken).some((o) => o.options.some((n) => n.id === nodeId))
}

/**
 * The fork option you did *not* take, for every fork you have passed. Shown
 * greyed and locked (§4) — the road not taken is part of the commitment.
 */
export function lockedOptions(tree: readonly TalentNode[], taken: readonly string[]): TalentNode[] {
  const takenSet = new Set(taken)
  const out: TalentNode[] = []
  for (const branch of BRANCHES) {
    const depth = pointsIn(tree, taken, branch)
    for (let tier = 1; tier <= depth; tier++) {
      const here = nodesAt(tree, branch, tier as Tier)
      if (here.length < 2) continue
      for (const node of here) if (!takenSet.has(node.id)) out.push(node)
    }
  }
  return out
}

/** Convenience for the UI and the sim: the resolved tree for a warlord. */
export function treeForWarlord(factionId: FactionId, heroId: string, feats: readonly string[] = []): TalentNode[] {
  return treeFor(factionId, heroId, feats)
}

// ── rival policy (§5) ──────────────────────────────────────────────────────

/**
 * Archetype preferences, inherited unchanged from the boon picker so rivals
 * keep the personalities playtesting already knows.
 */
const TALENT_WEIGHTS: Record<string, Partial<Record<keyof HeroMods, number>>> = {
  aggro: { allAtk: 10, frontAtk: 7, t12CountBonus: 8, frenzyAtk: 7, chargeAll: 14, spellPower: 3, income: 2 },
  greedy: { allHp: 6, growthBonus: 9, t45CountBonus: 9, tierUpDiscount: 8, income: 7, extraOfferSlots: 6, spellPower: 4 },
  balanced: { allAtk: 7, allHp: 6, spellPower: 6, spellExtraCasts: 6, income: 5, frontBulwark: 5, extraOfferSlots: 4 },
  economy: { income: 12, rerollDiscount: 7, freeRerollsPerRound: 6, extraOfferSlots: 7, sellBonus: 4, campTierUp: 8, allAtk: 4 },
}

/**
 * Rough power per point of each mod, for every key. The archetype tables above
 * are *preferences* layered on top of this; without a base, eleven of the
 * twenty-five keys fell through to a flat 3 and the picker judged Overwatch
 * and Vengeance purely on the size of their integers.
 */
const BASE_WEIGHTS: Record<keyof HeroMods, number> = {
  allAtk: 8, allHp: 5,
  frontAtk: 5, backAtk: 5, volleyAtk: 5,
  frontBulwark: 5, frontCover: 8, retaliationAtk: 4, firstStrikeBulwark: 3,
  t12CountBonus: 5, t45CountBonus: 8, frenzyAtk: 5, growthBonus: 7,
  chargeAll: 14, lifestealAll: 12, cleaveFront: 12,
  spellPower: 3, spellExtraCasts: 12, spellCadenceReduction: 10,
  spellSplash: 10, spellPowerPerLevel: 6,
  income: 6, rerollDiscount: 6, freeRerollsPerRound: 4, tierUpDiscount: 4,
  promoteDiscount: 4, extraOfferSlots: 7, sellBonus: 3, campTierUp: 10,
}

function rawScore(node: TalentNode, archetype: string): number {
  let score = 0
  for (const [key, value] of Object.entries(node.mods)) {
    const k = key as keyof HeroMods
    const weight = TALENT_WEIGHTS[archetype]?.[k] ?? BASE_WEIGHTS[k] ?? 3
    score += (typeof value === 'boolean' ? (value ? 1 : 0) : value) * weight
  }
  return score
}

/**
 * The mean raw score of every node on a rung, so a node can be judged against
 * its peers instead of against the whole game.
 *
 * Without this the picker compares magnitudes in incompatible units — "+7 spell
 * power" outscores "+2 ATK to every stack" seven to one on the strength of the
 * integer alone — and Magic eats every point. Memoised; the tables are static.
 */
const baselines = new Map<string, number>()
function rungBaseline(branch: Branch, tier: Tier, archetype: string): number {
  const key = `${branch}|${tier}|${archetype}`
  const hit = baselines.get(key)
  if (hit !== undefined) return hit
  const peers = ALL_TALENTS.filter((n) => n.branch === branch && n.tier === tier)
  const mean = peers.length > 0 ? peers.reduce((a, n) => a + rawScore(n, archetype), 0) / peers.length : 1
  const value = Math.max(0.01, mean)
  baselines.set(key, value)
  return value
}

/**
 * How much a rival wants this node: how good it is *for its rung*, times the
 * §2.2 power weight of that rung. Depth is counted once, by TIER_WEIGHT, rather
 * than twice — deeper nodes already carry bigger payloads, and multiplying the
 * two together made a tier-5 Magic node score sixteen times a tier-5 Might one.
 */
export function scoreNode(node: TalentNode, archetype: string): number {
  return (rawScore(node, archetype) / rungBaseline(node.branch, node.tier, archetype)) * TIER_WEIGHT[node.tier]
}

/**
 * Which node a rival takes. Deterministic — §6 removed RNG from this system
 * entirely, so difficulty no longer perturbs talent choice the way it perturbs
 * drafting. Ties break on node id so the result cannot depend on array order.
 */
export function rivalPick(offers: readonly TalentOffer[], archetype: string): TalentNode | null {
  let best: TalentNode | null = null
  let bestScore = -Infinity
  for (const offer of offers) {
    for (const node of offer.options) {
      // A locked feat option is not available to a rival: rivals have no feats.
      if (node.unlockedByFeat) continue
      const score = scoreNode(node, archetype)
      if (score > bestScore || (score === bestScore && best !== null && node.id < best.id)) {
        bestScore = score
        best = node
      }
    }
  }
  return best
}
