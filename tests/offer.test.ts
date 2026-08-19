import { describe, expect, it } from 'vitest'
import type { FactionId } from '../src/data/types'
import { ZERO_MODS } from '../src/data/types'
import { newCamp, rollOffer, type OfferContext } from '../src/engine/camp'
import { makeRng } from '../src/engine/rng'

/**
 * The OfferContext refactor is provably invisible (DN11 §3).
 *
 * `rollOffer` grew from four positional arguments to one context, because
 * kinship needs the board and the Boss Tavern needs the Trials won — and the
 * player and every rival must roll through the same door or the lobby stops
 * being fair. A refactor of the camp's hot path is exactly the kind of change
 * that silently reshapes a distribution, so it does not get to be trusted.
 *
 * These offers were captured from the PRE-refactor implementation, before the
 * context existed, and are asserted byte-for-byte against the new one: same
 * faction, same camp tier, same mods, same seed. A context with no owned kins
 * and no defeated Courts must roll exactly what the old signature rolled.
 *
 * When kinship lands, these stay green — an empty kin set is the identity case,
 * and that is the whole point of pinning it here first.
 */
const GOLDEN: [string, number, number, string[]][] = [
  ['vanguard', 1, 1, ["vg_militia","vg_apprentice","mc_roadwarden"]],
  ['vanguard', 1, 12345, ["mc_roadwarden","vg_apprentice","vg_crossbow"]],
  ['vanguard', 1, 99991, ["vg_crossbow","vg_mule","vg_mule"]],
  ['vanguard', 2, 1, ["vg_militia","vg_apprentice","mc_factor","vg_shieldmaiden"]],
  ['vanguard', 2, 12345, ["mc_factor","vg_apprentice","vg_crossbow","vg_shieldmaiden"]],
  ['vanguard', 2, 99991, ["vg_mule","vg_shieldmaiden","vg_shieldmaiden","vg_militia"]],
  ['vanguard', 3, 1, ["vg_militia","vg_apprentice","mc_hedgeknight","vg_cleric","vg_apprentice"]],
  ['vanguard', 3, 12345, ["mc_hedgeknight","vg_cleric","vg_mule","vg_cleric","mc_pikewall"]],
  ['vanguard', 3, 99991, ["vg_shieldmaiden","vg_cleric","vg_shieldmaiden","vg_militia","vg_mule"]],
  ['vanguard', 4, 1, ["vg_militia","vg_apprentice","mc_hedgeknight","vg_cannon","vg_apprentice","vg_cleric"]],
  ['vanguard', 4, 12345, ["mc_hedgeknight","vg_cannon","vg_shieldmaiden","vg_cannon","mc_engineer","vg_apprentice"]],
  ['vanguard', 4, 99991, ["vg_cleric","vg_cannon","vg_cleric","vg_militia","vg_shieldmaiden","vg_cleric"]],
  ['vanguard', 5, 1, ["vg_militia","vg_apprentice","mc_bowman","vg_colossus","vg_apprentice","vg_cleric","vg_cleric"]],
  ['vanguard', 5, 12345, ["mc_bowman","vg_colossus","vg_shieldmaiden","vg_colossus","mc_wyrm","vg_apprentice","mc_wyrm"]],
  ['vanguard', 5, 99991, ["vg_cleric","vg_cannon","vg_cannon","vg_militia","vg_shieldmaiden","vg_cannon","vg_cannon"]],
  ['verdant', 1, 1, ["vd_sapling","vd_whisperseed","mc_roadwarden"]],
  ['verdant', 1, 12345, ["mc_roadwarden","vd_whisperseed","vd_dryad"]],
  ['verdant', 1, 99991, ["vd_dryad","vd_grovetender","vd_grovetender"]],
  ['verdant', 2, 1, ["vd_sapling","vd_whisperseed","mc_factor","vd_glade"]],
  ['verdant', 2, 12345, ["mc_factor","vd_whisperseed","vd_dryad","vd_glade"]],
  ['verdant', 2, 99991, ["vd_grovetender","vd_glade","vd_glade","vd_sapling"]],
  ['verdant', 3, 1, ["vd_sapling","vd_whisperseed","mc_hedgeknight","vd_stag","vd_whisperseed"]],
  ['verdant', 3, 12345, ["mc_hedgeknight","vd_stag","vd_grovetender","vd_stag","mc_pikewall"]],
  ['verdant', 3, 99991, ["vd_glade","vd_stag","vd_glade","vd_sapling","vd_grovetender"]],
  ['verdant', 4, 1, ["vd_sapling","vd_whisperseed","mc_hedgeknight","vd_warden","vd_whisperseed","vd_stag"]],
  ['verdant', 4, 12345, ["mc_hedgeknight","vd_warden","vd_glade","vd_warden","mc_engineer","vd_whisperseed"]],
  ['verdant', 4, 99991, ["vd_stag","vd_warden","vd_stag","vd_sapling","vd_glade","vd_stag"]],
  ['verdant', 5, 1, ["vd_sapling","vd_whisperseed","mc_bowman","vd_ancient","vd_whisperseed","vd_stag","vd_stag"]],
  ['verdant', 5, 12345, ["mc_bowman","vd_ancient","vd_glade","vd_ancient","mc_wyrm","vd_whisperseed","mc_wyrm"]],
  ['verdant', 5, 99991, ["vd_stag","vd_warden","vd_warden","vd_sapling","vd_glade","vd_warden","vd_warden"]],
  ['stormtide', 1, 1, ["st_raider","st_whelp","mc_roadwarden"]],
  ['stormtide', 1, 12345, ["mc_roadwarden","st_whelp","st_slinger"]],
  ['stormtide', 1, 99991, ["st_slinger","st_drummer","st_drummer"]],
  ['stormtide', 2, 1, ["st_raider","st_whelp","mc_factor","st_shaman"]],
  ['stormtide', 2, 12345, ["mc_factor","st_whelp","st_slinger","st_shaman"]],
  ['stormtide', 2, 99991, ["st_drummer","st_shaman","st_shaman","st_raider"]],
  ['stormtide', 3, 1, ["st_raider","st_whelp","mc_hedgeknight","st_shaman","st_whelp"]],
  ['stormtide', 3, 12345, ["mc_hedgeknight","st_shaman","st_drummer","st_shaman","mc_pikewall"]],
  ['stormtide', 3, 99991, ["st_wolfrider","st_wolfrider","st_wolfrider","st_raider","st_drummer"]],
  ['stormtide', 4, 1, ["st_raider","st_whelp","mc_hedgeknight","st_roc","st_whelp","st_wolfrider"]],
  ['stormtide', 4, 12345, ["mc_hedgeknight","st_roc","st_wolfrider","st_roc","mc_engineer","st_whelp"]],
  ['stormtide', 4, 99991, ["st_wolfrider","st_roc","st_shaman","st_raider","st_wolfrider","st_shaman"]],
  ['stormtide', 5, 1, ["st_raider","st_whelp","mc_bowman","st_leviathan","st_whelp","st_shaman","st_wolfrider"]],
  ['stormtide', 5, 12345, ["mc_bowman","st_leviathan","st_wolfrider","st_leviathan","mc_wyrm","st_whelp","mc_wyrm"]],
  ['stormtide', 5, 99991, ["st_shaman","st_roc","st_roc","st_raider","st_wolfrider","st_roc","st_roc"]],
  ['vanguard+slots2', 4, 777, ["vg_militia","vg_crossbow","vg_shieldmaiden","vg_cannon","vg_cannon","mc_engineer","vg_cannon","vg_apprentice"]],
  ['vanguard+slots4', 4, 777, ["vg_militia","vg_crossbow","vg_shieldmaiden","vg_cannon","vg_cannon","mc_engineer","vg_cannon","vg_apprentice"]],
]

