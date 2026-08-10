/** The lobby: 8 warlords, paired auto-battles, hero attrition, placements. */
import { FACTIONS, HERO_BY_ID, faction, heroesOfFaction, unit } from '../data/index'
import type { TalentNode } from '../data/talents/index'
import type { FactionId, HeroDef, HeroMods } from '../data/types'
import { ZERO_MODS, addMods } from '../data/types'
import { economyGold, FRONT_SLOTS, simulateBattle, type BattleResult, type BoardStack, type HeroState, type Survivor } from './battle'
import { canTake, heroLevel, isLevelUpRound, offersFor, rivalPick, treeForWarlord, type TalentOffer } from './talents'
import { MAX_CAMP_TIER, income, newCamp, rollOffer, type CampState } from './camp'
import { applyRankProgress, rankDefOf, refreshRanks } from './ranks'
import { autoPosition, NOISE, rivalMuster, type Archetype, type Difficulty } from './rivals'
import { hashSeed, makeRng, type RNG } from './rng'

export const LOBBY_SIZE = 8
export const START_HP = 30
export const HARD_CAP_ROUND = 16
export const SUDDEN_DEATH_DAMAGE = 5

export type Phase = 'muster' | 'levelup' | 'battle' | 'result' | 'over'

export interface Warlord {
  id: string
  name: string
  factionId: FactionId
  heroId: string
  isPlayer: boolean
  hp: number
  alive: boolean
  placement: number | null
  eliminatedRound: number | null
  gold: number
  board: BoardStack[]
  camp: CampState
  mods: HeroMods
  /** §6: the ordered pick sequence — replay-safe, and exactly what §7 needs. */
  talentsTaken: string[]
  archetype: Archetype
  lastOpponentId: string | null
  wins: number
  losses: number
}

export interface Pairing {
  aId: string
  bId: string
  /** b is a ghost copy of an eliminated warlord's last board */
  ghost: boolean
}

export interface BattleReport {
  aId: string
  bId: string
  ghost: boolean
  winner: 'a' | 'b' | 'tie'
  damage: number
  result: BattleResult
}

export interface RunState {
  seed: number
  round: number
  phase: Phase
  difficulty: Difficulty
  warlords: Warlord[]
  playerId: string
  pairings: Pairing[]
  reports: BattleReport[]
  /** the player's three branch offers this round (levelup phase only) */
  talentOffer: TalentOffer[]
  ghostBoards: Record<string, BoardStack[]>
  finished: boolean
  placementCounter: number
  log: string[]
}

// ── helpers ────────────────────────────────────────────────────────────────

export const heroDef = (id: string): HeroDef => {
  const h = HERO_BY_ID.get(id)
  if (!h) throw new Error(`unknown hero ${id}`)
  return h
}

export const player = (run: RunState): Warlord => {
  const w = run.warlords.find((x) => x.id === run.playerId)
  if (!w) throw new Error('no player')
  return w
}

export const byId = (run: RunState, id: string): Warlord => {
  const w = run.warlords.find((x) => x.id === id)
  if (!w) throw new Error(`no warlord ${id}`)
  return w
}

export function heroState(w: Warlord, round: number): HeroState {
  return { heroId: w.heroId, name: w.name, factionId: w.factionId, level: heroLevel(round), mods: w.mods }
}

/** Round rng — derived from the run seed so state stays serializable. */
function roundRng(run: RunState, salt: number): RNG {
  return makeRng(hashSeed(`${run.seed}:${run.round}:${salt}`))
}

export function pairingFor(run: RunState, id: string): Pairing | undefined {
  return run.pairings.find((p) => p.aId === id || p.bId === id)
}

export function opponentOf(run: RunState, id: string): string | null {
  const p = pairingFor(run, id)
  if (!p) return null
  return p.aId === id ? p.bId : p.aId
}

// ── lobby creation ─────────────────────────────────────────────────────────

export interface NewRunOptions {
  seed: number
  factionId: FactionId
  heroId: string
  playerName?: string
  difficulty?: Difficulty
}

