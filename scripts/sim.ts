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
import { FACTIONS, HEROES, UNIT_BY_ID } from '../src/data/index'
import { HARD_CAP_ROUND, advanceRound, newRun, resolveBattles, type RunState } from '../src/engine/run'
import { boardPower, rivalMuster, NOISE, pickBoon, type Difficulty } from '../src/engine/rivals'
import { isLevelUpRound } from '../src/engine/boons'
import { applyBoon } from '../src/engine/run'
import { lineRootOf, thresholdsFor } from '../src/engine/ranks'
import { hashSeed, makeRng } from '../src/engine/rng'

interface Args {
  runs: number
  difficulty: Difficulty
  seed: number
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
function playRunHeadless(run: RunState): RunState {
  let guard = 0
  while (!run.finished && guard++ < HARD_CAP_ROUND + 4) {
    const p = run.warlords.find((w) => w.isPlayer)!
    if (p.alive) {
      const rng = makeRng(hashSeed(`sim|${run.seed}|${run.round}|player`))
      if (isLevelUpRound(run.round) && run.boonOffer.length > 0) {
        applyBoon(p, pickBoon(run.boonOffer, p.archetype, NOISE[run.difficulty], rng))
        run.boonOffer = []
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
    }
    resolveBattles(run)
    collectRankDuels(run)
    if (run.finished) break
    advanceRound(run)
  }
  return run
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
  const t0 = Date.now()

  const byFaction = new Map<string, Bucket>()
  const byHero = new Map<string, Bucket>()
  const byArchetype = new Map<string, Bucket>()
  const unitSeen = new Map<string, { drafted: number; wonWith: number }>()
  const lengths: number[] = []
  let ties = 0
  let battles = 0

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
      }
      const seenThisRun = new Set(w.board.map((s) => s.unitId))
      for (const uidStr of seenThisRun) {
        const rec = unitSeen.get(uidStr) ?? { drafted: 0, wonWith: 0 }
        rec.drafted++
        if (placement <= 2) rec.wonWith++
        unitSeen.set(uidStr, rec)
      }
    }
    for (const r of run.reports) {
      battles++
      if (r.winner === 'tie') ties++
    }
  }

  lengths.sort((a, b) => a - b)
  const median = lengths[Math.floor(lengths.length / 2)]
  const p95 = lengths[Math.floor(lengths.length * 0.95)]
  const elapsed = Date.now() - t0

  console.log(`\nBANNERFELL — balance harness`)
  console.log(`${args.runs} lobbies · difficulty ${args.difficulty} · seed ${args.seed} · ${elapsed}ms (${(elapsed / args.runs).toFixed(1)}ms/run)`)

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
  console.log(`BATTLES      ${battles} resolved · ${pct(ties / battles)} ties`)
  console.log('')
}

main()
