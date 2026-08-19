/**
 * Rival brains. Real boards, fake brains (§9): every rival runs the *same*
 * economy functions the player does. Difficulty is scoring noise, never a
 * stat cheat.
 */
import { unit } from '../data/index'
import type { BoonDef, FactionId, HeroMods, UnitDef } from '../data/types'
import type { BoardStack } from './battle'
import { FRONT_SLOTS } from './battle'
import {
  RECRUIT_COST,
  firstOpenSlot,
  moveStack,
  promote,
  promoteCost,
  promoteOptions,
  recruit,
  recruitPlan,
  rerollCost,
  rollOffer,
  sell,
  tierUpCost,
  type CampState,
} from './camp'
import { lineRootOf, rankDefOf, thresholdsOf } from './ranks'
import type { RNG } from './rng'

export type Archetype = 'aggro' | 'greedy' | 'balanced' | 'economy'
export const ARCHETYPES: Archetype[] = ['aggro', 'greedy', 'balanced', 'economy']

export type Difficulty = 'skirmish' | 'standard' | 'warlord'
export const NOISE: Record<Difficulty, number> = { skirmish: 6, standard: 3, warlord: 1 }

/** How keen each archetype is to spend gold on Camp Tier instead of bodies. */
const TIER_APPETITE: Record<Archetype, number> = { aggro: 0.3, greedy: 0.95, balanced: 0.65, economy: 0.8 }
const TAG_BONUS: Record<Archetype, Record<string, number>> = {
  aggro: { aggro: 3, tempo: 2.5, frenzy: 2, wall: -0.5, economy: -2 },
  greedy: { elite: 3, growth: 2.5, capstone: 3, economy: 1 },
  balanced: { wall: 1, ranged: 1, support: 1, elite: 1.5 },
  economy: { economy: 4, growth: 1.5, wall: 1 },
}

export interface RivalTurnInput {
  board: BoardStack[]
  gold: number
  camp: CampState
  mods: HeroMods
  round: number
  archetype: Archetype
  factionId: FactionId
  noise: number
}

export interface RivalTurnOutput {
  board: BoardStack[]
  camp: CampState
  gold: number
  /** every recruit this Muster made, for the balance harness (DN04 §1) */
  bought: { unitId: string; added: number; merged: boolean }[]
}

function unitScore(def: UnitDef, input: RivalTurnInput, board: BoardStack[]): number {
  const { archetype, mods } = input
  // Price what the purchase ACTUALLY delivers, not the printed muster size: a
  // T1 bought into a promoted stack now arrives as a handful of trainees
  // (DN04 §1.1), and an AI still paying the old price would keep making the
  // buy the fix exists to remove.
  const plan = recruitPlan(board, def.id, mods)
  const count = plan.added
  // Raw combat value of what one 3g purchase actually puts on the field, in
  // the form it arrives wearing.
  const arriving = unit(plan.formId)
  let score = (arriving.atk * 1.1 + arriving.hp * 0.7) * count * 0.5 + def.tier * 1.5
  const tags = def.tags ?? []
  for (const t of tags) score += TAG_BONUS[archetype][t] ?? 0
  // Adding to an existing stack is nearly always better than a new slot.
  const existing = plan.target
  if (existing) {
    score += 4
    score += rankPull(existing, count, archetype)
  } else if (firstOpenSlot(board, def) === null) score -= 100
  if (def.pool === 'merc') score -= 1.5
  if (input.round <= 3 && def.tier >= 4) score -= 3
  return score
}

/**
 * Banner Ranks must be visible to the AI (§3.4) or the player farms a blind
 * opponent. Cheap lookups only — this runs inside the purchase loop.
 */
function rankPull(existing: BoardStack, add: number, archetype: Archetype): number {
  const def = rankDefOf(existing.unitId)
  if (!def) return 0
  const rank = existing.rank ?? 0
  if (rank >= 2) return 0
  const th = thresholdsOf(def, unit(lineRootOf(existing.unitId)))
  const next = rank === 0 ? th[0] : th[1]
  const mult = archetype === 'greedy' ? 1.6 : 1
  if (existing.count + add >= next) return 5 * mult
  if (existing.count + add * 2 >= next) return 2 * mult
  return 0
}

