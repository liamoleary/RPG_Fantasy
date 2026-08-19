/** War Camp economy: offers, rerolls, tier-ups, recruiting, promoting, selling. */
import { MERC_UNITS, isPromotedForm, unit, unitsOfPool } from '../data/index'
import type { FactionId, HeroMods, UnitDef } from '../data/types'
import type { BoardStack } from './battle'
import { FRONT_SLOTS, TOTAL_SLOTS } from './battle'
import { LINES } from './lines'
import { applyRankProgress, lineRootOf } from './ranks'
import type { RNG } from './rng'

export const RECRUIT_COST = 3
export const REROLL_COST = 1
export const MAX_CAMP_TIER = 5
/**
 * 12 since DN10: a longer campaign wants a late game where a round can hold a
 * real decision — promote AND recruit, or two recruits and a reroll — instead
 * of the same 10g spent the same way every round from round 8 on.
 */
export const BASE_INCOME_CAP = 12
/** Camp Tier N -> gold. Falls by 1 per round you don't buy it (Battlegrounds discount). */
export const TIER_UP_BASE: Record<number, number> = { 2: 5, 3: 6, 4: 7, 5: 8 }
export const PROMOTE_COST: Record<number, number> = { 2: 3, 3: 5, 4: 7, 5: 7 }
export const FACTION_OFFER_WEIGHT = 0.7

export interface CampState {
  tier: number
  /** accumulated discount on the next tier-up */
  tierDiscount: number
  offer: (string | null)[]
  frozen: boolean
  rerollsUsedThisRound: number
}

export function newCamp(): CampState {
  return { tier: 1, tierDiscount: 0, offer: [], frozen: false, rerollsUsedThisRound: 0 }
}

export function offerSlots(camp: CampState, mods: HeroMods): number {
  return Math.min(8, camp.tier + 2 + mods.extraOfferSlots)
}

export function income(round: number, mods: HeroMods): number {
  return Math.min(BASE_INCOME_CAP, 2 + round) + mods.income
}

export function tierUpCost(camp: CampState, mods: HeroMods): number | null {
  if (camp.tier >= MAX_CAMP_TIER) return null
  const base = TIER_UP_BASE[camp.tier + 1]
  return Math.max(0, base - camp.tierDiscount - mods.tierUpDiscount)
}

export function rerollCost(camp: CampState, mods: HeroMods): number {
  if (camp.rerollsUsedThisRound < mods.freeRerollsPerRound) return 0
  return Math.max(0, REROLL_COST - mods.rerollDiscount)
}

export function promoteCost(target: UnitDef, mods: HeroMods): number {
  return Math.max(0, (PROMOTE_COST[target.tier] ?? 7) - mods.promoteDiscount)
}

export function sellValue(stack: BoardStack, mods: HeroMods): number {
  return Math.max(1, Math.floor(stack.spent / RECRUIT_COST)) + mods.sellBonus
}

/**
 * Units eligible for a camp offer at this tier.
 *
 * One flat rule (DN10 §2): the camp only ever sells the BASE form of a
 * promotion line. Footmen, Arbalests, Champions and their cousins are made at
 * the promote button, never bought — so what a card in the camp is never
 * needs a second reading. Units that don't promote enter at their own tier.
 */
export function offerPool(factionId: FactionId, tier: number): { faction: UnitDef[]; mercs: UnitDef[] } {
  const sellable = (u: UnitDef) => u.tier <= tier && !isPromotedForm(u.id)
  return {
    faction: unitsOfPool(factionId).filter(sellable),
    mercs: MERC_UNITS.filter(sellable),
  }
}

/**
 * Everything an offer roll is allowed to look at (DN11 §3).
 *
 * Kinship makes the camp answer to the board — "recruit a kin, and its kin come
 * looking for you" — and the Boss Tavern makes it answer to Trials won. Both
 * are facts about ONE warlord, and the player and every rival have to roll
 * through the same door or the lobby stops being fair.
 *
 * So the roll takes a context rather than growing parameters: every input is
 * named here, `rollOffer` reads nothing else, and adding an input later means
 * adding a field rather than finding four call sites. Pure and seeded like the
 * rest of the engine — same context and same RNG, same offer, always.
 */
