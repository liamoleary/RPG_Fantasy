/**
 * Hero and faction balance (`npm run balance`).
 *
 * One question: if two players of equal skill pick different heroes, how
 * differently does the run go? Renown is meant to buy *variety*, never
 * strength — a hero behind a 250-renown wall that wins three times as often as
 * a free one turns the shop into the game.
 *
 * Every hero is measured on the *same seeds*, so the same lobby of rivals and
 * the same offer stream is put in front of each. A difference in the column is
 * then the hero, not the draw.
 *
 * Caveat worth keeping in view: the player seat is driven by the rival Muster
 * policy at zero noise. It drafts competently and positions sanely, but it
 * does not play *around* a hero — it will not build a Frenzy board because
 * Gorrath rewards one. So this measures a hero's floor, not its ceiling, and a
 * hero whose payoff needs deliberate building will read low here. Where that
 * applies it is called out rather than tuned away.
 */
import { FACTIONS, HEROES, heroesOfFaction } from '../src/data/index'
import { advanceRound, applyTalent, newRun, player, resolveBattles, WAR_BANKS, type RunState } from '../src/engine/run'
import { boardPower, rivalMuster, type Difficulty } from '../src/engine/rivals'
import { isLevelUpRound, scoreNode } from '../src/engine/talents'
import { hashSeed, makeRng } from '../src/engine/rng'

const arg = (flag: string, dflt: string): string => {
  const i = process.argv.indexOf(`--${flag}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt
}
const RUNS = Number(arg('runs', '500'))
const SEED = Number(arg('seed', '60000'))
const DIFFICULTY = arg('difficulty', 'standard') as Difficulty

/** §6 targets. A hero outside the band is a hero nobody should have to avoid. */
const WIN_BAND = { lo: 18, hi: 34 }
/**
 * Average placement is reported but deliberately not a pass/fail band. Two
 * heroes on the same win rate can sit two places apart and both be correct:
 * Gorrath places high and converts fewer of those into firsts, Zhala places
 * low and spikes. That is a variance profile, which is a design choice, not an
 * imbalance. What must not diverge is the win rate.
 */

interface Row {
  hero: string
  heroId: string
  faction: string
  unlock: number
  win: number
  place: number
  rounds: number
  power: number
}

function playLobby(run: RunState) {
  for (let g = 0; g < 20 && !run.finished; g++) {
    const p = player(run)
    if (p.alive) {
      const rng = makeRng(hashSeed(`sim|${run.seed}|${run.round}|player`))
      if (isLevelUpRound(run.round) && run.talentOffer.length > 0) {
        const opts = run.talentOffer.flatMap((o) => o.options).filter((n) => !n.unlockedByFeat)
        let best = opts[0]
        for (const n of opts) if (scoreNode(n, p.archetype) > scoreNode(best, p.archetype)) best = n
        if (best) applyTalent(p, best)
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
          noise: 0,
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

const rows: Row[] = []
for (const f of FACTIONS) {
  for (const h of heroesOfFaction(f.id)) {
    let wins = 0
    const places: number[] = []
    const lens: number[] = []
    const powers: number[] = []
    for (let i = 0; i < RUNS; i++) {
      const run = playLobby(newRun({ seed: SEED + i, factionId: f.id, heroId: h.id, difficulty: DIFFICULTY }))
      const p = player(run)
      if (p.placement === 1) wins += 1
      places.push(p.placement ?? 8)
      lens.push(p.eliminatedRound ?? run.round)
      powers.push(boardPower(p.board))
    }
    const mean = (a: number[]) => a.reduce((n, x) => n + x, 0) / a.length
    rows.push({
      hero: h.name,
      heroId: h.id,
      faction: f.id,
      unlock: HEROES.find((x) => x.id === h.id)!.unlockRenown,
      win: (100 * wins) / RUNS,
      place: mean(places),
      rounds: mean(lens),
      power: mean(powers),
    })
  }
}

const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs)
const mean = (xs: number[]) => xs.reduce((n, x) => n + x, 0) / xs.length

console.log(`BANNERFELL — hero and faction balance\n${RUNS} lobbies per hero · same seeds for every hero · difficulty ${DIFFICULTY} · seed ${SEED}\n`)
console.log('hero                     banner      unlock     win%   avg place   avg rounds   end power')
console.log('─'.repeat(96))
for (const r of [...rows].sort((a, b) => b.win - a.win)) {
  const flag = r.win < WIN_BAND.lo || r.win > WIN_BAND.hi ? '  ⚠' : ''
  console.log(
    `${r.hero.padEnd(24)} ${r.faction.padEnd(11)} ${String(r.unlock).padStart(4)}r ${r.win.toFixed(1).padStart(8)}% ` +
      `${r.place.toFixed(2).padStart(11)} ${r.rounds.toFixed(1).padStart(12)} ${Math.round(r.power).toString().padStart(11)}${flag}`,
  )
}

console.log('\nfaction')
console.log('─'.repeat(96))
const facRows = FACTIONS.map((f) => {
  const rs = rows.filter((r) => r.faction === f.id)
  const bank = WAR_BANKS[f.id]
  return {
    id: f.id,
    win: mean(rs.map((r) => r.win)),
    place: mean(rs.map((r) => r.place)),
    bank: bank ? `${bank.trigger} +${bank.atk}/${bank.hp}` : 'none',
  }
})
for (const f of facRows) {
  console.log(`${f.id.padEnd(24)} ${'war bank ' + f.bank.padEnd(16)} ${f.win.toFixed(1).padStart(8)}% ${f.place.toFixed(2).padStart(11)}`)
}

const free = rows.filter((r) => r.unlock === 0)
const paid = rows.filter((r) => r.unlock > 0)
const winSpread = spread(rows.map((r) => r.win))
const facSpread = spread(facRows.map((f) => f.win))
const gate = mean(paid.map((r) => r.win)) - mean(free.map((r) => r.win))

console.log('\nverdict')
console.log('─'.repeat(96))
const line = (label: string, value: string, ok: boolean) =>
  console.log(`  ${label.padEnd(38)} ${value.padStart(10)}   ${ok ? 'ok' : '⚠'}`)
line('hero win-rate spread (want ≤ 12 pts)', `${winSpread.toFixed(1)} pts`, winSpread <= 12)
line('faction win-rate spread (want ≤ 8 pts)', `${facSpread.toFixed(1)} pts`, facSpread <= 8)
line('paid-minus-free advantage (want ≤ 4 pts)', `${gate >= 0 ? '+' : ''}${gate.toFixed(1)} pts`, Math.abs(gate) <= 4)
line(
  `every hero inside ${WIN_BAND.lo}–${WIN_BAND.hi}% win`,
  `${rows.filter((r) => r.win >= WIN_BAND.lo && r.win <= WIN_BAND.hi).length}/${rows.length}`,
  rows.every((r) => r.win >= WIN_BAND.lo && r.win <= WIN_BAND.hi),
)
console.log(
  `  ${'placement spread (shape, not balance)'.padEnd(38)} ${spread(rows.map((r) => r.place)).toFixed(2).padStart(10)}   —`,
)
console.log('')