/**
 * Which way a rival takes a fork (DN11 §2.1).
 *
 * A rival that always walked path A would make the harness's path-share column
 * (§6.1) meaningless and hand the player a lobby they could memorise, so the
 * choice runs on the same currency every other rival decision does: the unit's
 * own tags read through the archetype's taste, plus the difficulty's scoring
 * noise. Aggro banners grow the killer tree, walls grow the wall.
 *
 * The RNG is drawn from ONLY when there is an actual fork. A straight line must
 * not consume a number, or every rival in the lobby would desync from the same
 * seed the day the first forked line shipped — the migration has to be
 * invisible in the harness, not just in the rules.
 */
function pickPath(options: UnitDef[], archetype: Archetype, noise: number, rng: RNG): UnitDef {
  if (options.length === 1) return options[0]
  let best = options[0]
  let bestScore = -Infinity
  for (const o of options) {
    let score = o.atk * 1.1 + o.hp * 0.7 + o.tier * 1.5 + (rng.next() - 0.5) * noise
    for (const t of o.tags ?? []) score += TAG_BONUS[archetype][t] ?? 0
    if (score > bestScore) {
      bestScore = score
      best = o
    }
  }
  return best
}

function boardPower(board: BoardStack[]): number {
  let p = 0
  for (const s of board) {
    const d = unit(s.unitId)
    p += (d.atk + s.bonusAtk) * s.count + (d.hp + s.bonusHp) * s.count * 0.5
  }
  return p
}

/** Run one full Muster for a rival. Same rules as the player, no cheating. */
export function rivalMuster(input: RivalTurnInput, rng: RNG): RivalTurnOutput {
  let { board, gold } = input
  let camp = { ...input.camp }
  const { mods, round, archetype, noise } = input
  const bought: RivalTurnOutput['bought'] = []

  if (!camp.frozen || camp.offer.length === 0) {
    camp = { ...camp, offer: rollOffer(input.factionId as never, camp, mods, rng) }
  }
  camp = { ...camp, frozen: false, rerollsUsedThisRound: 0 }

  // 1) Camp Tier — greedy archetypes buy it early, aggro almost never rushes.
  // Gold does not carry over, so a tier-up that leaves nothing for bodies is
  // a wasted round: only buy when at least one recruit still fits after it.
  const tCost = tierUpCost(camp, mods)
  const appetite = TIER_APPETITE[archetype] * (1 + rng.next() * 0.3)
  const spare = round <= 3 ? 0 : RECRUIT_COST
  const wantsTier = tCost !== null && round >= 2 && gold - tCost >= spare && rng.next() < appetite
  if (tCost !== null && wantsTier) {
    gold -= tCost
    camp = { ...camp, tier: camp.tier + 1, tierDiscount: 0 }
  } else {
    camp = { ...camp, tierDiscount: Math.min(4, camp.tierDiscount + 1) }
  }

  // 2) Promote anything worth promoting (cheap board-wide upgrade).
  for (const stack of board.slice()) {
    const options = promoteOptions(stack, camp)
    if (options.length === 0) continue
    const target = pickPath(options, archetype, noise, rng)
    const cost = promoteCost(target, mods)
    if (gold < cost + (archetype === 'aggro' ? 0 : 3)) continue
    if (stack.count < 2 && target.tier < 4) continue
    const res = promote(board, gold, stack.uid, camp, mods, target.id)
    if (res.ok) {
      board = res.board
      gold = res.gold
    }
  }

  // 3) Spend the rest on bodies, rerolling when the offer is weak.
  let guard = 0
  while (gold >= RECRUIT_COST && guard++ < 20) {
    const scored = camp.offer
      .map((id, i) => ({ id, i }))
      .filter((x): x is { id: string; i: number } => x.id !== null)
      .map(({ id, i }) => ({ d: unit(id), i, v: unitScore(unit(id), input, board) + (rng.next() - 0.5) * noise }))
      .sort((x, y) => y.v - x.v)

    const best = scored[0]
    const rCost = rerollCost(camp, mods)
    const weakOffer = !best || best.v < 4 + round * 0.4
    if (weakOffer && gold - rCost >= RECRUIT_COST && camp.rerollsUsedThisRound < 4) {
      gold -= rCost
      camp = { ...camp, offer: rollOffer(input.factionId as never, camp, mods, rng), rerollsUsedThisRound: camp.rerollsUsedThisRound + 1 }
      continue
    }
    if (!best) break

    // Full board with no matching stack? Sell the weakest stack to make room.
    if (firstOpenSlot(board, best.d) === null && !recruitPlan(board, best.d.id, mods).target) {
      const weakest = board.slice().sort((x, y) => stackValue(x) - stackValue(y))[0]
      if (weakest && stackValue(weakest) < best.v * 0.8) {
        const s = sell(board, gold, weakest.uid, mods)
        board = s.board
        gold = s.gold
        continue
      }
      break
    }

    const plan = recruitPlan(board, best.d.id, mods)
    const res = recruit(board, gold, best.d.id, mods)
    if (!res.ok) break
    bought.push({ unitId: best.d.id, added: plan.added, merged: plan.target !== null })
    board = res.board
    gold = res.gold
    camp = { ...camp, offer: camp.offer.map((id, i) => (i === best.i ? null : id)) }
  }

  board = autoPosition(board)
  return { board, camp, gold, bought }
}

