/**
 * The War Council (Design Notes 05 §6): ladder gating, fork lock, hero override
 * substitution, six-points-max, effect parity, and rival pathing determinism.
 *
 * Effect parity is the load-bearing one. §6 promises that a recycled node
 * produces the identical engine effect its boon did, and the only way to keep
 * that promise across 65 hand-written nodes is to check every one against the
 * boon it names.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HARD_CAP_ROUND } from '../src/engine/run'
import { BOONS, BOON_BY_ID, HEROES } from '../src/data/index'
import {
  ALL_TALENTS,
  COMMAND_FEAT_OPTIONS,
  TALENT_BY_ID,
  TIERS,
  nodesAt,
  treeFor,
  treeShapeProblems,
  type Branch,
  type TalentNode,
} from '../src/data/talents/index'
import { ZERO_MODS } from '../src/data/types'
import { addMods } from '../src/data/types'
import { LEVEL_UP_ROUNDS,
  MAX_TALENT_POINTS,
  canTake,
  lockedOptions,
  nextTier,
  offersFor,
  pointsIn,
  rivalPick,
  treeForWarlord,
} from '../src/engine/talents'
import { applyTalent, newRun, player } from '../src/engine/run'
import { SAVE_KEY, SAVE_VERSION, loadSave } from '../src/state/persist'

const BRANCHES: Branch[] = ['might', 'magic', 'command']
const berrik = () => treeForWarlord('vanguard', 'h_berrik')

/** Walk a branch to the given depth, always taking fork 'a' where offered. */
function walk(tree: readonly TalentNode[], branch: Branch, depth: number): string[] {
  const taken: string[] = []
  for (let i = 0; i < depth; i++) {
    const offer = offersFor(tree, taken).find((o) => o.branch === branch)!
    taken.push(offer.options[0].id)
  }
  return taken
}

describe('effect parity (§6)', () => {
  it('every recycled node names a boon that exists', () => {
    for (const node of ALL_TALENTS) {
      if (!node.recycles) continue
      expect(BOON_BY_ID.get(node.recycles), `${node.id} recycles ${node.recycles}`).toBeDefined()
    }
  })

  it('every recycled node applies the identical mods its boon did', () => {
    for (const node of ALL_TALENTS) {
      if (!node.recycles) continue
      const boon = BOON_BY_ID.get(node.recycles)!
      expect(node.mods, `${node.id} vs ${boon.id}`).toEqual(boon.mods)
    }
  })

  it('produces the identical HeroMods through the real application path', () => {
    // Not just deep-equal data: run both through addMods and compare the result,
    // which is what the engine actually reads.
    for (const node of ALL_TALENTS) {
      if (!node.recycles) continue
      const boon = BOON_BY_ID.get(node.recycles)!
      expect(addMods(ZERO_MODS, node.mods)).toEqual(addMods(ZERO_MODS, boon.mods))
    }
  })

  it('accounts for every boon that ever existed', () => {
    const recycled = new Set(ALL_TALENTS.filter((n) => n.recycles).map((n) => n.recycles))
    const orphans = BOONS.filter((b) => !recycled.has(b.id)).map((b) => b.id)
    expect(orphans).toEqual([])
  })

  it('only one node is authored rather than recycled, and it is documented as such', () => {
    const authored = ALL_TALENTS.filter((n) => !n.recycles).map((n) => n.id)
    expect(authored).toEqual(['t_st_magic5'])
  })
})

describe('tree shape (§2.1)', () => {
  it('gives every hero three branches of five tiers, forking at 2 and 4', () => {
    for (const hero of HEROES) {
      const tree = treeFor(hero.faction, hero.id)
      expect(treeShapeProblems(tree), hero.id).toEqual([])
      expect(tree).toHaveLength(21) // 7 nodes x 3 branches
    }
  })

  it('has unique node ids', () => {
    expect(TALENT_BY_ID.size).toBe(ALL_TALENTS.length)
  })

  it('quotes its own payload, so copy and effect cannot drift apart (§8.1)', () => {
    for (const node of ALL_TALENTS) {
      expect(node.name.length, node.id).toBeGreaterThan(2)
      expect(node.text.length, node.id).toBeGreaterThan(8)
      expect(node.text.trim().endsWith('.'), `${node.id}: "${node.text}"`).toBe(true)

      // Any magnitude of 2 or more has to appear in the text. A 1 is often
      // written as a word or as an absolute ("Rerolls are free"), but there is
      // no natural way to say "+7 spell power" without the 7 — so this catches
      // a node whose numbers were tuned and whose copy was not.
      for (const value of Object.values(node.mods)) {
        if (typeof value !== 'number' || Math.abs(value) < 2) continue
        expect(node.text, `${node.id} claims ${value}`).toMatch(new RegExp(`\\b${Math.abs(value)}\\b`))
      }
    }
  })

})

