/**
 * The promotion graph (Design Notes 11 §2).
 *
 * A line used to be a list. `lineNext` pointed at one form, so every question
 * about a line was an array index: the root was a walk backwards, the depth was
 * `indexOf`, and "what does this become" had exactly one answer.
 *
 * `linePaths` makes it a TREE. A fork has two ways down, and the whole point of
 * the system is that one root can produce two different stacks in one run — so
 * "which form is next" stops being a fact about the unit and becomes a decision
 * the player makes at the Promote button.
 *
 * Every question the engine asks about that tree is answered here, once, over a
 * graph built from a unit list rather than the global registry. Two reasons:
 * the module stays pure and seeded like the rest of the engine, and the tree
 * invariants below can be tested against synthetic forks without shipping a
 * fake unit into anyone's camp.
 *
 * The invariants are enforced at build time, not trusted:
 *
 *   - every path target exists
 *   - every form has at most ONE parent — two lines may not converge, because
 *     Banner Ranks resolve through a single root and a form with two roots has
 *     two different sets of thresholds
 *   - no cycles
 *
 * A data typo therefore fails loudly at load, the same way `unit()` already
 * throws on an unknown id, instead of quietly giving a stack the wrong banner.
 */

import { ALL_UNITS } from '../data/index'

/** The slice of a UnitDef this module needs. Keeps the graph testable. */
export interface LineNode {
  id: string
  linePaths?: string[]
}

export interface LineGraph {
  /** the form at the top of this form's tree — itself, if it has no parent */
  rootOf(id: string): string
  /** how many promotions from the root — 0 is the form you buy */
  depthOf(id: string): number
  /** what this form can promote into, in authored order */
  childrenOf(id: string): string[]
  /** every form reachable from `id`, pre-order, `id` first */
  subtreeOf(id: string): string[]
  /** root → … → id, the promotions actually walked to reach this form */
  chainTo(id: string): string[]
  /** a form that promotes into nothing — the end of one path */
  isLeaf(id: string): boolean
  /** true when a and b lie on a single root-to-leaf path (one can reach the
   *  other by promoting). Two siblings of a fork share a root but not a path. */
  onSamePath(a: string, b: string): boolean
  /** every form that is reached by promotion — i.e. is somebody's path target */
  promotedForms: ReadonlySet<string>
  /** every form with no parent: the roots, and every unit outside a line */
  roots: readonly string[]
}

export function buildLineGraph(units: readonly LineNode[]): LineGraph {
  const ids = new Set(units.map((u) => u.id))
  const children = new Map<string, string[]>()
  const parent = new Map<string, string>()

  for (const u of units) {
    const paths = u.linePaths ?? []
    if (paths.length === 0) continue
    // Checked before the parent map is touched: a form naming the same target
    // twice would otherwise trip the two-parents rule against itself and report
    // a conflict with its own author, which reads as a puzzle rather than a typo.
    if (new Set(paths).size !== paths.length) throw new Error(`line paths of ${u.id} repeat a target`)
    for (const next of paths) {
      if (!ids.has(next)) throw new Error(`line path ${u.id} -> ${next}: no such unit`)
      if (next === u.id) throw new Error(`line path ${u.id} -> ${next}: a form cannot promote into itself`)
      const held = parent.get(next)
      if (held) throw new Error(`line path ${u.id} -> ${next}: ${next} already promotes from ${held}`)
      parent.set(next, u.id)
    }
    children.set(u.id, [...paths])
  }

  // One parent each and no self-links means the only way left to be cyclic is a
  // ring with no root, which the walk detects by revisiting a form.
  const root = new Map<string, string>()
  const depth = new Map<string, number>()
  for (const u of units) {
    const walked: string[] = []
    const seen = new Set<string>()
    let cur = u.id
    while (!seen.has(cur)) {
      seen.add(cur)
      walked.push(cur)
      const p = parent.get(cur)
      if (!p) break
      cur = p
    }
    if (seen.has(parent.get(cur) ?? '')) throw new Error(`promotion line through ${u.id} loops`)
    root.set(u.id, cur)
    depth.set(u.id, walked.length - 1)
  }

  const kids = (id: string): string[] => children.get(id) ?? []

  const subtree = (id: string): string[] => {
    const out: string[] = []
    const walk = (cur: string) => {
      out.push(cur)
      for (const c of kids(cur)) walk(c)
    }
    walk(id)
    return out
  }

  const chain = (id: string): string[] => {
    const out: string[] = [id]
    let cur = id
    for (;;) {
      const p = parent.get(cur)
      if (!p) break
      out.push(p)
      cur = p
    }
    return out.reverse()
  }

  const promotedForms = new Set(parent.keys())

  return {
    rootOf: (id) => root.get(id) ?? id,
    depthOf: (id) => depth.get(id) ?? 0,
    childrenOf: kids,
    subtreeOf: subtree,
    chainTo: chain,
    isLeaf: (id) => kids(id).length === 0,
    onSamePath: (a, b) => a === b || chain(a).includes(b) || chain(b).includes(a),
    promotedForms,
    roots: units.filter((u) => !parent.has(u.id)).map((u) => u.id),
  }
}

/**
 * The shipped graph. Built once at load — which is also where a malformed line
 * in `src/data/` announces itself, before a single stack is on a board.
 */
export const LINES: LineGraph = buildLineGraph(ALL_UNITS)