const ctx = (label: string, tier: number): OfferContext => {
  const slots = label.startsWith('vanguard+slots') ? Number(label.slice('vanguard+slots'.length)) : 0
  const factionId = (slots > 0 ? 'vanguard' : label) as FactionId
  return {
    factionId,
    camp: { ...newCamp(), tier },
    mods: { ...ZERO_MODS, extraOfferSlots: slots },
    board: [],
    defeatedCourts: [],
  }
}

describe('rollOffer through an OfferContext rolls what it always did', () => {
  it.each(GOLDEN)('%s tier %d seed %d', (label, tier, seed, expected) => {
    expect(rollOffer(ctx(label, tier), makeRng(seed))).toEqual(expected)
  })

  it('covers every faction, every camp tier, and a widened camp', () => {
    expect(GOLDEN).toHaveLength(47)
    for (const f of ['vanguard', 'verdant', 'stormtide']) {
      for (const tier of [1, 2, 3, 4, 5]) {
        expect(GOLDEN.some(([l, t]) => l === f && t === tier), `${f} tier ${tier}`).toBe(true)
      }
    }
    expect(GOLDEN.some(([l]) => l.includes('slots'))).toBe(true)
  })

  it('is pure: the same context and seed roll the same offer every time', () => {
    const c = ctx('verdant', 3)
    expect(rollOffer(c, makeRng(31337))).toEqual(rollOffer(c, makeRng(31337)))
  })

  it('reads nothing but its context — an unrelated board does not move the roll', () => {
    // Until kinship exists the board is inert, and this is what says so. When
    // §3 lands, THIS is the test that changes, deliberately and visibly.
    const base = ctx('stormtide', 4)
    const withBoard: OfferContext = {
      ...base,
      board: [
        { uid: 's1', unitId: 'st_whelp', count: 6, slot: 0, bonusAtk: 0, bonusHp: 0, growthTicks: 0, spent: 3, rank: 0 },
      ],
    }
    expect(rollOffer(withBoard, makeRng(4242))).toEqual(rollOffer(base, makeRng(4242)))
  })
})