describe('hero overrides (§3, §8.3)', () => {
  it('substitutes exactly two nodes per hero', () => {
    for (const hero of HEROES) {
      const mine = treeFor(hero.faction, hero.id).filter((n) => n.heroId === hero.id)
      expect(mine, hero.id).toHaveLength(2)
    }
  })

  it("never shows another hero's override", () => {
    for (const hero of HEROES) {
      for (const node of treeFor(hero.faction, hero.id)) {
        expect(node.heroId === undefined || node.heroId === hero.id, `${hero.id} saw ${node.id}`).toBe(true)
      }
    }
  })

  it('makes two heroes of one faction visibly different', () => {
    const berrikIds = treeFor('vanguard', 'h_berrik').map((n) => n.id).sort()
    const yseultIds = treeFor('vanguard', 'h_yseult').map((n) => n.id).sort()
    expect(berrikIds).not.toEqual(yseultIds)
  })

  it('keeps the slot it replaces — the ladder never changes shape', () => {
    for (const hero of HEROES) {
      expect(treeShapeProblems(treeFor(hero.faction, hero.id)), hero.id).toEqual([])
    }
  })
})

describe('ladder gating (§2.1)', () => {
  it('offers tier 1 of every branch on the first level-up', () => {
    const offers = offersFor(berrik(), [])
    expect(offers.map((o) => o.branch)).toEqual(BRANCHES)
    expect(offers.every((o) => o.tier === 1)).toBe(true)
  })

  it('advances only the branch you spent in', () => {
    const tree = berrik()
    const first = offersFor(tree, []).find((o) => o.branch === 'might')!.options[0]
    const offers = offersFor(tree, [first.id])
    expect(offers.find((o) => o.branch === 'might')!.tier).toBe(2)
    expect(offers.find((o) => o.branch === 'magic')!.tier).toBe(1)
    expect(offers.find((o) => o.branch === 'command')!.tier).toBe(1)
  })

  it('never allows a skip — a tier-3 node is unreachable with one point spent', () => {
    const tree = berrik()
    const tier3 = nodesAt(tree, 'might', 3)[0]
    expect(canTake(tree, [], tier3.id)).toBe(false)
    expect(canTake(tree, walk(tree, 'might', 2), tier3.id)).toBe(true)
  })

  it('exhausts a branch after five points', () => {
    const tree = berrik()
    const deep = walk(tree, 'might', 5)
    expect(pointsIn(tree, deep, 'might')).toBe(5)
    expect(nextTier(tree, deep, 'might')).toBeNull()
    expect(offersFor(tree, deep).some((o) => o.branch === 'might')).toBe(false)
  })

  it('offers two options at tiers 2 and 4 and one everywhere else (§2.3)', () => {
    const tree = berrik()
    for (const branch of BRANCHES) {
      for (const tier of TIERS) {
        const taken = walk(tree, branch, tier - 1)
        const offer = offersFor(tree, taken).find((o) => o.branch === branch)!
        expect(offer.options.length, `${branch} t${tier}`).toBe(tier === 2 || tier === 4 ? 2 : 1)
      }
    }
  })
})

describe('fork lock (§2.3)', () => {
  it('locks the option you did not take', () => {
    const tree = berrik()
    const t1 = offersFor(tree, []).find((o) => o.branch === 'might')!.options[0]
    const fork = offersFor(tree, [t1.id]).find((o) => o.branch === 'might')!
    const [chose, other] = fork.options
    const taken = [t1.id, chose.id]

    expect(canTake(tree, taken, other.id)).toBe(false)
    expect(lockedOptions(tree, taken).map((n) => n.id)).toContain(other.id)
  })

  it('does not lock a fork you have not reached yet', () => {
    const tree = berrik()
    expect(lockedOptions(tree, [])).toEqual([])
  })

  it('cannot take the same node twice', () => {
    const tree = berrik()
    const first = offersFor(tree, []).find((o) => o.branch === 'might')!.options[0]
    expect(canTake(tree, [first.id], first.id)).toBe(false)
  })
})

