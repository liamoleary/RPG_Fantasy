/** War Camp economy: offers, rerolls, tier-ups, recruiting, promoting, selling. */
import { MERC_UNITS, unit, unitsOfPool } from '../data/index'
import type { FactionId, HeroMods, UnitDef } from '../data/types'
import type { BoardStack } from './battle'
import { FRONT_SLOTS, TOTAL_SLOTS } from './battle'
import type { RNG } from './rng'

export const RECRUIT_COST = 3
export const REROLL_COST = 1
export const MAX_CAMP_TIER = 5
export const BASE_INCOME_CAP = 10
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

/** Units eligible for a camp offer at this tier. */
export function offerPool(factionId: FactionId, tier: number): { faction: UnitDef[]; mercs: UnitDef[] } {
  return {
    faction: unitsOfPool(factionId).filter((u) => u.tier <= tier),
    mercs: MERC_UNITS.filter((u) => u.tier <= tier),
  }
}

export function rollOffer(factionId: FactionId, camp: CampState, mods: HeroMods, rng: RNG): string[] {
  const { faction, mercs } = offerPool(factionId, camp.tier)
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

export function inSameLine(a: string, b: string): boolean {
  if (a === b) return true
  return lineOf(a).includes(b) || lineOf(b).includes(a)
}

export function lineOf(unitId: string): string[] {
  const out: string[] = [unitId]
  let cur = unit(unitId)
  while (cur.lineNext) {
    out.push(cur.lineNext)
    cur = unit(cur.lineNext)
  }
  return out
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
  const add = musterCount(def, mods)
  const existing = stackOfUnit(board, unitId)
  if (existing) {
    const next = board.map((s) => (s.uid === existing.uid ? { ...s, count: s.count + add, spent: s.spent + RECRUIT_COST } : s))
    return { ok: true, board: next, gold: gold - RECRUIT_COST }
  }
  const slot = firstOpenSlot(board, def)
  if (slot === null) return { ok: false, reason: 'No open slot', board, gold }
  const fresh: BoardStack = { uid: nextUid(), unitId, count: add, slot, bonusAtk: 0, bonusHp: 0, growthTicks: 0, spent: RECRUIT_COST }
  return { ok: true, board: [...board, fresh], gold: gold - RECRUIT_COST }
}

export function canPromote(stack: BoardStack, camp: CampState): UnitDef | null {
  const def = unit(stack.unitId)
  if (!def.lineNext) return null
  const target = unit(def.lineNext)
  if (target.tier > camp.tier) return null
  return target
}

export function promote(board: BoardStack[], gold: number, uid: string, camp: CampState, mods: HeroMods): RecruitResult {
  const stack = board.find((s) => s.uid === uid)
  if (!stack) return { ok: false, reason: 'No such stack', board, gold }
  const target = canPromote(stack, camp)
  if (!target) return { ok: false, reason: 'Cannot promote', board, gold }
  const cost = promoteCost(target, mods)
  if (gold < cost) return { ok: false, reason: 'Not enough gold', board, gold }
  let slot = stack.slot
  // A promotion can change the legal row (e.g. a back-row line ending in a brawler).
  if (target.row === 'front' && slot >= FRONT_SLOTS) slot = firstOpenSlot(board.filter((s) => s.uid !== uid), target) ?? slot
  if (target.row === 'back' && slot < FRONT_SLOTS) slot = firstOpenSlot(board.filter((s) => s.uid !== uid), target) ?? slot
  const next = board.map((s) => (s.uid === uid ? { ...s, unitId: target.id, slot, spent: s.spent + cost } : s))
  return { ok: true, board: next, gold: gold - cost }
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
