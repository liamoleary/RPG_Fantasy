import { describe, expect, it } from 'vitest'
import { ALL_UNITS, PROMOTED_FORMS, isPromotedForm, unit } from '../src/data/index'
import { ZERO_MODS } from '../src/data/types'
import type { BoardStack } from '../src/engine/battle'
import {
  MAX_CAMP_TIER,
  inSameLine,
  lineChainTo,
  lineDepthOf,
  lineOf,
  newCamp,
  offerPool,
  promote,
  promoteOptions,
  recruitPlan,
} from '../src/engine/camp'
import { LINES, buildLineGraph } from '../src/engine/lines'
import { lineRootOf, rankDefOf } from '../src/engine/ranks'

/**
 * Forked lines (Design Notes 11 §2). A promotion line stopped being a list and
 * became a tree, and the migration promise is that nobody can tell: every line
 * that shipped in DN10 behaves identically, and the new shape only shows up
 * where a unit actually authors two paths.
 *
 * The tree logic is exercised against SYNTHETIC forks, because the graph is
 * built over an injected unit list rather than the registry — which means the
 * invariants were provable before a real forked line existed, without shipping
 * a fake unit into anyone's camp. The shipped lines are then asked the same
 * questions end to end, through the `promote`/`recruitPlan` the camp calls.
 */

const node = (id: string, ...linePaths: string[]) => (linePaths.length > 0 ? { id, linePaths } : { id })

function stack(unitId: string, count: number, slot: number): BoardStack {
  return { uid: `u_${unitId}`, unitId, count, slot, bonusAtk: 0, bonusHp: 0, growthTicks: 0, spent: 3, rank: 0 }
}

describe('the promotion graph — a straight line (§2.1)', () => {
  const g = buildLineGraph([node('a', 'b'), node('b', 'c'), node('c'), node('loner')])

  it('walks back to the root from every form', () => {
    expect(g.rootOf('a')).toBe('a')
    expect(g.rootOf('b')).toBe('a')
    expect(g.rootOf('c')).toBe('a')
  })

  it('counts depth as promotions from the root', () => {
    expect([g.depthOf('a'), g.depthOf('b'), g.depthOf('c')]).toEqual([0, 1, 2])
  })

  it('reads forward and backward along the one path', () => {
    expect(g.subtreeOf('a')).toEqual(['a', 'b', 'c'])
    expect(g.subtreeOf('b')).toEqual(['b', 'c'])
    expect(g.chainTo('c')).toEqual(['a', 'b', 'c'])
    expect(g.isLeaf('c')).toBe(true)
    expect(g.isLeaf('b')).toBe(false)
  })

  it('treats a unit outside any line as its own root, depth 0, leaf', () => {
    expect(g.rootOf('loner')).toBe('loner')
    expect(g.depthOf('loner')).toBe(0)
    expect(g.isLeaf('loner')).toBe(true)
    expect(g.subtreeOf('loner')).toEqual(['loner'])
  })

  it('puts every form after the root in the promoted set, and the root nowhere near it', () => {
    expect([...g.promotedForms].sort()).toEqual(['b', 'c'])
    expect(g.roots).toEqual(['a', 'loner'])
  })
})

