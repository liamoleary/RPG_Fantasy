/**
 * Headless balance harness (§13).
 *
 *   npm run sim -- --runs 2000 --difficulty standard
 *
 * Prints per-faction / per-hero placement tables, run-length distribution and
 * unit pick-vs-win deltas. Run it after ANY data change and treat regressions
 * like failing tests. Targets: faction avg placement 4.2–4.8, hero 4.0–5.0,
 * median run <= 14 rounds, p95 <= 16, no unit with a >8% win delta.
 */
import { ALL_UNITS, FACTIONS, HEROES, UNIT_BY_ID } from '../src/data/index'
import type { FactionId } from '../src/data/types'
import { ALL_TALENTS, TALENT_BY_ID, type TalentNode } from '../src/data/talents/index'
import { FRONT_SLOTS } from '../src/engine/battle'
import { HARD_CAP_ROUND, advanceRound, newRun, resolveBattles, type RunState } from '../src/engine/run'
import { boardPower, rivalMuster, NOISE, type Difficulty } from '../src/engine/rivals'
import { MAX_TALENT_POINTS, isLevelUpRound, scoreNode, type TalentOffer } from '../src/engine/talents'
import { applyTalent } from '../src/engine/run'
import { lineOf } from '../src/engine/camp'
import { lineRootOf, thresholdsFor } from '../src/engine/ranks'
import { hashSeed, makeRng, type RNG } from '../src/engine/rng'

interface Args {
  runs: number
  difficulty: Difficulty
  seed: number
  /** 'off' strips Cover from the data, for a like-for-like before/after */
  cover: 'on' | 'off'
}

function parseArgs(): Args {
  const a = process.argv.slice(2)
  const get = (flag: string, dflt: string): string => {
    const i = a.indexOf(`--${flag}`)
    return i >= 0 && a[i + 1] ? a[i + 1] : dflt
  }
  return {
    runs: Number(get('runs', '1000')),
    difficulty: get('difficulty', 'standard') as Difficulty,
    seed: Number(get('seed', '12345')),
    cover: get('cover', 'on') === 'off' ? 'off' : 'on',
  }
}

/**
 * Run the lobby as it was before Design Notes 02: strip the Cover keyword from
 * every unit and neutralise the Overwatch talent. Mutating the data
 * here rather than diffing against an older commit keeps the seeds, the rival
 * policies and the RNG stream identical, so the only difference measured is
 * the interception itself.
 */
function disableCover() {
  for (const u of ALL_UNITS) {
    const i = u.keywords.findIndex((k) => k.k === 'cover')
    if (i >= 0) u.keywords.splice(i, 1)
  }
  // Overwatch is now a talent node rather than a pool entry, and the ladder
  // has no gap to remove it into — zeroing its payload is the equivalent that
  // keeps every seed, policy and RNG stream identical.
  const node = ALL_TALENTS.find((n) => n.id === 't_vg_might4a')
  if (node) node.mods = {}
}

/**
 * What the shop actually sells, by tier and by phase of the run (DN04 §1).
 * The fix must kill T1 spam without killing T1 buying: the early game is
 * supposed to be cheap bodies.
 */
const buyMix = {
  early: new Map<number, number>(),
  late: new Map<number, number>(),
  /** recruits that trained up into a stack rather than starting one */
  converted: 0,
  merged: 0,
  total: 0,
}
const LATE_FROM = 7

function collectBuys(round: number, bought: { unitId: string; added: number; merged: boolean }[]) {
  for (const b of bought) {
    const tier = UNIT_BY_ID.get(b.unitId)?.tier ?? 1
    const m = round >= LATE_FROM ? buyMix.late : buyMix.early
    m.set(tier, (m.get(tier) ?? 0) + 1)
    buyMix.total++
    if (b.merged) {
      buyMix.merged++
      if (b.added < (UNIT_BY_ID.get(b.unitId)?.musterSize ?? 1)) buyMix.converted++
    }
  }
}

/**
 * Per-battle evidence for the RANKS section. Comparing END-OF-RUN boards can
 * only ever rediscover that warlords who survived longer bought more bodies,
 * so the rank question is asked one battle at a time, between boards of
 * comparable power.
 */