export function newRun(opts: NewRunOptions): RunState {
  const rng = makeRng(opts.seed)
  const warlords: Warlord[] = []
  // Ids are positional, not generated, so a serialized run resumes identically.
  const playerId = 'w0'

  warlords.push(
    makeWarlord(playerId, opts.playerName ?? 'You', opts.factionId, opts.heroId, true, 'balanced'),
  )

  const usedNames = new Set<string>()
  for (let i = 0; i < LOBBY_SIZE - 1; i++) {
    const f = rng.pick(FACTIONS)
    const heroes = heroesOfFaction(f.id)
    const hero = rng.pick(heroes)
    const fd = faction(f.id)
    let name = ''
    for (let tries = 0; tries < 12; tries++) {
      name = `${rng.pick(fd.nameBank)} ${rng.pick(fd.titleBank)}`
      if (!usedNames.has(name)) break
    }
    usedNames.add(name)
    warlords.push(
      makeWarlord(`w${i + 1}`, name, f.id, hero.id, false, rng.pick(['aggro', 'greedy', 'balanced', 'economy'] as Archetype[])),
    )
  }

  const run: RunState = {
    seed: opts.seed,
    round: 1,
    phase: 'muster',
    difficulty: opts.difficulty ?? 'standard',
    warlords,
    playerId,
    pairings: [],
    reports: [],
    talentOffer: [],
    ghostBoards: {},
    finished: false,
    placementCounter: LOBBY_SIZE,
    log: [],
  }

  beginRound(run)
  return run
}

function makeWarlord(
  id: string,
  name: string,
  factionId: FactionId,
  heroId: string,
  isPlayer: boolean,
  archetype: Archetype,
): Warlord {
  return {
    id,
    name,
    factionId,
    heroId,
    isPlayer,
    hp: START_HP,
    alive: true,
    placement: null,
    eliminatedRound: null,
    gold: 0,
    board: [],
    camp: newCamp(),
    mods: { ...ZERO_MODS },
    talentsTaken: [],
    archetype,
    lastOpponentId: null,
    wins: 0,
    losses: 0,
  }
}

// ── round lifecycle ────────────────────────────────────────────────────────

/** Start of Muster: income, Growth, offers, rival turns, pairings, level-up. */
export function beginRound(run: RunState) {
  const rng = roundRng(run, 1)

  for (const w of run.warlords) {
    if (!w.alive) continue
    applyGrowth(w)
    // Anything that moved a count since the last Muster — Growth, talents,
    // hero passives — can have crossed a Banner Rank threshold (§3.1).
    refreshRanks(w.board)
    w.gold = income(run.round, w.mods) + economyGold(w.board)
    w.camp.rerollsUsedThisRound = 0
    if (!w.camp.frozen || w.camp.offer.length === 0) {
      w.camp.offer = rollOffer(w.factionId, w.camp, w.mods, rng.fork(hashSeed(w.id)))
    }
    w.camp.frozen = false
  }

  // Rivals take their whole Muster now; the player's is interactive.
  for (const w of run.warlords) {
    if (!w.alive || w.isPlayer) continue
    if (isLevelUpRound(run.round)) {
      // §5: rivals walk the same trees, by archetype policy and with no RNG.
      const chosen = rivalPick(offersFor(treeForWarlord(w.factionId, w.heroId), w.talentsTaken), w.archetype)
      if (chosen) applyTalent(w, chosen)
    }
    const out = rivalMuster(
      {
        board: w.board,
        gold: w.gold,
        camp: w.camp,
        mods: w.mods,
        round: run.round,
        archetype: w.archetype,
        factionId: w.factionId,
        noise: NOISE[run.difficulty],
      },
      rng.fork(hashSeed(`m${w.id}`)),
    )
    w.board = out.board
    w.camp = out.camp
    w.gold = out.gold
  }

  run.pairings = makePairings(run, roundRng(run, 2))

  const p = player(run)
  if (p.alive && isLevelUpRound(run.round)) {
    run.talentOffer = offersFor(treeForWarlord(p.factionId, p.heroId), p.talentsTaken)
    run.phase = run.talentOffer.length > 0 ? 'levelup' : 'muster'
  } else {
    run.talentOffer = []
    run.phase = 'muster'
  }
}