describe('the promotion graph — a fork (§2.2)', () => {
  // seed → oak → oakApex
  //      ↘ thorn → thornApex
  const g = buildLineGraph([
    node('seed', 'oak', 'thorn'),
    node('oak', 'oakApex'),
    node('oakApex'),
    node('thorn', 'thornApex'),
    node('thornApex'),
  ])

  it('gives both branches the same root — one seed, one banner', () => {
    for (const id of ['oak', 'thorn', 'oakApex', 'thornApex']) expect(g.rootOf(id)).toBe('seed')
  })

  it('puts siblings at the same depth, so a recruit trains into either alike', () => {
    expect(g.depthOf('oak')).toBe(g.depthOf('thorn'))
    expect(g.depthOf('oakApex')).toBe(g.depthOf('thornApex'))
    expect(g.depthOf('oak')).toBe(1)
    expect(g.depthOf('oakApex')).toBe(2)
  })

  it('offers both ways down from the fork, in authored order', () => {
    expect(g.childrenOf('seed')).toEqual(['oak', 'thorn'])
    expect(g.childrenOf('oak')).toEqual(['oakApex'])
  })

  it('reads the whole tree forward from the root and one branch backward from a leaf', () => {
    expect(g.subtreeOf('seed')).toEqual(['seed', 'oak', 'oakApex', 'thorn', 'thornApex'])
    expect(g.chainTo('thornApex')).toEqual(['seed', 'thorn', 'thornApex'])
    expect(g.chainTo('oakApex')).toEqual(['seed', 'oak', 'oakApex'])
  })

  it('ends the line twice — a fork has two tops', () => {
    expect(g.subtreeOf('seed').filter((f) => g.isLeaf(f))).toEqual(['oakApex', 'thornApex'])
  })

  it('does not let one sibling reach the other: the choice is permanent', () => {
    expect(g.onSamePath('seed', 'oakApex')).toBe(true)
    expect(g.onSamePath('oakApex', 'seed')).toBe(true)
    expect(g.onSamePath('oak', 'thorn')).toBe(false)
    expect(g.onSamePath('oakApex', 'thornApex')).toBe(false)
  })
})

/**
 * A malformed line has to fail at load, not on someone's board. Two parents is
 * the one that matters most: Banner Ranks resolve through a single root, so a
 * form with two roots would carry two different sets of thresholds and the
 * stack's banner would depend on which way it was reached.
 */
describe('the graph refuses to build a line it cannot answer for', () => {
  it('rejects a path to a unit that does not exist', () => {
    expect(() => buildLineGraph([node('a', 'ghost')])).toThrow(/no such unit/)
  })

  it('rejects two lines converging on one form', () => {
    expect(() => buildLineGraph([node('a', 'c'), node('b', 'c'), node('c')])).toThrow(/already promotes from/)
  })

  it('rejects a form that promotes into itself', () => {
    expect(() => buildLineGraph([node('a', 'a')])).toThrow(/cannot promote into itself/)
  })

  it('rejects one form naming the same path twice', () => {
    expect(() => buildLineGraph([node('a', 'b', 'b'), node('b')])).toThrow(/repeat a target/)
  })

  it('rejects a ring with no root', () => {
    expect(() => buildLineGraph([node('a', 'b'), node('b', 'c'), node('c', 'a')])).toThrow(/loops/)
  })
})

/**
 * §7.1: the migration is invisible. These are the six lines DN10 shipped,
 * written out longhand — if the tree ever answers differently for one of them,
 * this is the test that says so.
 */
