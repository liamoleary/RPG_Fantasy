/**
 * Tree assembly (Design Notes 05 §3).
 *
 * A faction ladder plus that hero's override nodes, resolved once per hero and
 * memoised. Resolution is pure and order-independent: an override replaces the
 * base node occupying its slot (branch + tier + fork), and nothing else moves.
 */
import type { FactionId } from '../types'
import { COMMAND_FEAT_OPTIONS } from './shared'
import { STORMTIDE_TREE } from './stormtide'
import { VANGUARD_TREE } from './vanguard'
import { VERDANT_TREE } from './verdant'
import { BRANCHES, FORK_TIERS, slotKey, TIERS, type Branch, type FactionTree, type Fork, type TalentNode, type Tier } from './types'

export * from './types'
export { COMMAND_FEAT_OPTIONS }

/**
 * FactionId declares three more ids (gravebound, conclave, emberhorde) that no
 * faction, hero or unit uses yet, so the map is partial by design rather than
 * carrying three placeholder ladders. Every hero in HEROES belongs to one of
 * the three below, and rivals draft from that same list, so the fallback is
 * unreachable today — it exists so adding a faction cannot crash a run before
 * its tree is written.
 */
const TREES: Partial<Record<FactionId, FactionTree>> = {
  vanguard: VANGUARD_TREE,
  verdant: VERDANT_TREE,
  stormtide: STORMTIDE_TREE,
}

function treeOf(factionId: FactionId): FactionTree {
  return TREES[factionId] ?? VANGUARD_TREE
}

/**
 * Every distinct node in the game, including hero overrides and feat options.
 * Deduped by id: the Command ladder is one shared array referenced by all three
 * faction trees, so it would otherwise appear three times.
 */
export const ALL_TALENTS: TalentNode[] = [
  ...new Map(
    [...Object.values(TREES).flatMap((t) => t.nodes), ...COMMAND_FEAT_OPTIONS].map((n) => [n.id, n]),
  ).values(),
]

export const TALENT_BY_ID = new Map(ALL_TALENTS.map((n) => [n.id, n]))

const resolved = new Map<string, TalentNode[]>()

/**
 * The tree a given hero actually plays, base nodes with overrides substituted.
 * Feat-unlocked options are appended as *extra* fork choices — they widen a
 * fork rather than replacing either side of it (§2.3).
 */
export function treeFor(factionId: FactionId, heroId: string, unlockedFeats: readonly string[] = []): TalentNode[] {
  const key = `${factionId}|${heroId}|${[...unlockedFeats].sort().join(',')}`
  const hit = resolved.get(key)
  if (hit) return hit

  const all = treeOf(factionId).nodes
  const overridesBySlot = new Map<string, TalentNode>()
  for (const node of all) {
    if (node.heroId === heroId) overridesBySlot.set(slotKey(node.branch, node.tier, node.fork), node)
  }

  const out: TalentNode[] = []
  for (const node of all) {
    // Another hero's override never appears in this hero's tree.
    if (node.heroId && node.heroId !== heroId) continue
    if (node.heroId === heroId) continue // added via the slot map below
    const slot = slotKey(node.branch, node.tier, node.fork)
    out.push(overridesBySlot.get(slot) ?? node)
  }
  // An override whose slot has no base node (shouldn't happen, but the data is
  // hand-written) still belongs in the tree rather than vanishing silently.
  for (const [slot, node] of overridesBySlot) {
    if (!out.some((n) => slotKey(n.branch, n.tier, n.fork) === slot)) out.push(node)
  }

  for (const option of COMMAND_FEAT_OPTIONS) {
    if (option.unlockedByFeat && unlockedFeats.includes(option.unlockedByFeat)) out.push(option)
  }

  resolved.set(key, out)
  return out
}

/** The options at one rung of one ladder — one node, or a fork's several. */
export function nodesAt(tree: readonly TalentNode[], branch: Branch, tier: Tier): TalentNode[] {
  return tree.filter((n) => n.branch === branch && n.tier === tier)
}

/** Structural check used by the data tests and by `npm run sim`. */
export function treeShapeProblems(tree: readonly TalentNode[]): string[] {
  const problems: string[] = []
  for (const branch of BRANCHES) {
    for (const tier of TIERS) {
      const here = nodesAt(tree, branch, tier)
      const forked = FORK_TIERS.includes(tier)
      if (here.length === 0) problems.push(`${branch} tier ${tier} is empty`)
      if (!forked && here.length !== 1) problems.push(`${branch} tier ${tier} should be a single node, has ${here.length}`)
      if (forked) {
        for (const fork of ['a', 'b'] as Fork[]) {
          if (!here.some((n) => n.fork === fork)) problems.push(`${branch} tier ${tier} is missing fork ${fork}`)
        }
        if (here.some((n) => !n.fork)) problems.push(`${branch} tier ${tier} has an unforked node`)
      } else if (here.some((n) => n.fork)) {
        problems.push(`${branch} tier ${tier} is not a fork tier but carries a fork`)
      }
    }
  }
  return problems
}