/**
 * §2.1's rule is "one point per level-up, no respec". The *count* moved from
 * six to eight when the banner went to 50 HP and runs got longer — five rounds
 * of a lobby with nothing left to earn is exactly the stretch that change
 * added. So these read the constant rather than the number six, and the one
 * test that pinned the number now pins the relationship instead.
 */
describe('one point per level-up, no respec (§2.1)', () => {
  it('refuses a point past the cap', () => {
    const tree = berrik()
    let taken = walk(tree, 'might', 5)
    // Spend the rest wherever the tree will still take them.
    while (taken.length < MAX_TALENT_POINTS) {
      const next = offersFor(tree, taken).flatMap((o) => o.options)[0]
      if (!next) break
      taken = [...taken, next.id]
    }
    expect(taken).toHaveLength(MAX_TALENT_POINTS)
    const next = offersFor(tree, taken)[0]?.options[0]
    if (next) expect(canTake(tree, taken, next.id)).toBe(false)
  })

  it('matches the number of level-up rounds exactly', () => {
    // The relationship is the rule; the number is free to move with run length.
    expect(MAX_TALENT_POINTS).toBe(LEVEL_UP_ROUNDS.length)
    // Every level-up has to land inside a run that can actually reach it.
    expect(Math.max(...LEVEL_UP_ROUNDS)).toBeLessThan(HARD_CAP_ROUND)
  })

  it('cannot reach two capstones, however many points a run grants', () => {
    const tree = berrik()
    const taken = walk(tree, 'might', 5)
    // One ladder climbed to its capstone. A second capstone needs five more
    // points in one branch, and the cap has to stay short of that or every
    // build converges on the same two ends.
    expect(nextTier(tree, taken, 'magic')).toBe(1)
    expect(MAX_TALENT_POINTS - taken.length, 'a run can now buy a second capstone').toBeLessThan(5)
  })
})

describe('feat-unlocked options (§2.3)', () => {
  it('are absent until the feat is held', () => {
    const without = treeFor('vanguard', 'h_berrik')
    expect(without.some((n) => n.unlockedByFeat)).toBe(false)
  })

  it('widen a fork rather than replacing it', () => {
    const feat = COMMAND_FEAT_OPTIONS[0]
    const base = nodesAt(treeFor('vanguard', 'h_berrik'), 'command', feat.tier).length
    const wider = nodesAt(treeFor('vanguard', 'h_berrik', [feat.unlockedByFeat!]), 'command', feat.tier).length
    expect(wider).toBe(base + 1)
  })

  it('are offered once unlocked', () => {
    const feat = COMMAND_FEAT_OPTIONS[0]
    const tree = treeFor('vanguard', 'h_berrik', [feat.unlockedByFeat!])
    const taken = walk(tree, 'command', feat.tier - 1)
    const offer = offersFor(tree, taken).find((o) => o.branch === 'command')!
    expect(offer.options.map((n) => n.id)).toContain(feat.id)
  })
})

describe('rival pathing (§5, §6)', () => {
  it('is deterministic — same offers, same pick, every time', () => {
    const tree = treeForWarlord('stormtide', 'h_grommash')
    const offers = offersFor(tree, [])
    const picks = Array.from({ length: 50 }, () => rivalPick(offers, 'aggro')?.id)
    expect(new Set(picks).size).toBe(1)
  })

  it('gives different archetypes different paths', () => {
    const tree = treeForWarlord('vanguard', 'h_berrik')
    const pathFor = (archetype: string) => {
      const taken: string[] = []
      while (taken.length < MAX_TALENT_POINTS) {
        const chosen = rivalPick(offersFor(tree, taken), archetype)
        if (!chosen) break
        taken.push(chosen.id)
      }
      return taken
    }
    expect(pathFor('economy')).not.toEqual(pathFor('aggro'))
  })

  it('never takes a feat-locked option — rivals hold no feats', () => {
    const tree = treeFor('vanguard', 'h_berrik', ['feat_promoter'])
    const offers = offersFor(tree, walk(tree, 'command', 1))
    for (let i = 0; i < 20; i++) expect(rivalPick(offers, 'economy')?.unlockedByFeat).toBeUndefined()
  })

  it('spends exactly six points over a full run and never more', () => {
    const run = newRun({ seed: 4242, factionId: 'verdant', heroId: 'h_sylvaen', difficulty: 'standard' })
    for (const w of run.warlords) {
      const tree = treeForWarlord(w.factionId, w.heroId)
      while (w.talentsTaken.length < MAX_TALENT_POINTS) {
        const chosen = rivalPick(offersFor(tree, w.talentsTaken), w.archetype)
        if (!chosen) break
        applyTalent(w, chosen)
      }
      expect(w.talentsTaken.length).toBeLessThanOrEqual(MAX_TALENT_POINTS)
    }
  })
})