describe('every DN10 line still reads exactly as it did (§7.1)', () => {
  const SHIPPED: [string, string[]][] = [
    ['vg_militia', ['vg_militia', 'vg_footman', 'vg_champion']],
    ['vg_crossbow', ['vg_crossbow', 'vg_arbalest', 'vg_ballistier']],
    ['vd_sapling', ['vd_sapling', 'vd_thornbark', 'vd_elderbark']],
    ['vd_dryad', ['vd_dryad', 'vd_moonshade', 'vd_matriarch']],
    ['st_raider', ['st_raider', 'st_reaver', 'st_warlord']],
    ['st_slinger', ['st_slinger', 'st_harpooner', 'st_stormspear']],
  ]

  /**
   * What §7.1 promises is that the DN10 lines still BEHAVE identically, not
   * that nothing was ever added beside them — DN11 §2.3 deliberately forks
   * three of the six, so `lineOf(root)` legitimately returns four forms for
   * those. The invariant is the walk: root to top is the same sequence, at the
   * same depths, off the same root. New branches may hang off it; they may not
   * disturb it.
   */
  it.each(SHIPPED)('%s runs root → mid → top, unchanged', (root, forms) => {
    expect(lineChainTo(forms[forms.length - 1])).toEqual(forms)
    expect(lineOf(root).filter((f) => forms.includes(f))).toEqual(forms)
    forms.forEach((f, i) => {
      expect(lineRootOf(f)).toBe(root)
      expect(lineDepthOf(f)).toBe(i)
    })
  })

  /**
   * DN12 §3.4/§3.5. Both of these were standalone units the camp sold outright
   * — the Shieldmaiden at T2, the Colossus at T5 — and both are now rungs of a
   * line with a root beneath them. The chain is the whole of what commit 2
   * did, so it is pinned the same way the DN10 lines are.
   */
  const DN12: [string, string[]][] = [
    ['vg_shieldgirl', ['vg_shieldgirl', 'vg_shieldmaiden']],
    ['vg_cairn', ['vg_cairn', 'vg_bulwark', 'vg_colossus']],
  ]

  it.each(DN12)('%s runs root → … → top off its new root', (root, forms) => {
    expect(lineChainTo(forms[forms.length - 1])).toEqual(forms)
    forms.forEach((f, i) => {
      expect(lineRootOf(f)).toBe(root)
      expect(lineDepthOf(f)).toBe(i)
    })
  })

  it('takes the two forms DN12 promoted out of the camp with them', () => {
    // The camp sells roots (DN10 §3), so gaining a parent is exactly what stops
    // a unit being sellable. This is the offer-table move DN12 §7.2 expects.
    for (const id of ['vg_shieldmaiden', 'vg_colossus']) {
      expect(isPromotedForm(id), `${id} should now be reached by promotion`).toBe(true)
    }
    // ...and the mid-form of the Colossus line never was sellable either.
    expect(isPromotedForm('vg_bulwark')).toBe(true)
    for (const id of ['vg_shieldgirl', 'vg_cairn']) {
      expect(isPromotedForm(id), `${id} should be a sellable root`).toBe(false)
    }
  })

  it('leaves both new lines straight — the forks come later', () => {
    // §3.4 forks the Shieldmaiden into the two Aegis forms, but those units do
    // not exist yet and naming them early makes buildLineGraph throw at load.
    expect(unit('vg_shieldgirl').linePaths).toEqual(['vg_shieldmaiden'])
    expect(unit('vg_shieldmaiden').linePaths).toBeUndefined()
    expect(unit('vg_cairn').linePaths).toEqual(['vg_bulwark'])
    expect(unit('vg_bulwark').linePaths).toEqual(['vg_colossus'])
  })

  it('adds a second path to exactly the three lines DN11 §2.3 names', () => {
    const forked = SHIPPED.filter(([root]) => lineOf(root).length > 3).map(([root]) => root)
    expect(forked.sort()).toEqual(['st_slinger', 'vd_dryad', 'vg_militia'])
  })

  it('keeps the data layer and the engine layer agreeing on what is promoted', () => {
    // PROMOTED_FORMS is computed in src/data/ (which cannot import the engine)
    // and the graph computes it again from the same field. They must not drift.
    expect([...PROMOTED_FORMS].sort()).toEqual([...LINES.promotedForms].sort())
  })

  it('gives every promoted form exactly one predecessor', () => {
    for (const u of ALL_UNITS) {
      if (!isPromotedForm(u.id)) continue
      const parents = ALL_UNITS.filter((s) => s.linePaths?.includes(u.id))
      expect(parents.map((p) => p.id), `${u.id} must promote from exactly one form`).toHaveLength(1)
    }
  })

  it('builds the shipped graph without throwing — no line in src/data is malformed', () => {
    expect(() => buildLineGraph(ALL_UNITS)).not.toThrow()
  })
})

describe('promoteOptions (§2.1)', () => {
  const camp = (tier: number) => ({ ...newCamp(), tier })

  it('offers the next form once the camp tier reaches it, and not before', () => {
    const militia = stack('vg_militia', 6, 0)
    expect(promoteOptions(militia, camp(1))).toEqual([])
    expect(promoteOptions(militia, camp(2)).map((t) => t.id)).toEqual(['vg_footman'])
  })

  it('offers nothing at the end of a line, however rich the camp', () => {
    expect(promoteOptions(stack('vg_champion', 3, 0), camp(5))).toEqual([])
  })

  it('offers exactly one path for every line that shipped in DN10', () => {
    for (const u of ALL_UNITS) {
      const paths = u.linePaths ?? []
      if (paths.length === 0) continue
      expect(promoteOptions(stack(u.id, 4, 0), camp(5)).map((t) => t.id), u.id).toEqual(paths)
    }
  })
})