interface Duel {
  n: number
  won: number
}
/** duels decided by who holds more Honored (rank 2) stacks */
const honoredDuels: Duel = { n: 0, won: 0 }
/**
 * Control cohort: duels where both sides hold the same number of Honored
 * stacks but one holds more Veteran-only stacks. Rank 1 is a flat +1/unit,
 * so this cohort has the same *board shape* bias as the Honored one —
 * boardPower systematically undercounts wide stacks — without the milestone
 * skill. The difference between the two rates is what Rank 2 is actually
 * worth; either rate on its own mostly measures the heuristic's blind spot.
 */
const veteranDuels: Duel = { n: 0, won: 0 }

/**
 * Ranged legibility guardrails (Design Notes 02 §4). Counted per battle
 * inside the round loop — `run.reports` is replaced every round, so anything
 * read after the run only ever sees the final one.
 */
const rowDeaths = {
  battles: 0,
  ties: 0,
  withBackDeath: 0,
  withFrontDeath: 0,
  back: 0,
  front: 0,
  saves: 0,
  /** battles where at least one side actually fielded a front-row coverer */
  withCoverer: 0,
  /** back-row wipes in that subset — the number Cover is supposed to move */
  coveredBattlesWithBackDeath: 0,
}

function collectRowDeaths(run: RunState) {
  for (const r of run.reports) {
    rowDeaths.battles++
    if (r.winner === 'tie') rowDeaths.ties++
    let back = 0
    let front = 0
    // battleStart carries both opening boards, including Cover charges.
    const opening = r.result.events[0]
    const hasCoverer =
      opening?.t === 'battleStart' && [...opening.a, ...opening.b].some((sn) => sn.cover > 0)
    if (hasCoverer) rowDeaths.withCoverer++
    for (const e of r.result.events) {
      if (e.t === 'cover') rowDeaths.saves++
      if (e.t !== 'death') continue
      const dead = e.snap.find((sn) => sn.uid === e.uid)
      if (!dead) continue
      if (dead.slot >= FRONT_SLOTS) back++
      else front++
    }
    rowDeaths.back += back
    rowDeaths.front += front
    if (back > 0) rowDeaths.withBackDeath++
    if (front > 0) rowDeaths.withFrontDeath++
    if (hasCoverer && back > 0) rowDeaths.coveredBattlesWithBackDeath++
  }
}

function collectRankDuels(run: RunState) {
  for (const r of run.reports) {
    if (r.ghost || r.winner === 'tie') continue
    const a = run.warlords.find((w) => w.id === r.aId)
    const b = run.warlords.find((w) => w.id === r.bId)
    if (!a || !b) continue
    const pa = boardPower(a.board)
    const pb = boardPower(b.board)
    if (pa <= 0 || pb <= 0) continue
    // Only near-mirror matchups: otherwise this just measures board size again.
    if (Math.abs(Math.log(pa / pb)) > 0.15) continue

    const atRank = (w: typeof a, rank: number): number => w.board.filter((s) => (s.rank ?? 0) === rank).length
    const ha = atRank(a, 2)
    const hb = atRank(b, 2)
    if (ha !== hb) {
      honoredDuels.n++
      if (r.winner === (ha > hb ? 'a' : 'b')) honoredDuels.won++
      continue
    }
    const va = atRank(a, 1)
    const vb = atRank(b, 1)
    if (va === vb) continue
    veteranDuels.n++
    if (r.winner === (va > vb ? 'a' : 'b')) veteranDuels.won++
  }
}

/** The player seat is driven by a rival policy so every seat is comparable. */
/**
 * How the *simulated* player spends a point.
 *
 * Rivals are deterministic — that is the game (§5, §6). The simulated player
 * must not be, or §7's guardrails measure nothing: a single deterministic
 * scorer walks one path per hero and every fork reads 100/0, which says the
 * policy has a favourite, not that the tree is solved. To ask "is any path
 * dominant" you have to sample the space of builds a room full of people would
 * actually produce.
 *
 * So this samples proportional to how good each option looks, off the seeded
 * per-run stream. That is harness randomness, not game randomness — nothing
 * here runs in the app, and engine/talents.ts stays free of RNG.
 */
