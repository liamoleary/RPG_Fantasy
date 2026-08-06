/**
 * The Command ladder, shared by every faction (Design Notes 05 §3: "Command
 * tracks are the most shared — economy is economy").
 *
 * Every node here recycles an existing Command boon unchanged. The five Command
 * boons that don't fit the ladder become feat-unlocked fork options rather than
 * being deleted — §2.3's "meta-progression widens the forks, never deepens the
 * power" is exactly what they are good for.
 */
import type { TalentNode } from './types'

export const COMMAND_LADDER: TalentNode[] = [
  {
    id: 't_cmd1',
    name: 'Tribute',
    text: '+1 gold every Muster.',
    branch: 'command',
    tier: 1,
    mods: { income: 1 },
    recycles: 'b_tribute',
  },
  {
    id: 't_cmd2a',
    name: 'Haggler',
    text: 'Rerolls are free.',
    branch: 'command',
    tier: 2,
    fork: 'a',
    mods: { rerollDiscount: 1 },
    recycles: 'b_haggler',
  },
  {
    id: 't_cmd2b',
    name: 'Wider Camp',
    text: '+1 War Camp offer slot.',
    branch: 'command',
    tier: 2,
    fork: 'b',
    mods: { extraOfferSlots: 1 },
    recycles: 'b_scoutcamp',
  },
  {
    id: 't_cmd3',
    name: 'Quartermaster',
    text: 'Camp Tier upgrades cost 2 less.',
    branch: 'command',
    tier: 3,
    mods: { tierUpDiscount: 2 },
    recycles: 'b_quartermaster',
  },
  {
    id: 't_cmd4a',
    name: 'Spymaster',
    text: '2 free rerolls every Muster.',
    branch: 'command',
    tier: 4,
    fork: 'a',
    mods: { freeRerollsPerRound: 2 },
    recycles: 'b_spymaster',
  },
  {
    id: 't_cmd4b',
    name: 'Grand Marshal',
    text: 'Rerolls free, promotions cost 2 less, +1 gold every Muster.',
    branch: 'command',
    tier: 4,
    fork: 'b',
    mods: { rerollDiscount: 1, promoteDiscount: 2, income: 1 },
    recycles: 'b_grandmarshal',
  },
  {
    id: 't_cmd5',
    name: 'War Chest',
    text: '+3 gold every Muster and +1 offer slot.',
    branch: 'command',
    tier: 5,
    mods: { income: 3, extraOfferSlots: 1 },
    recycles: 'b_warchest',
  },
]

/**
 * §2.3: feats unlock alternate fork options. These are the Command boons the
 * ladder had no room for — they widen tier 2 and tier 4 without adding power
 * above what those tiers already offer.
 */
export const COMMAND_FEAT_OPTIONS: TalentNode[] = [
  {
    id: 't_cmd2c',
    name: 'Drillyard',
    text: 'Promotions cost 2 less.',
    branch: 'command',
    tier: 2,
    fork: 'a',
    mods: { promoteDiscount: 2 },
    recycles: 'b_drillyard',
    unlockedByFeat: 'feat_promoter',
  },
  {
    id: 't_cmd2d',
    name: 'Salvage Rights',
    text: 'Selling refunds +1 gold.',
    branch: 'command',
    tier: 2,
    fork: 'b',
    mods: { sellBonus: 1 },
    recycles: 'b_salvage',
    unlockedByFeat: 'feat_trader',
  },
  {
    id: 't_cmd4c',
    name: 'War Tithe',
    text: '+2 gold every Muster.',
    branch: 'command',
    tier: 4,
    fork: 'a',
    mods: { income: 2 },
    recycles: 'b_tithe',
    unlockedByFeat: 'feat_rich',
  },
  {
    id: 't_cmd4d',
    name: 'Logistics Corps',
    text: '+1 gold every Muster and Camp Tier upgrades cost 1 less.',
    branch: 'command',
    tier: 4,
    fork: 'b',
    mods: { income: 1, tierUpDiscount: 1 },
    recycles: 'b_logistics',
    unlockedByFeat: 'feat_quartermaster',
  },
  {
    id: 't_cmd2e',
    name: 'Forward Camp',
    text: 'Raise your Camp Tier by 1 immediately.',
    branch: 'command',
    tier: 2,
    fork: 'b',
    mods: { campTierUp: 1 },
    recycles: 'b_forwardcamp',
    unlockedByFeat: 'feat_pioneer',
  },
]
