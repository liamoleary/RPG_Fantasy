/**
 * Balance sweep (§13, companion to `npm run sim`).
 *
 *   npm run sweep
 *
 * `sim` tells you *whether* the game is balanced. This tells you *which lever
 * moves what*, by running the same lobbies repeatedly with one thing changed.
 * It mutates the data in memory rather than diffing commits — the trick
 * sim.ts already uses for `--cover off` — so seeds, rival policies and the RNG
 * stream stay identical and the only difference measured is the change itself.
 *
 * The two questions it answers, and the reason feat/balance-01 exists:
 *
 *   ABLATION   turn a mechanic off. If its faction does not move, the
 *              mechanic is inert. This is how Bulwark and Frenzy were caught:
 *              turning them off cost their factions 0.18 and 0.22 places,
 *              while turning Growth off cost Verdant 0.70.
 *   AMPLITUDE  turn it up. Quadrupling Bulwark bought 0.51 places and
 *              quadrupling Frenzy bought 0.26 — which is what proved the
 *              faction gap could not be tuned away and had to be designed away.
 *
 * Add a block, run it, read the spread column. Everything here is a
 * diagnostic: nothing it prints ships, and nothing it mutates is written back.
 */
import { ALL_UNITS, FACTIONS, HEROES, heroesOfFaction } from '../src/data/index'
import type { FactionId } from '../src/data/types'
import { HARD_CAP_ROUND, WAR_BANKS, advanceRound, applyTalent, newRun, player, resolveBattles } from '../src/engine/run'
import { NOISE, rivalMuster } from '../src/engine/rivals'
import { isLevelUpRound } from '../src/engine/talents'
import { hashSeed, makeRng } from '../src/engine/rng'

const RUNS = Number(process.env.SWEEP_RUNS ?? 900)

/** Scale one keyword's x across the whole roster. */
function scaleKw(kw: string, mult: number) {
  for (const u of ALL_UNITS) {
    for (const k of u.keywords) {
      if (k.k !== kw) continue
      const base = (k as { base?: number }).base ?? k.x ?? 1
      ;(k as { base?: number }).base = base
      k.x = base * mult
    }
  }
}

/** Neutralise a hero passive by id, so its contribution can be isolated. */
function mutePassive(id: string, on: boolean) {
  for (const h of HEROES) {
    const p = h.passive as { id: string; realId?: string }
    if (!p.realId) p.realId = p.id
    p.id = !on && p.realId === id ? `${id}__muted` : p.realId
  }
}

/** Scale a faction's raw stat budget. Blunt on purpose — a gap-sizing tool. */
function scaleStats(pool: string, mult: number) {
  for (const u of ALL_UNITS) {
    if (u.pool !== pool) continue
    const b = u as unknown as { baseAtk?: number; baseHp?: number }
    if (b.baseAtk === undefined) {
      b.baseAtk = u.atk
      b.baseHp = u.hp
    }
    ;(u as { atk: number }).atk = Math.max(1, Math.round(b.baseAtk! * mult))
    ;(u as { hp: number }).hp = Math.max(1, Math.round(b.baseHp! * mult))
  }
}

/** One lobby, player driven by the rival policy so no human bias leaks in. */
function lobby(seed: number) {
  const f = FACTIONS[seed % FACTIONS.length]
  const heroes = heroesOfFaction(f.id as FactionId)
  const run = newRun({
    seed: 700000 + seed,
    factionId: f.id as FactionId,
    heroId: heroes[seed % heroes.length].id,
    difficulty: 'standard',
  })
  let guard = 0
  while (!run.finished && guard++ < HARD_CAP_ROUND + 4) {
    const p = player(run)
    if (p.alive) {
      const rng = makeRng(hashSeed(`sweep|${run.seed}|${run.round}`))
      if (isLevelUpRound(run.round) && run.talentOffer.length > 0) {
        const opts = run.talentOffer.flatMap((o) => o.options)
        const pick = opts[Math.floor(rng.next() * opts.length)]
        if (pick) applyTalent(p, pick)
        run.talentOffer = []
      }
      const out = rivalMuster(
        { board: p.board, gold: p.gold, camp: p.camp, mods: p.mods, round: run.round, archetype: p.archetype, factionId: p.factionId, noise: NOISE.standard },
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

function measure(label: string) {
  const place: Record<string, number[]> = {}
  const wins: Record<string, number> = {}
  for (const f of FACTIONS) {
    place[f.id] = []
    wins[f.id] = 0
  }
  const rounds: number[] = []
  for (let i = 0; i < RUNS; i++) {
    const run = lobby(i)
    rounds.push(run.round)
    for (const w of run.warlords) {
      const p = w.placement ?? 1
      place[w.factionId].push(p)
      if (p === 1) wins[w.factionId] += 1
    }
  }
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  const out = FACTIONS.map((f) => ({
    id: f.id,
    place: +avg(place[f.id]).toFixed(2),
    win: +((wins[f.id] / place[f.id].length) * 100).toFixed(1),
  }))
  const spread = +(Math.max(...out.map((o) => o.place)) - Math.min(...out.map((o) => o.place))).toFixed(2)
  const inBand = out.every((o) => o.place >= 4.2 && o.place <= 4.8)
  const med = rounds.slice().sort((a, b) => a - b)[Math.floor(rounds.length / 2)]
  console.log(
    `${label.padEnd(34)} ` +
      out.map((o) => `${o.id.slice(0, 4)} ${String(o.place).padStart(5)} (${String(o.win).padStart(4)}%)`).join('  ') +
      `   spread ${String(spread).padStart(4)}  medLen ${med}  ${inBand ? 'IN BAND' : ''}`,
  )
}

const banks = structuredClone(WAR_BANKS)
const reset = () => {
  scaleKw('growth', 1)
  scaleKw('bulwark', 1)
  scaleKw('frenzy', 1)
  mutePassive('survivorGrowsCount', true)
  for (const f of FACTIONS) scaleStats(f.id, 1)
  for (const k of Object.keys(banks)) Object.assign(WAR_BANKS[k], banks[k])
}
const setBank = (f: string, trig: 'held' | 'bled' | 'stood', atk: number, hp: number) => {
  WAR_BANKS[f].trigger = trig
  WAR_BANKS[f].atk = atk
  WAR_BANKS[f].hp = hp
}

console.log(`sweep: ${RUNS} lobbies per config · target every faction 4.20-4.80, win% ~12.5 each\n`)
reset()
measure('shipped')

console.log('\n-- ablation: if a faction does not move, its mechanic is inert --')
reset(); scaleKw('growth', 0); measure('  growth OFF')
reset(); setBank('vanguard', 'held', 0, 0); measure('  vanguard bank OFF')
reset(); setBank('stormtide', 'stood', 0, 0); measure('  stormtide bank OFF')
reset(); setBank('vanguard', 'held', 0, 0); setBank('stormtide', 'stood', 0, 0); measure('  both banks OFF (pre-balance-01)')

console.log('\n-- amplitude: headroom in each bank --')
reset(); setBank('vanguard', 'held', 3, 5); measure('  vanguard +3/5')
reset(); setBank('stormtide', 'stood', 3, 3); measure('  stormtide +3/3')
reset(); setBank('stormtide', 'bled', 2, 2); measure('  stormtide trigger=bled')