describe('promote takes a path (§2.1)', () => {
  const tier2 = { ...newCamp(), tier: 2 }

  it('still works with no path named — a straight line asks no question', () => {
    const res = promote([stack('vg_militia', 12, 0)], 20, 'u_vg_militia', tier2, ZERO_MODS)
    expect(res.ok).toBe(true)
    expect(res.board[0].unitId).toBe('vg_footman')
    expect(res.gold).toBe(17)
  })

  it('works with the path named explicitly, to the same result', () => {
    const res = promote([stack('vg_militia', 12, 0)], 20, 'u_vg_militia', tier2, ZERO_MODS, 'vg_footman')
    expect(res.ok).toBe(true)
    expect(res.board[0].unitId).toBe('vg_footman')
    expect(res.gold).toBe(17)
  })

  it('refuses a path this stack cannot take, and spends nothing', () => {
    const board = [stack('vg_militia', 12, 0)]
    const res = promote(board, 20, 'u_vg_militia', tier2, ZERO_MODS, 'vg_champion')
    expect(res.ok).toBe(false)
    expect(res.reason).toBe('Not a path this stack can take')
    expect(res.board[0].unitId).toBe('vg_militia')
    expect(res.gold).toBe(20)
  })

  it('refuses a path the camp tier has not opened', () => {
    const board = [stack('vg_militia', 12, 0)]
    const res = promote(board, 20, 'u_vg_militia', newCamp(), ZERO_MODS, 'vg_footman')
    expect(res.ok).toBe(false)
    expect(res.reason).toBe('Cannot promote')
    expect(res.gold).toBe(20)
  })

  it('carries the stack’s count and banner through the promotion, as before', () => {
    // A banner belongs to the line ROOT, so walking the line never takes it
    // away — which is exactly why the graph refuses a form with two parents.
    const veteran = { ...stack('vg_militia', 12, 0), rank: 1 }
    const res = promote([veteran], 20, 'u_vg_militia', tier2, ZERO_MODS, 'vg_footman')
    expect(res.board[0].count).toBe(12)
    expect(res.board[0].rank).toBe(1)
    expect(unit(res.board[0].unitId).tier).toBe(2)
  })
})

/**
 * The forks, end to end (§7.2). Commit 1 proved the tree logic against
 * synthetic graphs; these are the same questions asked of the shipped
 * Seedline, Forgeline, Whelpline and the three §2.3 twins, through the same
 * `promote`/`recruitPlan` the camp button calls.
 */