export interface OfferContext {
  factionId: FactionId
  camp: CampState
  mods: HeroMods
  /** the warlord's board: what they already field is what draws its kin */
  board: BoardStack[]
  /** Boss Courts this warlord has beaten, whose cards drift into the camp */
  defeatedCourts: string[]
}

export function rollOffer(ctx: OfferContext, rng: RNG): string[] {
  const { camp, mods } = ctx
  const { faction, mercs } = offerPool(ctx.factionId, camp.tier)
  const slots = offerSlots(camp, mods)
  const out: string[] = []
  for (let i = 0; i < slots; i++) {
    const useFaction = faction.length > 0 && (mercs.length === 0 || rng.chance(FACTION_OFFER_WEIGHT))
    const src = useFaction ? faction : mercs
    // Tier weighting: lower tiers show up more often, so high tiers stay exciting.
    const weights = src.map((u) => 1 / (1 + (camp.tier - u.tier) * 0.35))
    out.push(rng.weighted(src, weights).id)
  }
  return out
}

// ── board mutation ─────────────────────────────────────────────────────────

export function firstOpenSlot(board: BoardStack[], def: UnitDef): number | null {
  const used = new Set(board.map((s) => s.slot))
  const front = [0, 1, 2, 3]
  const back = [4, 5, 6]
  const order = def.row === 'back' ? [...back, ...front] : def.row === 'front' ? [...front, ...back] : [...front, ...back]
  const legal = def.row === 'back' ? back : def.row === 'front' ? front : [...front, ...back]
  const preferred = order.find((s) => !used.has(s) && legal.includes(s))
  return preferred ?? null
}

export function stackOfUnit(board: BoardStack[], unitId: string): BoardStack | undefined {
  const def = unit(unitId)
  // Recruits train up into whatever form the stack is currently in (§5.2).
  return board.find((s) => s.unitId === unitId || inSameLine(s.unitId, def.id))
}

/**
 * How many promotions a form sits from its root — 0 is the form you buy.
 *
 * This was `lineIndexOf`, an index into a flat line. A forked line has no
 * single order to index into, but depth is still exactly one number per form,
 * and it is the number the training arithmetic below actually wants: two
 * siblings of a fork are the same distance from the root, so a recruit trains
 * into either at the same cost.
 */
export function lineDepthOf(unitId: string): number {
  return LINES.depthOf(unitId)
}

export interface RecruitPlan {
  /** the stack these recruits join, or null if they start a new one */
  target: BoardStack | null
  /** how many bodies actually arrive */
  added: number
  /** forms between what you bought and what the stack currently wears */
  stepsBehind: number
  /** the form the recruits will be wearing when they arrive */
  formId: string
}

/**
 * What a 3g purchase will actually do (Design Notes 04 §1.1).
 *
 * Recruits train up into the stack's current form, and training costs bodies:
 * every form behind halves the intake, floored at one. Buying the stack's own
 * form adds the full muster. Buying a form *ahead* of anything you own starts
 * its own stack — that is late entry at strength, and it stays that way.
 *
 * This is the one place the arithmetic lives: `recruit` applies it, the rival
 * AI prices with it, and the camp button prints it, so the shop can never
 * promise something the purchase does not deliver.
 */
export function recruitPlan(board: BoardStack[], unitId: string, mods: HeroMods): RecruitPlan {
  const def = unit(unitId)
  const full = musterCount(def, mods)
  const root = lineRootOf(unitId)
  const depth = lineDepthOf(unitId)
  let best: { stack: BoardStack; steps: number } | null = null
  for (const s of board) {
    if (lineRootOf(s.unitId) !== root) continue
    const steps = lineDepthOf(s.unitId) - depth
    if (steps < 0) continue
    // The least-advanced eligible stack loses the fewest recruits in training.
    // A fork makes ties reachable for the first time — buy a Whisperseed while
    // fielding an Oakfather and a Blackthorn and both are one step away — so the
    // tie breaks on slot, which is the thing the player can see and arrange,
    // rather than on board order, which they cannot.
    if (!best || steps < best.steps || (steps === best.steps && s.slot < best.stack.slot)) best = { stack: s, steps }
  }
  if (!best) return { target: null, added: full, stepsBehind: 0, formId: unitId }
  return {
    target: best.stack,
    added: Math.max(1, Math.floor(full / 2 ** best.steps)),
    stepsBehind: best.steps,
    formId: best.stack.unitId,
  }
}