/**
 * Growth: end-of-Muster permanent stats, applied at the top of the next one.
 * HP grows every Muster, ATK every *other* Muster — ungated ATK growth
 * compounds with stack count and runs away with the whole lobby by round 8.
 */
function applyGrowth(w: Warlord) {
  const hd = heroDef(w.heroId)
  const extraHp = hd.passive.id === 'growthPlusHp' ? (hd.passive.x ?? 1) : 0
  for (const s of w.board) {
    const g = unit(s.unitId).keywords.find((k) => k.k === 'growth')
    if (!g) continue
    let amount = (g.x ?? 1) + w.mods.growthBonus
    // Honored growth rewards resolve here, not in battle.ts: Growth is a Muster
    // effect on the stack's permanent stats, so battle never sees it.
    const rd = (s.rank ?? 0) >= 2 ? rankDefOf(s.unitId) : null
    if (rd && rd.honored.type === 'growthPlus') amount += rd.honored.x
    s.growthTicks += 1
    s.bonusHp += amount + extraHp
    if (s.growthTicks % 2 === 0) s.bonusAtk += amount
  }
}

/**
 * The effect-application layer, unchanged from applyBoon in every respect that
 * touches the engine (§6): push the id, add the mods, honour campTierUp. Only
 * the name and the shape of the thing being applied moved.
 */
export function applyTalent(w: Warlord, node: TalentNode) {
  w.talentsTaken.push(node.id)
  w.mods = addMods(w.mods, node.mods)
  if (node.mods.campTierUp) {
    w.camp = { ...w.camp, tier: Math.min(MAX_CAMP_TIER, w.camp.tier + node.mods.campTierUp), tierDiscount: 0 }
  }
}

export function choosePlayerTalent(run: RunState, nodeId: string) {
  const p = player(run)
  const tree = treeForWarlord(p.factionId, p.heroId)
  if (!canTake(tree, p.talentsTaken, nodeId)) return
  const node = tree.find((n) => n.id === nodeId)
  if (!node) return
  applyTalent(p, node)
  run.talentOffer = []
  run.phase = 'muster'
}

function makePairings(run: RunState, rng: RNG): Pairing[] {
  const alive = run.warlords.filter((w) => w.alive)
  let pool = rng.shuffle(alive.map((w) => w.id))
  const pairs: Pairing[] = []

  // Try to avoid repeating last round's opponent (Battlegrounds rule).
  for (let attempt = 0; attempt < 8; attempt++) {
    const trial: Pairing[] = []
    const q = pool.slice()
    let clean = true
    while (q.length >= 2) {
      const a = q.shift() as string
      let idx = q.findIndex((b) => byId(run, a).lastOpponentId !== b)
      if (idx === -1) {
        idx = 0
        clean = false
      }
      const b = q.splice(idx, 1)[0]
      trial.push({ aId: a, bId: b, ghost: false })
    }
    if (q.length === 1) {
      const lone = q[0]
      const ghostId = lastEliminated(run)
      trial.push({ aId: lone, bId: ghostId ?? lone, ghost: true })
    }
    pairs.length = 0
    pairs.push(...trial)
    if (clean) break
    pool = rng.shuffle(pool)
  }
  return pairs
}

function lastEliminated(run: RunState): string | null {
  const dead = run.warlords.filter((w) => !w.alive && w.eliminatedRound !== null)
  if (dead.length === 0) return null
  dead.sort((a, b) => (b.eliminatedRound ?? 0) - (a.eliminatedRound ?? 0))
  return dead[0].id
}

// ── battle phase ───────────────────────────────────────────────────────────