function simPlayerPick(offers: TalentOffer[], archetype: string, rng: RNG): TalentNode | null {
  const options = offers.flatMap((o) => o.options).filter((n) => !n.unlockedByFeat)
  if (options.length === 0) return null
  const scores = options.map((n) => Math.max(0.01, scoreNode(n, archetype)))
  const top = Math.max(...scores)
  // Sharpened enough that a plainly better node is usually taken, soft enough
  // that a close second is taken often — which is how people actually choose.
  const weights = scores.map((x) => Math.pow(x / top, 3))
  return rng.weighted(options, weights)
}

function playRunHeadless(run: RunState): RunState {
  let guard = 0
  while (!run.finished && guard++ < HARD_CAP_ROUND + 4) {
    const p = run.warlords.find((w) => w.isPlayer)!
    if (p.alive) {
      const rng = makeRng(hashSeed(`sim|${run.seed}|${run.round}|player`))
      if (isLevelUpRound(run.round) && run.talentOffer.length > 0) {
        const chosen = simPlayerPick(run.talentOffer, p.archetype, rng)
        if (chosen) applyTalent(p, chosen)
        run.talentOffer = []
      }
      const out = rivalMuster(
        {
          board: p.board,
          gold: p.gold,
          camp: p.camp,
          mods: p.mods,
          round: run.round,
          archetype: p.archetype,
          factionId: p.factionId,
          noise: NOISE[run.difficulty],
        },
        rng,
      )
      p.board = out.board
      p.camp = out.camp
      p.gold = out.gold
      collectBuys(run.round, out.bought)
    }
    resolveBattles(run)
    collectRankDuels(run)
    collectRowDeaths(run)
    if (run.finished) break
    advanceRound(run)
  }
  return run
}

/* ── DN05 §7 guardrails ─────────────────────────────────────────────────────
   Four questions the trees have to answer: is one path solved, is one branch
   eating every point, do runs reach a capstone, and is each fork a real
   choice. All four are counted per warlord, per run. */
const pathCounts = new Map<string, { n: number; wins: number }>()   // hero|id>id>… → runs
const branchPoints = new Map<string, number>()                      // branch → points placed
const forkPicks = new Map<string, Map<string, number>>()            // slot → nodeId → picks
let capstoneRuns = 0
let talentRuns = 0

function collectTalents(w: { heroId: string; factionId: FactionId; talentsTaken: string[]; placement: number | null }) {
  talentRuns++
  const placement = w.placement ?? 1

  // Path concentration is measured on the *full* six-pick sequence, in order —
  // §7's "no exact 6-pick sequence above 25% of wins".
  if (w.talentsTaken.length === MAX_TALENT_POINTS) {
    const key = `${w.heroId}|${w.talentsTaken.join('>')}`
    const b = pathCounts.get(key) ?? { n: 0, wins: 0 }
    b.n++
    if (placement === 1) b.wins++
    pathCounts.set(key, b)
  }

  let reachedCapstone = false
  for (const id of w.talentsTaken) {
    const node = TALENT_BY_ID.get(id)
    if (!node) continue
    branchPoints.set(node.branch, (branchPoints.get(node.branch) ?? 0) + 1)
    if (node.tier === 5) reachedCapstone = true
    if (node.fork) {
      // A fork is identified by faction+branch+tier: the same slot across every
      // run of that faction, whichever side was taken.
      const slot = `${w.factionId} ${node.branch} T${node.tier}`
      const inner = forkPicks.get(slot) ?? new Map<string, number>()
      inner.set(node.id, (inner.get(node.id) ?? 0) + 1)
      forkPicks.set(slot, inner)
    }
  }
  if (reachedCapstone) capstoneRuns++
}