describe('a forked line, end to end (§7.2)', () => {
  const tier4 = { ...newCamp(), tier: 4 }
  const tier2 = { ...newCamp(), tier: 2 }

  const FORKS: [string, string, string][] = [
    ['vd_whisperseed', 'vd_oakfather', 'vd_blackthorn'],
    ['vg_apprentice', 'vg_runesmith', 'vg_warsmith'],
    ['st_whelp', 'st_drake', 'st_deepmaw'],
    ['vg_footman', 'vg_champion', 'vg_bannerguard'],
    ['vd_moonshade', 'vd_matriarch', 'vd_nightblade'],
    ['st_harpooner', 'st_stormspear', 'st_windspeaker'],
  ]

  it.each(FORKS)('%s offers both paths and refuses to guess between them', (root, a, b) => {
    const s = stack(root, 6, 0)
    expect(promoteOptions(s, tier4).map((t) => t.id)).toEqual([a, b])
    // The sheet exists because the engine will not choose for you.
    const blind = promote([s], 30, s.uid, tier4, ZERO_MODS)
    expect(blind.ok).toBe(false)
    expect(blind.reason).toBe('Choose a path')
  })

  it.each(FORKS)('%s reaches either path, count intact, from one purchase', (root, a, b) => {
    for (const target of [a, b]) {
      const s = stack(root, 9, 0)
      const res = promote([s], 30, s.uid, tier4, ZERO_MODS, target)
      expect(res.ok, `${root} -> ${target}`).toBe(true)
      expect(res.board).toHaveLength(1)
      expect(res.board[0].unitId).toBe(target)
      // Promotion re-dresses a company; it never costs it bodies (DN04 §1.1).
      expect(res.board[0].count).toBe(9)
    }
  })

  /** The new toy: one root, two stacks, two different futures in one run. */
  it('walks two stacks of one root down different paths, and never merges them', () => {
    const board = [
      { ...stack('vd_whisperseed', 8, 0), uid: 'oak' },
      { ...stack('vd_whisperseed', 6, 1), uid: 'thorn' },
    ]
    const first = promote(board, 30, 'oak', tier2, ZERO_MODS, 'vd_oakfather')
    expect(first.ok).toBe(true)
    const second = promote(first.board, 30, 'thorn', tier2, ZERO_MODS, 'vd_blackthorn')
    expect(second.ok).toBe(true)

    expect(second.board).toHaveLength(2)
    expect(second.board.find((s) => s.uid === 'oak')!.unitId).toBe('vd_oakfather')
    expect(second.board.find((s) => s.uid === 'thorn')!.unitId).toBe('vd_blackthorn')
    expect(second.board.find((s) => s.uid === 'oak')!.count).toBe(8)
    expect(second.board.find((s) => s.uid === 'thorn')!.count).toBe(6)
    // Siblings share a root and a banner, but they are no longer one company.
    expect(lineRootOf('vd_oakfather')).toBe(lineRootOf('vd_blackthorn'))
    expect(inSameLine('vd_oakfather', 'vd_blackthorn')).toBe(false)
  })

  it('trains a root recruit into whichever branch stack sits nearer the front', () => {
    // Both saplings are one promotion from the seed, so both are one step
    // ahead — the tie breaks on slot, and the recruits join the front-most.
    const board = [
      { ...stack('vd_blackthorn', 4, 2), uid: 'thorn' },
      { ...stack('vd_oakfather', 4, 0), uid: 'oak' },
    ]
    const plan = recruitPlan(board, 'vd_whisperseed', ZERO_MODS)
    expect(plan.target?.uid).toBe('oak')
    expect(plan.stepsBehind).toBe(1)
    // muster 3, one form behind -> halved to 1
    expect(plan.added).toBe(1)
  })

  it('re-slots a back-row line that ends in the front row', () => {
    // vd_moonshade is a back-row archer; the Nightblade fights in the front.
    const board = [{ ...stack('vd_moonshade', 4, 4), uid: 'archer' }]
    const res = promote(board, 30, 'archer', tier4, ZERO_MODS, 'vd_nightblade')
    expect(res.ok).toBe(true)
    expect(unit(res.board[0].unitId).row).toBe('front')
    expect(res.board[0].slot).toBeLessThan(4)
  })

  it('keeps the Banner Rank when a stack forks — the banner is the root’s', () => {
    const honored = { ...stack('st_whelp', 30, 0), rank: 2 }
    for (const target of ['st_drake', 'st_deepmaw']) {
      const res = promote([honored], 30, honored.uid, tier2, ZERO_MODS, target)
      expect(res.board[0].rank).toBe(2)
      expect(rankDefOf(target)?.honoredName).toBe('Stormbrood')
    }
  })
})

/**
 * AC3, extended to every line DN11 adds: 15 of the 18 new units are promotion
 * targets, so the camp must never sell one at any tier.
 */
describe('the camp still sells roots only, across the new lines (§7.3)', () => {
  it('offers the three new roots and none of the fifteen new forms', () => {
    const NEW_ROOTS = ['vd_whisperseed', 'vg_apprentice', 'st_whelp']
    const NEW_FORMS = [
      'vd_oakfather', 'vd_oakheart', 'vd_blackthorn', 'vd_reaper', 'vd_nightblade',
      'vg_runesmith', 'vg_runelord', 'vg_warsmith', 'vg_anvilborn', 'vg_bannerguard',
      'st_drake', 'st_wyvern', 'st_deepmaw', 'st_alpha', 'st_windspeaker',
    ]
    for (const factionId of ['vanguard', 'verdant', 'stormtide'] as const) {
      const ids = offerPool(factionId, MAX_CAMP_TIER).faction.map((u) => u.id)
      for (const id of NEW_FORMS) expect(ids, `${id} must never be sold`).not.toContain(id)
    }
    expect(offerPool('verdant', 1).faction.map((u) => u.id)).toContain(NEW_ROOTS[0])
    expect(offerPool('vanguard', 1).faction.map((u) => u.id)).toContain(NEW_ROOTS[1])
    expect(offerPool('stormtide', 1).faction.map((u) => u.id)).toContain(NEW_ROOTS[2])
  })
})
