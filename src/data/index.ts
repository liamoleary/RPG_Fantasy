import type { FactionDef, FactionId, UnitDef } from './types'
import { VANGUARD, VANGUARD_UNITS } from './factions/vanguard'
import { VERDANT, VERDANT_UNITS } from './factions/verdant'
import { STORMTIDE, STORMTIDE_UNITS } from './factions/stormtide'
import { MERC_UNITS } from './factions/mercs'

export * from './types'
export { HEROES, HERO_BY_ID, heroesOfFaction } from './heroes'
export { BOONS, BOON_BY_ID } from './boons'

/** Playable at launch (M2). Gravebound / Conclave / Emberhorde land in M3. */
export const FACTIONS: FactionDef[] = [VANGUARD, VERDANT, STORMTIDE]
export const FACTION_BY_ID = new Map(FACTIONS.map((f) => [f.id, f]))

export const ALL_UNITS: UnitDef[] = [...VANGUARD_UNITS, ...VERDANT_UNITS, ...STORMTIDE_UNITS, ...MERC_UNITS]
export const UNIT_BY_ID = new Map(ALL_UNITS.map((u) => [u.id, u]))
export { MERC_UNITS }

export function unit(id: string): UnitDef {
  const u = UNIT_BY_ID.get(id)
  if (!u) throw new Error(`unknown unit: ${id}`)
  return u
}

export function faction(id: FactionId): FactionDef {
  const f = FACTION_BY_ID.get(id)
  if (!f) throw new Error(`unknown faction: ${id}`)
  return f
}

export function unitsOfPool(pool: string): UnitDef[] {
  return ALL_UNITS.filter((u) => u.pool === pool)
}