function stackValue(s: BoardStack): number {
  const d = unit(s.unitId)
  return (d.atk + s.bonusAtk + (d.hp + s.bonusHp) * 0.6) * s.count + d.tier
}

/** Template positioning: fattest bodies hold the middle columns, glass sits outside. */
export function autoPosition(board: BoardStack[]): BoardStack[] {
  const front = board.filter((s) => unit(s.unitId).row !== 'back')
  const back = board.filter((s) => unit(s.unitId).row === 'back')
  let out = board
  const frontOrder = front
    .slice()
    .sort((a, b) => bulk(b) - bulk(a))
    .slice(0, FRONT_SLOTS)
  const overflow = front.filter((s) => !frontOrder.includes(s))
  const frontSlots = [1, 2, 0, 3]
  frontOrder.forEach((s, i) => {
    out = moveStack(out, s.uid, frontSlots[i])
  })
  const backOrder = [...back, ...overflow].sort((a, b) => punch(b) - punch(a)).slice(0, 3)
  backOrder.forEach((s, i) => {
    out = moveStack(out, s.uid, 4 + i)
  })
  return out
}

function bulk(s: BoardStack): number {
  const d = unit(s.unitId)
  return (d.hp + s.bonusHp) * s.count
}
function punch(s: BoardStack): number {
  const d = unit(s.unitId)
  return (d.atk + s.bonusAtk) * s.count
}

// ── boon picking ───────────────────────────────────────────────────────────

const BOON_WEIGHTS: Record<Archetype, Partial<Record<keyof HeroMods, number>>> = {
  aggro: { allAtk: 10, frontAtk: 7, t12CountBonus: 8, frenzyAtk: 7, chargeAll: 14, spellPower: 3, income: 2 },
  greedy: { allHp: 6, growthBonus: 9, t45CountBonus: 9, tierUpDiscount: 8, income: 7, extraOfferSlots: 6, spellPower: 4 },
  balanced: { allAtk: 7, allHp: 6, spellPower: 6, spellExtraCasts: 6, income: 5, frontBulwark: 5, extraOfferSlots: 4 },
  economy: { income: 12, rerollDiscount: 7, freeRerollsPerRound: 6, extraOfferSlots: 7, sellBonus: 4, campTierUp: 8, allAtk: 4 },
}

export function pickBoon(offers: BoonDef[], archetype: Archetype, noise: number, rng: RNG): BoonDef {
  let best = offers[0]
  let bestScore = -Infinity
  for (const b of offers) {
    let score = rng.next() * noise
    for (const [k, v] of Object.entries(b.mods)) {
      const w = BOON_WEIGHTS[archetype][k as keyof HeroMods] ?? 3
      score += (typeof v === 'boolean' ? (v ? 1 : 0) : v) * w
    }
    if (b.capstone) score += 6
    if (score > bestScore) {
      bestScore = score
      best = b
    }
  }
  return best
}

export { boardPower }