describe('applying a talent (§6: effects unchanged)', () => {
  it('adds the mods and records the pick in order', () => {
    const run = newRun({ seed: 7, factionId: 'vanguard', heroId: 'h_berrik', difficulty: 'standard' })
    const p = player(run)
    const tree = treeForWarlord(p.factionId, p.heroId)
    const first = offersFor(tree, []).find((o) => o.branch === 'might')!.options[0]

    const before = p.mods.allAtk
    applyTalent(p, first)
    expect(p.talentsTaken).toEqual([first.id])
    expect(p.mods.allAtk).toBe(before + (first.mods.allAtk ?? 0))
  })

  it('still applies campTierUp immediately, as the boon did', () => {
    const run = newRun({ seed: 8, factionId: 'vanguard', heroId: 'h_berrik', difficulty: 'standard' })
    const p = player(run)
    const forward = ALL_TALENTS.find((n) => n.recycles === 'b_forwardcamp')!
    const tier = p.camp.tier
    applyTalent(p, forward)
    expect(p.camp.tier).toBe(tier + 1)
  })
})

describe('determinism of the run (§6)', () => {
  it('produces identical rival paths from the same seed', () => {
    const paths = () => {
      const run = newRun({ seed: 99, factionId: 'stormtide', heroId: 'h_zhala', difficulty: 'standard' })
      return run.warlords.map((w) => {
        const tree = treeForWarlord(w.factionId, w.heroId)
        const taken: string[] = []
        for (let i = 0; i < MAX_TALENT_POINTS; i++) {
          const chosen = rivalPick(offersFor(tree, taken), w.archetype)
          if (!chosen) break
          taken.push(chosen.id)
        }
        return taken.join('>')
      })
    }
    expect(paths()).toEqual(paths())
  })

  it('contains no RNG in the talent module at all (§6)', async () => {
    const source = await import('node:fs').then((fs) => fs.readFileSync('src/engine/talents.ts', 'utf8'))
    // Comments in this module discuss RNG's removal, so strip them before
    // looking — otherwise the test fails on its own explanation.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(code).not.toMatch(/Math\.random|\brng\b|from '\.\/rng'/)
  })
})

describe('upgrading a save from before the War Council', () => {
  const store = new Map<string, string>()
  beforeEach(() => {
    store.clear()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  const oldSave = (activeRun: unknown) => ({
    version: 1,
    renown: 137,
    unlocks: ['h_yseult'],
    feats: { first_win: true },
    stats: { runs: 9, wins: 2, bestPlacementByHero: { h_berrik: 1 } },
    settings: { speedDefault: 1, reducedMotion: false, difficulty: 'standard' },
    activeRun,
  })

  it('drops a run that predates talents rather than crashing on resume', () => {
    const legacyRun = { seed: 5, round: 4, warlords: [{ id: 'w0', boonsTaken: ['b_sharpened'] }] }
    localStorage.setItem(SAVE_KEY, JSON.stringify(oldSave(legacyRun)))
    expect(loadSave().activeRun).toBeNull()
  })

  it('keeps every scrap of meta-progression while doing it', () => {
    const legacyRun = { seed: 5, round: 4, warlords: [{ id: 'w0', boonsTaken: [] }] }
    localStorage.setItem(SAVE_KEY, JSON.stringify(oldSave(legacyRun)))
    const save = loadSave()
    expect(save.renown).toBe(137)
    expect(save.unlocks).toEqual(['h_yseult'])
    expect(save.feats).toEqual({ first_win: true })
    expect(save.stats).toEqual({ runs: 9, wins: 2, bestPlacementByHero: { h_berrik: 1 } })
  })

  it('keeps a run that already uses talents', () => {
    const modernRun = { seed: 5, round: 4, warlords: [{ id: 'w0', talentsTaken: ['t_vg_might1'] }] }
    localStorage.setItem(SAVE_KEY, JSON.stringify(oldSave(modernRun)))
    expect(loadSave().activeRun).not.toBeNull()
  })

  it('leaves the synced payload version alone, so server saves still load', () => {
    // Bumping SAVE_VERSION would make the client reject the copy the server
    // already holds and silently stop restoring progress (LAUNCH_PLAN §2).
    expect(SAVE_VERSION).toBe(1)
  })
})
