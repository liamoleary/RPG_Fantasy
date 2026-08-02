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
import { rivalMuster, NOISE, pickBoon, type Difficulty } from '../src/engine/rivals'
import { isLevelUpRound } from '../src/engine/boons'
import { applyBoon } from '../src/engine/run'
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

  console.log(`\nRUN LENGTH   median ${median} (target ≤14)   p95 ${p95} (target ≤16)   min ${lengths[0]}   max ${lengths[lengths.length - 1]}`)
  console.log(`BATTLES      ${battles} resolved · ${pct(ties / battles)} ties`)
  console.log('')
}

main()