interface Bucket {
  n: number
  placementSum: number
  wins: number
}
const bump = (m: Map<string, Bucket>, k: string, placement: number) => {
  const b = m.get(k) ?? { n: 0, placementSum: 0, wins: 0 }
  b.n++
  b.placementSum += placement
  if (placement === 1) b.wins++
  m.set(k, b)
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`
}

function table(title: string, rows: [string, string][][]) {
  console.log(`\n${title}`)
  console.log('─'.repeat(74))
  for (const row of rows) {
    console.log(row.map(([label, v]) => `${label}${v}`).join('  '))
  }
}

function main() {
  const args = parseArgs()
  if (args.cover === 'off') disableCover()
  const t0 = Date.now()

  const byFaction = new Map<string, Bucket>()
  const byHero = new Map<string, Bucket>()
  const byArchetype = new Map<string, Bucket>()
  const unitSeen = new Map<string, { drafted: number; wonWith: number }>()
  const lengths: number[] = []

  // Banner Rank adoption and its effect on placement (§3.4).
  let rankBoards = 0
  let boardsWithVeteran = 0
  let boardsWithHonored = 0
  const honoredSeat = { n: 0, placementSum: 0, top2: 0 }
  const plainSeat = { n: 0, placementSum: 0, top2: 0 }
  // Honored vs "none" is dominated by survivorship: a warlord who lasted 14
  // rounds bought 14 rounds of bodies. The honest control is the NEAR-MISS
  // cohort — boards that also grew a big stack but stopped short of Rank 2 —
  // which isolates what the reward itself is worth.
  const nearMissSeat = { n: 0, placementSum: 0, top2: 0 }
  const honoredByLine = new Map<string, number>()

  /**
   * Promotion-line adoption (Design Notes 03 §5.2). Every faction now has one
   * melee and one ranged 3-form line; the question this answers is whether the
   * ranged ones actually get walked to the top now that they have a top, or
   * whether the line is entered and abandoned at Tier 2.
   */
  const LINES = ALL_UNITS.filter((u) => u.lineNext && lineRootOf(u.id) === u.id).map((root) => {
    const forms = lineOf(root.id)
    return { root: root.id, forms: new Set(forms), top: forms[forms.length - 1] }
  })
  const lineSeat = new Map<string, { held: number; top: number; topPlacementSum: number }>()

  for (let i = 0; i < args.runs; i++) {
    const seed = args.seed + i * 7919
    const rng = makeRng(seed)
    const f = rng.pick(FACTIONS)
    const heroes = HEROES.filter((h) => h.faction === f.id)
    const hero = rng.pick(heroes)
    let run = newRun({ seed, factionId: f.id, heroId: hero.id, difficulty: args.difficulty })
    run = playRunHeadless(run)

    lengths.push(run.round)
    for (const w of run.warlords) {
      const placement = w.placement ?? 1
      bump(byFaction, w.factionId, placement)
      bump(byHero, w.heroId, placement)
      bump(byArchetype, w.archetype, placement)
      // §7 asks about players' builds; rivals are deterministic by design and
      // would swamp every distribution with one path per archetype.
      if (w.isPlayer) collectTalents(w)
      if (w.board.length > 0) {
        rankBoards++
        const best = w.board.reduce((n, s) => Math.max(n, s.rank ?? 0), 0)
        if (best >= 1) boardsWithVeteran++
        if (best >= 2) boardsWithHonored++
        const seat = best >= 2 ? honoredSeat : plainSeat
        seat.n++
        seat.placementSum += placement
        if (placement <= 2) seat.top2++
        const nearMiss =
          best < 2 &&
          w.board.some((s) => {
            const th = thresholdsFor(s.unitId)
            return th !== null && s.count >= th[1] * 0.75
          })
        if (nearMiss) {
          nearMissSeat.n++
          nearMissSeat.placementSum += placement
          if (placement <= 2) nearMissSeat.top2++
        }
        for (const s of w.board) {
          if ((s.rank ?? 0) < 2) continue
          const line = lineRootOf(s.unitId)
          honoredByLine.set(line, (honoredByLine.get(line) ?? 0) + 1)
        }
        // Once per board, not once per stack — two Militia stacks are still
        // one seat that chose the Militia line.
        for (const ln of LINES) {
          const held = w.board.some((s) => ln.forms.has(s.unitId))
          if (!held) continue
          const rec = lineSeat.get(ln.root) ?? { held: 0, top: 0, topPlacementSum: 0 }
          rec.held++
          if (w.board.some((s) => s.unitId === ln.top)) {
            rec.top++
            rec.topPlacementSum += placement
          }
          lineSeat.set(ln.root, rec)
        }
      }
      const seenThisRun = new Set(w.board.map((s) => s.unitId))
      for (const uidStr of seenThisRun) {
        const rec = unitSeen.get(uidStr) ?? { drafted: 0, wonWith: 0 }
        rec.drafted++
        if (placement <= 2) rec.wonWith++
        unitSeen.set(uidStr, rec)
      }
    }
  }

  lengths.sort((a, b) => a - b)
  const median = lengths[Math.floor(lengths.length / 2)]
  const p95 = lengths[Math.floor(lengths.length * 0.95)]
  const elapsed = Date.now() - t0

  console.log(`\nBANNERFELL — balance harness`)
  console.log(`${args.runs} lobbies · difficulty ${args.difficulty} · seed ${args.seed} · Cover ${args.cover} · ${elapsed}ms (${(elapsed / args.runs).toFixed(1)}ms/run)`)

  table(
    'FACTION            avg place   win%    n      target 4.2–4.8',
    [...byFaction.entries()]
      .sort((a, b) => a[1].placementSum / a[1].n - b[1].placementSum / b[1].n)
      .map(([k, b]) => {
        const avg = b.placementSum / b.n
        const flag = avg < 4.2 || avg > 4.8 ? '  ⚠' : ''
        return [
          [k.padEnd(18), ''],
          [avg.toFixed(2).padStart(9), ''],
          [pct(b.wins / b.n).padStart(8), ''],
          [String(b.n).padStart(7), flag],
        ] as [string, string][]
      }),
  )

  table(
    'HERO                       avg place   win%    n     target 4.0–5.0',
    [...byHero.entries()]
      .sort((a, b) => a[1].placementSum / a[1].n - b[1].placementSum / b[1].n)
      .map(([k, b]) => {
        const avg = b.placementSum / b.n
        const flag = avg < 4.0 || avg > 5.0 ? '  ⚠' : ''
        return [
          [k.padEnd(26), ''],
          [avg.toFixed(2).padStart(9), ''],
          [pct(b.wins / b.n).padStart(8), ''],
          [String(b.n).padStart(7), flag],
        ] as [string, string][]
      }),
  )

  table(
    'ARCHETYPE          avg place   win%    n',
    [...byArchetype.entries()]
      .sort((a, b) => a[1].placementSum / a[1].n - b[1].placementSum / b[1].n)
      .map(([k, b]) => [
        [k.padEnd(18), ''],
        [(b.placementSum / b.n).toFixed(2).padStart(9), ''],
        [pct(b.wins / b.n).padStart(8), ''],
        [String(b.n).padStart(7), ''],
      ] as [string, string][]),
  )

  // Compare each unit against its OWN TIER, not the whole roster. A flat
  // baseline just rediscovers that boards holding tier-5 units are winning
  // boards, which says nothing about whether a unit is an auto-pick.
  const tierTotals = new Map<number, { drafted: number; wonWith: number }>()
  for (const [id, r] of unitSeen) {
    const tier = UNIT_BY_ID.get(id)?.tier ?? 1
    const t = tierTotals.get(tier) ?? { drafted: 0, wonWith: 0 }
    t.drafted += r.drafted
    t.wonWith += r.wonWith
    tierTotals.set(tier, t)
  }
  const deltas = [...unitSeen.entries()]
    .filter(([, r]) => r.drafted >= 40)
    .map(([id, r]) => {
      const tier = UNIT_BY_ID.get(id)?.tier ?? 1
      const t = tierTotals.get(tier)!
      return { id, tier, delta: r.wonWith / r.drafted - t.wonWith / t.drafted, n: r.drafted }
    })
    .sort((a, b) => b.delta - a.delta)

  table(
    `UNIT WIN-DELTA vs same-tier baseline (top-2 rate)   flag >8%`,
    [...deltas.slice(0, 6), ...deltas.slice(-6)].map((d) => {
      const name = UNIT_BY_ID.get(d.id)?.name ?? d.id
      return [
        [`T${d.tier} ${name}`.padEnd(30), ''],
        [`${d.delta >= 0 ? '+' : ''}${(d.delta * 100).toFixed(1)}%`.padStart(8), ''],
        [String(d.n).padStart(8), Math.abs(d.delta) > 0.08 ? '  ⚠' : ''],
      ] as [string, string][]
    }),
  )

  const avg = (b: { n: number; placementSum: number }): number => (b.n > 0 ? b.placementSum / b.n : 0)
  const honAvg = avg(honoredSeat)
  const plainAvg = avg(plainSeat)
  const nearAvg = avg(nearMissSeat)
  const honWin = honoredDuels.n > 0 ? honoredDuels.won / honoredDuels.n : 0.5
  const vetWin = veteranDuels.n > 0 ? veteranDuels.won / veteranDuels.n : 0.5
  const duelEdge = honWin - vetWin

  table(
    'RANKS              adoption and power-matched edge      flag >8% over the control',
    [
      [
        ['boards with a Veteran stack'.padEnd(34), ''],
        [pct(rankBoards > 0 ? boardsWithVeteran / rankBoards : 0).padStart(9), ''],
        [`  of ${rankBoards} boards`, ''],
      ],
      [
        ['boards with an Honored stack'.padEnd(34), ''],
        [pct(rankBoards > 0 ? boardsWithHonored / rankBoards : 0).padStart(9), ''],
        [`  of ${rankBoards} boards`, ''],
      ],
      [
        ['avg place — Honored holders'.padEnd(34), ''],
        [honAvg.toFixed(2).padStart(9), ''],
        [`  n ${honoredSeat.n}`, ''],
      ],
      [
        ['avg place — no Honored stack'.padEnd(34), ''],
        [plainAvg.toFixed(2).padStart(9), ''],
        [`  n ${plainSeat.n} · survivorship-heavy, informational`, ''],
      ],
      [
        ['avg place — near-miss (75%+, no rank 2)'.padEnd(34), ''],
        [nearAvg.toFixed(2).padStart(9), ''],
        [`  n ${nearMissSeat.n}`, ''],
      ],
      [
        ['power-matched: more Honored wins'.padEnd(34), ''],
        [pct(honWin).padStart(9), ''],
        [`  n ${honoredDuels.n} battles`, ''],
      ],
      [
        ['power-matched: more Veteran wins'.padEnd(34), ''],
        [pct(vetWin).padStart(9), ''],
        [`  n ${veteranDuels.n} battles · control`, ''],
      ],
      [
        ['Honored edge over the control'.padEnd(34), ''],
        [`${duelEdge >= 0 ? '+' : ''}${(duelEdge * 100).toFixed(1)}%`.padStart(9), ''],
        ['', duelEdge > 0.08 ? '  ⚠ Honored stacks dominate — raise thresholds or flatten rewards' : ''],
      ],
    ] as [string, string][][],
  )

  table(
    'HONORED STACKS BY LINE   count (top 8)',
    [...honoredByLine.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([line, n]) => [
        [(UNIT_BY_ID.get(line)?.name ?? line).padEnd(30), ''],
        [String(n).padStart(8), ''],
      ] as [string, string][]),
  )

  console.log(`\nRUN LENGTH   median ${median} (target ≤14)   p95 ${p95} (target ≤16)   min ${lengths[0]}   max ${lengths[lengths.length - 1]}`)
  // Design Notes 02 §4: the whole point of Cover is fewer back-row wipes.
  const rd = rowDeaths
  table(
    `RANGED (Cover ${args.cover})       per battle across the whole run`,
    [
      [
        ['battles with a back-row wipe'.padEnd(34), ''],
        [pct(rd.withBackDeath / rd.battles).padStart(9), ''],
        [`  ${rd.withBackDeath} of ${rd.battles}`, ''],
      ],
      [
        ['battles with a front-row wipe'.padEnd(34), ''],
        [pct(rd.withFrontDeath / rd.battles).padStart(9), ''],
        [`  ${rd.withFrontDeath} of ${rd.battles}`, ''],
      ],
      [
        ['back-row stacks wiped per battle'.padEnd(34), ''],
        [(rd.back / rd.battles).toFixed(3).padStart(9), ''],
        ['', ''],
      ],
      [
        ['front-row stacks wiped per battle'.padEnd(34), ''],
        [(rd.front / rd.battles).toFixed(3).padStart(9), ''],
        ['', ''],
      ],
      [
        ['battles with a coverer present'.padEnd(34), ''],
        [pct(rd.withCoverer / rd.battles).padStart(9), ''],
        [`  ${rd.withCoverer} of ${rd.battles}`, ''],
      ],
      [
        ['  ...of those, a back-row wipe'.padEnd(34), ''],
        [pct(rd.withCoverer ? rd.coveredBattlesWithBackDeath / rd.withCoverer : 0).padStart(9), ''],
        ['  the subset Cover can move', ''],
      ],
      [
        ['Cover saves per battle'.padEnd(34), ''],
        [(rd.saves / rd.battles).toFixed(3).padStart(9), ''],
        [`  ${rd.saves} total`, ''],
      ],
      [
        ['  ...per battle with a coverer'.padEnd(34), ''],
        [(rd.withCoverer ? rd.saves / rd.withCoverer : 0).toFixed(3).padStart(9), ''],
        ['', ''],
      ],
    ] as [string, string][][],
  )

  // Volley must survive the counterplay, and the Cover carriers must not
  // become auto-picks now that they do two defensive jobs (§4).
  const tierBase = (tier: number) => {
    const t = tierTotals.get(tier)
    return t ? t.wonWith / t.drafted : 0
  }
  const watchlist = [
    ['VOLLEY', ALL_UNITS.filter((u) => u.keywords.some((k) => k.k === 'volley')).map((u) => u.id)],
    ['COVER', ['vg_shieldmaiden', 'mc_pikewall', 'vg_colossus']],
  ] as const
  table(
    'WATCHLIST                     win-delta vs same tier      flag >8%',
    watchlist.flatMap(([group, ids]) =>
      ids
        .map((id) => {
          const rec = unitSeen.get(id)
          const u = UNIT_BY_ID.get(id)
          if (!rec || !u || rec.drafted < 40) return null
          const delta = rec.wonWith / rec.drafted - tierBase(u.tier)
          return [
            [`${group.padEnd(7)} T${u.tier} ${u.name}`.padEnd(32), ''],
            [`${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)}%`.padStart(8), ''],
            [String(rec.drafted).padStart(8), Math.abs(delta) > 0.08 ? '  ⚠' : ''],
          ] as [string, string][]
        })
        .filter((r): r is [string, string][] => r !== null),
    ),
  )

  const mixRow = (label: string, m: Map<number, number>) => {
    const total = [...m.values()].reduce((n, v) => n + v, 0)
    return [
      [label.padEnd(22), ''],
      ...[1, 2, 3, 4, 5].map((t) => [`T${t} ${pct(total > 0 ? (m.get(t) ?? 0) / total : 0)}`.padStart(11), ''] as [string, string]),
    ] as [string, string][]
  }
  table(
    `BUY MIX                share of recruits by tier   (late = round ${LATE_FROM}+)`,
    [
      mixRow('rounds 1–' + (LATE_FROM - 1), buyMix.early),
      mixRow(`rounds ${LATE_FROM}+`, buyMix.late),
      [
        ['recruits that merged'.padEnd(22), ''],
        [pct(buyMix.total > 0 ? buyMix.merged / buyMix.total : 0).padStart(11), `  of ${buyMix.total} buys`],
      ],
      [
        ['  ...trained up (§1.1)'.padEnd(22), ''],
        [pct(buyMix.total > 0 ? buyMix.converted / buyMix.total : 0).padStart(11), '  arrived below full muster'],
      ],
    ] as [string, string][][],
  )

  table(
    'PROMOTION LINES        boards holding   reached the top   avg place at the top',
    LINES.map((ln) => {
      const rec = lineSeat.get(ln.root) ?? { held: 0, top: 0, topPlacementSum: 0 }
      const topName = UNIT_BY_ID.get(ln.top)?.name ?? ln.top
      const ranged = UNIT_BY_ID.get(ln.root)?.row === 'back'
      return [
        [`${ranged ? 'ranged' : 'melee '} ${topName}`.padEnd(30), ''],
        [pct(rankBoards > 0 ? rec.held / rankBoards : 0).padStart(9), ''],
        [pct(rec.held > 0 ? rec.top / rec.held : 0).padStart(12), ''],
        [
          (rec.top > 0 ? rec.topPlacementSum / rec.top : 0).toFixed(2).padStart(12),
          // DN04 §3: past ~80% the ultimate has stopped being a choice.
          `  n ${rec.top}${rec.held > 0 && rec.top / rec.held > 0.8 ? '  ⚠ raise the charge' : ''}`,
        ],
      ] as [string, string][]
    }),
  )

  // Apex holders must not become auto-picks: the fantasy is the moment, not
  // permanent DPS (DN04 §3).
  const APEX_IDS = ALL_UNITS.filter((u) => u.apex).map((u) => u.id)
  table(
    'APEX UNITS                    win-delta vs same tier      flag >8%',
    APEX_IDS.map((id) => {
      const rec = unitSeen.get(id)
      const u = UNIT_BY_ID.get(id)
      if (!rec || !u) return null
      const delta = rec.drafted >= 40 ? rec.wonWith / rec.drafted - tierBase(u.tier) : 0
      return [
        [`${u.apex?.name ?? ''}`.padEnd(20), ''],
        [`${u.name}`.padEnd(24), ''],
        [`${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)}%`.padStart(8), ''],
        [String(rec.drafted).padStart(8), Math.abs(delta) > 0.08 ? '  ⚠' : ''],
      ] as [string, string][]
    }).filter((r): r is [string, string][] => r !== null),
  )

  // ── DN05 §7 guardrails ───────────────────────────────────────────────────
  const totalPoints = [...branchPoints.values()].reduce((a, b) => a + b, 0)
  const totalWins = [...pathCounts.values()].reduce((a, b) => a + b.wins, 0)

  table(
    'PATH CONCENTRATION            runs    win%   share of wins   target ≤25%',
    [...pathCounts.entries()]
      .sort((a, b) => b[1].wins - a[1].wins)
      .slice(0, 8)
      .map(([key, b]) => {
        const share = totalWins > 0 ? b.wins / totalWins : 0
        const [hero, path] = key.split('|')
        const short = path
          .split('>')
          .map((id) => TALENT_BY_ID.get(id)?.name.split(' ')[0] ?? id)
          .join('>')
        return [
          [`${hero.replace('h_', '').padEnd(9)} ${short}`.slice(0, 44).padEnd(44), ''],
          [String(b.n).padStart(6), ''],
          [pct(b.wins / b.n).padStart(8), ''],
          [pct(share).padStart(9), share > 0.25 ? '  ⚠' : ''],
        ] as [string, string][]
      }),
  )

  table(
    'BRANCH DISTRIBUTION   points   share    target ≤50%',
    [...branchPoints.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([branch, n]) => {
        const share = n / totalPoints
        return [
          [branch.padEnd(20), ''],
          [String(n).padStart(7), ''],
          [pct(share).padStart(8), share > 0.5 ? '  ⚠' : ''],
        ] as [string, string][]
      }),
  )

  const capRate = talentRuns > 0 ? capstoneRuns / talentRuns : 0
  console.log(
    `\nCAPSTONE RATE  ${pct(capRate)} of runs reach a capstone (target 30–50%)${capRate < 0.3 || capRate > 0.5 ? '  ⚠' : ''}`,
  )

  const forkRows = [...forkPicks.entries()].sort()
  let healthy = 0
  table(
    'FORK HEALTH                        option A / option B      target 30–70%',
    forkRows.map(([slot, inner]) => {
      const options = [...inner.entries()].sort()
      const total = options.reduce((a, [, n]) => a + n, 0)
      const shares = options.map(([, n]) => n / total)
      // A fork only counts as healthy if BOTH sides land in the band, which for
      // a two-option fork is the same statement made twice — but a feat-widened
      // fork can have three, and then it matters.
      const ok = shares.length > 1 && shares.every((x) => x >= 0.3 && x <= 0.7)
      if (ok) healthy++
      const label = options
        .map(([id, n]) => `${TALENT_BY_ID.get(id)?.name.split(' ')[0] ?? id} ${pct(n / total)}`)
        .join(' / ')
      return [
        [slot.padEnd(30), ''],
        [label.padEnd(30), ok ? '' : '  ⚠'],
      ] as [string, string][]
    }),
  )
  const healthyShare = forkRows.length > 0 ? healthy / forkRows.length : 0
  console.log(
    `\nFORK HEALTH    ${healthy}/${forkRows.length} forks inside 30–70% (${pct(healthyShare)}; §8.7 wants ≥80%)${healthyShare < 0.8 ? '  ⚠' : ''}`,
  )

  console.log(`BATTLES      ${rd.battles} resolved · ${pct(rd.ties / rd.battles)} ties`)
  console.log('')
}

main()