export function resolveBattles(run: RunState): BattleReport[] {
  const reports: BattleReport[] = []

  for (const p of run.pairings) {
    const a = byId(run, p.aId)
    const bSource = byId(run, p.bId)
    const bBoard = p.ghost ? (run.ghostBoards[p.bId] ?? bSource.board) : bSource.board

    const seed = hashSeed(`${run.seed}|${run.round}|${p.aId}|${p.bId}`)
    const result = simulateBattle(
      { board: a.board, hero: heroState(a, run.round) },
      { board: bBoard, hero: heroState(bSource, run.round) },
      heroDef(a.heroId),
      heroDef(bSource.heroId),
      seed,
      { round: run.round },
    )
    reports.push({ aId: p.aId, bId: p.bId, ghost: p.ghost, winner: result.winner, damage: result.damageToLoser, result })
  }

  // Apply outcomes only after every battle has resolved, so damage is simultaneous.
  for (const r of reports) {
    const a = byId(run, r.aId)
    const b = byId(run, r.bId)
    a.lastOpponentId = r.ghost ? null : r.bId
    if (!r.ghost) b.lastOpponentId = r.aId

    if (r.winner === 'tie') {
      const d = r.result.damageToBoth
      a.hp -= d
      if (!r.ghost) b.hp -= d
      run.log.push(`R${run.round}: ${a.name} and ${b.name} fought to a standstill (−${d} each).`)
      continue
    }

    const winnerIsA = r.winner === 'a'
    const winner = winnerIsA ? a : b
    const loser = winnerIsA ? b : a
    // A ghost is a dead warlord's last board — it neither takes nor records damage.
    const loserIsGhost = r.ghost && loser.id === b.id
    const winnerIsGhost = r.ghost && winner.id === b.id

    if (!winnerIsGhost) winner.wins++
    if (!loserIsGhost) {
      loser.hp -= r.damage
      loser.losses++
    }
    run.log.push(`R${run.round}: ${winner.name} defeated ${loser.name}${loserIsGhost ? ' (ghost)' : ` (−${r.damage} HP)`}.`)
  }

  // Thornqueen Maravel: every stack that walked off the field grows by one.
  // A ghost board belongs to an eliminated warlord and is never modified.
  // The ghost skip mirrors growSurvivors and is defensive rather than
  // load-bearing: a warlord's board is snapshotted into ghostBoards when they
  // are eliminated and never read from the warlord again, so banking onto the
  // dead is invisible either way. tests/warbanks.test.ts says so out loud
  // rather than pretending to cover it.
  for (const r of reports) {
    growSurvivors(byId(run, r.aId), r.result.survivorsA)
    bankWarSpoils(byId(run, r.aId), r.result.survivorsA)
    if (!r.ghost) {
      growSurvivors(byId(run, r.bId), r.result.survivorsB)
      bankWarSpoils(byId(run, r.bId), r.result.survivorsB)
    }
  }

  if (run.round >= HARD_CAP_ROUND) {
    for (const w of run.warlords) {
      if (!w.alive) continue
      w.hp -= SUDDEN_DEATH_DAMAGE
    }
    run.log.push(`R${run.round}: Sudden Death — every banner takes ${SUDDEN_DEATH_DAMAGE}.`)
  }

  eliminate(run)
  run.reports = reports
  run.phase = 'result'
  return reports
}

/**
 * `survivorGrowsCount` (Thornqueen Maravel): +1 permanent count to every stack
 * that ended the battle with at least one unit standing, once per battle.
 * Summoned stacks appear in the survivor list but not on the board, so the uid
 * lookup drops them on its own.
 */
function growSurvivors(w: Warlord, survivors: Survivor[]) {
  if (heroDef(w.heroId).passive.id !== 'survivorGrowsCount') return
  const standing = new Map(survivors.filter((s) => s.count > 0).map((s) => [s.uid, s.count]))
  for (const s of w.board) {
    const left = standing.get(s.uid)
    if (left === undefined) continue
    // The survivors recruit to replace their dead — so a stack that came
    // through untouched gains nothing. Counts multiply stats *and* drive Banner
    // Ranks, which makes this the strongest compounding effect in the game;
    // unconditional it left Maravel at 3.9 average placement and 18% of wins
    // while every other hero sat inside the band.
    if (left >= s.count) continue
    s.count += 1
    s.rank = applyRankProgress(s)
  }
}