/**
 * Two stacks in the same form are one company (§1.2): fold every duplicate of
 * `uid`'s form into it. Without this, promoting into a form you already field
 * leaves two half-stacks that each miss their Banner Rank threshold.
 */
export function mergeSameForm(board: BoardStack[], uid: string): BoardStack[] {
  const keep = board.find((s) => s.uid === uid)
  if (!keep) return board
  const dupes = board.filter((s) => s.uid !== uid && s.unitId === keep.unitId)
  if (dupes.length === 0) return board
  const merged: BoardStack = {
    ...keep,
    count: keep.count + dupes.reduce((n, d) => n + d.count, 0),
    spent: keep.spent + dupes.reduce((n, d) => n + d.spent, 0),
    // Growth bonuses are per unit, not pooled — the company keeps the better.
    bonusAtk: Math.max(keep.bonusAtk, ...dupes.map((d) => d.bonusAtk)),
    bonusHp: Math.max(keep.bonusHp, ...dupes.map((d) => d.bonusHp)),
    growthTicks: Math.max(keep.growthTicks, ...dupes.map((d) => d.growthTicks)),
    rank: Math.max(keep.rank ?? 0, ...dupes.map((d) => d.rank ?? 0)),
  }
  merged.rank = applyRankProgress(merged)
  return board.filter((s) => !dupes.some((d) => d.uid === s.uid)).map((s) => (s.uid === uid ? merged : s))
}

/**
 * Can one of these forms reach the other by promoting? Two siblings of a fork
 * share a root but answer `false` — an Oakheart stack and a Blackthorn stack
 * came from the same seed and are no longer the same company.
 */
export function inSameLine(a: string, b: string): boolean {
  return LINES.onSamePath(a, b)
}

/** Every form this one can still become, itself first. A fork returns both. */
export function lineOf(unitId: string): string[] {
  return LINES.subtreeOf(unitId)
}

/** The promotions actually walked to reach this form: root first, `unitId` last. */
export function lineChainTo(unitId: string): string[] {
  return LINES.chainTo(unitId)
}

export function musterCount(def: UnitDef, mods: HeroMods): number {
  let n = def.musterSize
  if (def.tier <= 2) n += mods.t12CountBonus
  if (def.tier >= 4) n += mods.t45CountBonus
  return Math.max(1, n)
}

export interface RecruitResult {
  ok: boolean
  reason?: string
  board: BoardStack[]
  gold: number
}

let uidCounter = 0
export function resetUid(n = 0) {
  uidCounter = n
}
export function nextUid(): string {
  uidCounter += 1
  return `s${uidCounter}`
}

export function recruit(board: BoardStack[], gold: number, unitId: string, mods: HeroMods): RecruitResult {
  const def = unit(unitId)
  if (gold < RECRUIT_COST) return { ok: false, reason: 'Not enough gold', board, gold }
  const plan = recruitPlan(board, unitId, mods)
  if (plan.target) {
    // A recruit is the main way a stack crosses a Banner Rank threshold (§3.1).
    const count = plan.target.count + plan.added
    const grown = { ...plan.target, count, spent: plan.target.spent + RECRUIT_COST }
    grown.rank = applyRankProgress(grown)
    const next = board.map((s) => (s.uid === plan.target!.uid ? grown : s))
    return { ok: true, board: next, gold: gold - RECRUIT_COST }
  }
  const slot = firstOpenSlot(board, def)
  if (slot === null) return { ok: false, reason: 'No open slot', board, gold }
  const fresh: BoardStack = { uid: nextUid(), unitId, count: plan.added, slot, bonusAtk: 0, bonusHp: 0, growthTicks: 0, spent: RECRUIT_COST, rank: 0 }
  fresh.rank = applyRankProgress(fresh)
  return { ok: true, board: [...board, fresh], gold: gold - RECRUIT_COST }
}

