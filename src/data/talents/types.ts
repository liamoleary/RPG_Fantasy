/**
 * The War Council (Design Notes 05).
 *
 * A talent node is a boon that knows where it lives. The payload is the same
 * `Partial<HeroMods>` a BoonDef carried, applied through the same pipeline —
 * §6 is explicit that this is a re-plumbing of *selection*, not of effects.
 * What is new is position: a branch, a tier, and possibly a fork.
 */
import type { FactionId, HeroMods } from '../types'

export type Branch = 'might' | 'magic' | 'command'
export type Tier = 1 | 2 | 3 | 4 | 5
export type Fork = 'a' | 'b'

export const BRANCHES: Branch[] = ['might', 'magic', 'command']
export const TIERS: Tier[] = [1, 2, 3, 4, 5]
/** §2.1: tiers 2 and 4 fork; 1, 3 and 5 are fixed. */
export const FORK_TIERS: Tier[] = [2, 4]
/** DN04 §11 names, carried over by §2.1. */
export const TIER_NAMES: Record<Tier, string> = {
  1: 'Basic',
  2: 'Advanced',
  3: 'Expert',
  4: 'Master',
  5: 'Capstone',
}
/** §2.2 power weights, used by the sim and by rival policy. */
export const TIER_WEIGHT: Record<Tier, number> = { 1: 1, 2: 1.5, 3: 2.5, 4: 4, 5: 6 }

export interface TalentNode {
  id: string
  name: string
  text: string
  branch: Branch
  tier: Tier
  /** Present on tier 2 and 4 nodes only — the two options of that fork. */
  fork?: Fork
  mods: Partial<HeroMods>
  /**
   * The boon this node recycles. §6 requires a recycled node to produce the
   * identical engine effect its boon did, and the parity test in
   * tests/talents.test.ts checks exactly that against BOON_BY_ID.
   * Absent on nodes authored for this system, which claim no such parity.
   */
  recycles?: string
  /** Set on a hero override node — it replaces the base node at this slot. */
  heroId?: string
  /** §2.3: feats widen the forks. A locked option is visible but unpickable. */
  unlockedByFeat?: string
}

/** One faction's full ladder before hero overrides are applied. */
export interface FactionTree {
  factionId: FactionId
  nodes: TalentNode[]
}

export function slotKey(branch: Branch, tier: Tier, fork?: Fork): string {
  return `${branch}${tier}${fork ?? ''}`
}