/**
 * The war banks (`feat/balance-01`).
 *
 * Growth was the only mechanic in the game that banked permanent power, and it
 * belongs to one faction — measured, Verdant carried ~1958 points of permanent
 * bonus by round 14 against exactly 0 for the other two, and their board power
 * was four times Vanguard's. Bulwark and Frenzy are per-battle effects that
 * reset, and ablation showed both were close to inert: quadrupling Bulwark
 * bought Vanguard 0.51 places, quadrupling Frenzy bought Stormtide 0.26.
 *
 * So all three factions bank, in their own flavour, into the same
 * bonusAtk/bonusHp the Growth keyword already uses — no new engine field, and
 * the same Muster-phase machinery `growSurvivors` above established:
 *
 *   Verdant   grows every Muster, unconditionally      — the gardener
 *   Vanguard  banks when a Bulwark stack holds the line — the wall thickens
 *   Stormtide banks when a stack bleeds and survives    — blood remembers
 *
 * Verdant's is guaranteed and the other two are earned, which is the trade:
 * they bank faster per trigger, but only when their mechanic actually did
 * something. That also makes DN08's power fantasy true for all three factions
 * rather than one.
 */
export interface WarBank {
  /** 'held' = survived in the front row; 'bled' = took casualties and survived;
   *  'stood' = survived at all */
  trigger: 'held' | 'bled' | 'stood'
  atk: number
  hp: number
}

export const WAR_BANKS: Record<string, WarBank> = {
  // The wall gets tougher faster than it gets sharper.
  vanguard: { trigger: 'held', atk: 2, hp: 4 },
  // Anything that walks off the field carries the rage with it. 'stood' rather
  // than 'bled': a trigger that needs you to take casualties AND survive fails
  // exactly when you are losing, which is rich-get-richer and measured 1.5
  // places worse for them.
  stormtide: { trigger: 'stood', atk: 2, hp: 2 },
}

function bankWarSpoils(w: Warlord, survivors: Survivor[]) {
  const bank = WAR_BANKS[w.factionId]
  if (!bank) return
  const stood = new Map(survivors.filter((s) => s.count > 0).map((s) => [s.uid, s.count]))
  for (const s of w.board) {
    const left = stood.get(s.uid)
    if (left === undefined) continue
    // Vanguard banks off the line it held: a front-row stack still standing.
    if (bank.trigger === 'held' && s.slot >= FRONT_SLOTS) continue
    // Stormtide banks off a stack that actually bled — Frenzy's own trigger,
    // carried out of the battle instead of expiring with it.
    if (bank.trigger === 'bled' && left >= s.count) continue
    s.bonusAtk += bank.atk
    s.bonusHp += bank.hp
  }
}

function eliminate(run: RunState) {
  const dying = run.warlords.filter((w) => w.alive && w.hp <= 0)
  // Same-round eliminations share the lower placements, broken by remaining HP.
  dying.sort((a, b) => a.hp - b.hp)
  for (const w of dying) {
    w.alive = false
    w.hp = 0
    w.eliminatedRound = run.round
    w.placement = run.placementCounter
    run.placementCounter -= 1
    run.ghostBoards[w.id] = w.board.map((s) => ({ ...s }))
    run.log.push(`R${run.round}: ${w.name} is eliminated — ${ordinal(w.placement)} place.`)
  }

  const alive = run.warlords.filter((w) => w.alive)
  if (alive.length === 1) {
    alive[0].placement = 1
    run.finished = true
    run.phase = 'over'
    run.log.push(`${alive[0].name} stands alone. Victory.`)
  } else if (alive.length === 0) {
    run.finished = true
    run.phase = 'over'
  }
}

export function advanceRound(run: RunState) {
  if (run.finished) return
  run.round += 1
  run.reports = []
  beginRound(run)
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

// ── player Muster actions (wrappers that keep the run consistent) ───────────

export function playerReady(run: RunState) {
  const p = player(run)
  p.board = p.board.filter((s) => s.count > 0)
  run.phase = 'battle'
}

export function autoArrangePlayer(run: RunState) {
  const p = player(run)
  p.board = autoPosition(p.board)
}

// ── Renown ─────────────────────────────────────────────────────────────────

export const RENOWN_BY_PLACEMENT: Record<number, number> = { 1: 100, 2: 70, 3: 50, 4: 50, 5: 30, 6: 30, 7: 15, 8: 15 }

export function renownFor(placement: number, feats: string[] = []): number {
  return (RENOWN_BY_PLACEMENT[placement] ?? 15) + feats.length * 10
}