/**
 * What this stack can promote into right now (DN11 §2.1) — every authored path
 * the camp tier has opened, in authored order. Empty means the stack is at the
 * end of its line or the camp is too low; one is an ordinary promotion; two is
 * a fork, and the caller has to ask which.
 *
 * Camp tier gates each path independently, so a fork whose branches sit at
 * different tiers offers only the one the camp has opened. This is what the
 * button will *accept*, not what the sheet should *draw*: a Path sheet that
 * hid the branch you cannot afford yet would be hiding the decision, so it
 * draws both and prices the locked one (see `promoteBlock`).
 */
export function promoteOptions(stack: BoardStack, camp: CampState): UnitDef[] {
  return (unit(stack.unitId).linePaths ?? []).map(unit).filter((t) => t.tier <= camp.tier)
}

/**
 * Promote a stack, optionally naming which path it takes.
 *
 * `targetId` is omitted for a straight line — one option, no question, exactly
 * the call every caller made before DN11. At a fork it is required: promoting
 * without saying what the stack becomes is not a thing the engine will guess,
 * because the choice is permanent and there is no undo.
 */
export function promote(
  board: BoardStack[],
  gold: number,
  uid: string,
  camp: CampState,
  mods: HeroMods,
  targetId?: string,
): RecruitResult {
  const stack = board.find((s) => s.uid === uid)
  if (!stack) return { ok: false, reason: 'No such stack', board, gold }
  const options = promoteOptions(stack, camp)
  if (options.length === 0) return { ok: false, reason: 'Cannot promote', board, gold }
  const target = targetId ? options.find((t) => t.id === targetId) : options.length === 1 ? options[0] : null
  if (!target) {
    return targetId
      ? { ok: false, reason: 'Not a path this stack can take', board, gold }
      : { ok: false, reason: 'Choose a path', board, gold }
  }
  const cost = promoteCost(target, mods)
  if (gold < cost) return { ok: false, reason: 'Not enough gold', board, gold }
  let slot = stack.slot
  // A promotion can change the legal row (e.g. a back-row line ending in a brawler).
  const rowChanges = (target.row === 'front' && slot >= FRONT_SLOTS) || (target.row === 'back' && slot < FRONT_SLOTS)
  if (rowChanges) {
    // Keeping the old slot would leave the stack in a row it may not stand in.
    const open = firstOpenSlot(board.filter((s) => s.uid !== uid), target)
    if (open === null) return { ok: false, reason: 'No room in the target row', board, gold }
    slot = open
  }
  const promoted = board.map((s) => (s.uid === uid ? { ...s, unitId: target.id, slot, spent: s.spent + cost } : s))
  return { ok: true, board: mergeSameForm(promoted, uid), gold: gold - cost }
}

export function sell(board: BoardStack[], gold: number, uid: string, mods: HeroMods): RecruitResult {
  const stack = board.find((s) => s.uid === uid)
  if (!stack) return { ok: false, reason: 'No such stack', board, gold }
  return { ok: true, board: board.filter((s) => s.uid !== uid), gold: gold + sellValue(stack, mods) }
}

export function moveStack(board: BoardStack[], uid: string, slot: number): BoardStack[] {
  if (slot < 0 || slot >= TOTAL_SLOTS) return board
  const moving = board.find((s) => s.uid === uid)
  if (!moving) return board
  const def = unit(moving.unitId)
  const targetRow = slot < FRONT_SLOTS ? 'front' : 'back'
  if (def.row !== 'any' && def.row !== targetRow) return board
  const occupant = board.find((s) => s.slot === slot)
  if (occupant && occupant.uid !== uid) {
    const occDef = unit(occupant.unitId)
    const movingRow = moving.slot < FRONT_SLOTS ? 'front' : 'back'
    if (occDef.row !== 'any' && occDef.row !== movingRow) return board
    return board.map((s) =>
      s.uid === uid ? { ...s, slot } : s.uid === occupant.uid ? { ...s, slot: moving.slot } : s,
    )
  }
  return board.map((s) => (s.uid === uid ? { ...s, slot } : s))
}
