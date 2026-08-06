/**
 * Stormtide Clans trees (Design Notes 05 §3).
 *
 * Might leans Frenzy — the ladder pays you for taking casualties, which is the
 * faction's bargain. The Magic capstone is authored rather than recycled: only
 * two spell capstones existed and both were already spoken for, and giving the
 * third faction a copy would have made the deepest node in the tree a
 * duplicate. It claims no effect parity because it recycles nothing.
 */
import { COMMAND_LADDER } from './shared'
import type { FactionTree, TalentNode } from './types'

const MIGHT: TalentNode[] = [
  {
    id: 't_st_might1',
    name: 'Sharpened Steel',
    text: '+1 ATK to every unit in your army.',
    branch: 'might',
    tier: 1,
    mods: { allAtk: 1 },
    recycles: 'b_sharpened',
  },
  {
    id: 't_st_might2a',
    name: 'Front Line Doctrine',
    text: '+2 ATK to front-row units.',
    branch: 'might',
    tier: 2,
    fork: 'a',
    mods: { frontAtk: 2 },
    recycles: 'b_frontline',
  },
  {
    id: 't_st_might2b',
    name: 'Mass Levy',
    text: 'Tier 1–2 recruits arrive with +2 extra count.',
    branch: 'might',
    tier: 2,
    fork: 'b',
    mods: { t12CountBonus: 2 },
    recycles: 'b_levy',
  },
  {
    id: 't_st_might3',
    name: 'Bloodlust',
    text: 'Frenzy triggers grant +2 extra ATK.',
    branch: 'might',
    tier: 3,
    mods: { frenzyAtk: 2 },
    recycles: 'b_bloodlust',
  },
  {
    id: 't_st_might4a',
    name: 'Elite Muster',
    text: 'Tier 4–5 recruits arrive with +1 extra count.',
    branch: 'might',
    tier: 4,
    fork: 'a',
    mods: { t45CountBonus: 1 },
    recycles: 'b_elite_muster',
  },
  {
    id: 't_st_might4b',
    name: 'Vengeance',
    text: 'Your stacks retaliate with +2 ATK.',
    branch: 'might',
    tier: 4,
    fork: 'b',
    mods: { retaliationAtk: 2 },
    recycles: 'b_vengeance',
  },
  {
    id: 't_st_might5',
    name: 'Warcry of the Van',
    text: 'Every stack you own gains Charge — your whole army acts first on cycle 1.',
    branch: 'might',
    tier: 5,
    mods: { chargeAll: true },
    recycles: 'b_warcry',
  },
]

const MAGIC: TalentNode[] = [
  {
    id: 't_st_magic1',
    name: 'Focus',
    text: 'Your battle spell is +3 stronger.',
    branch: 'magic',
    tier: 1,
    mods: { spellPower: 3 },
    recycles: 'b_focus',
  },
  {
    id: 't_st_magic2a',
    name: 'Echoing Word',
    text: 'Your battle spell casts one extra time per battle.',
    branch: 'magic',
    tier: 2,
    fork: 'a',
    mods: { spellExtraCasts: 1 },
    recycles: 'b_echo',
  },
  {
    id: 't_st_magic2b',
    name: 'Spellsplash',
    text: 'Your battle spell affects one additional target.',
    branch: 'magic',
    tier: 2,
    fork: 'b',
    mods: { spellSplash: 1 },
    recycles: 'b_splash',
  },
  {
    id: 't_st_magic3',
    name: 'Torrent of Words',
    text: 'Your battle spell recurs 2 exchanges sooner.',
    branch: 'magic',
    tier: 3,
    mods: { spellCadenceReduction: 2 },
    recycles: 'b_torrent',
  },
  {
    id: 't_st_magic4a',
    name: 'Deep Focus',
    text: 'Your battle spell is +7 stronger.',
    branch: 'magic',
    tier: 4,
    fork: 'a',
    mods: { spellPower: 7 },
    recycles: 'b_deepfocus',
  },
  {
    id: 't_st_magic4b',
    name: 'Attunement',
    text: 'Your battle spell gains +2 power per hero level.',
    branch: 'magic',
    tier: 4,
    fork: 'b',
    mods: { spellPowerPerLevel: 2 },
    recycles: 'b_attunement',
  },
  {
    id: 't_st_magic5',
    name: 'Stormcalling',
    text: '+8 spell power, +1 extra cast and +1 target.',
    branch: 'magic',
    tier: 5,
    mods: { spellPower: 8, spellExtraCasts: 1, spellSplash: 1 },
  },
]

const OVERRIDES: TalentNode[] = [
  {
    id: 't_st_might3_grommash',
    heroId: 'h_grommash',
    name: 'Blood Tide',
    text: 'Frenzy triggers grant +3 extra ATK.',
    branch: 'might',
    tier: 3,
    mods: { frenzyAtk: 3 },
    recycles: 'b_blood_tide',
  },
  {
    id: 't_st_magic4a_grommash',
    heroId: 'h_grommash',
    name: 'Storm Crown',
    text: 'Chain Lightning is +9 stronger and strikes one more target.',
    branch: 'magic',
    tier: 4,
    fork: 'a',
    mods: { spellPower: 9, spellSplash: 1 },
    recycles: 'b_storm_crown',
  },
  {
    id: 't_st_might5_zhala',
    heroId: 'h_zhala',
    name: 'Echo of Ancestors',
    text: '+1 ATK to every unit, and every stack you own gains Charge.',
    branch: 'might',
    tier: 5,
    mods: { allAtk: 1, chargeAll: true },
    recycles: 'b_ancestor_echo',
  },
  {
    id: 't_st_magic4a_zhala',
    heroId: 'h_zhala',
    name: 'Nine Winds',
    text: 'Your battle spell casts 2 extra times and recurs 1 exchange sooner.',
    branch: 'magic',
    tier: 4,
    fork: 'a',
    mods: { spellExtraCasts: 2, spellCadenceReduction: 1 },
    recycles: 'b_nine_winds',
  },
]

export const STORMTIDE_TREE: FactionTree = {
  factionId: 'stormtide',
  nodes: [...MIGHT, ...MAGIC, ...COMMAND_LADDER, ...OVERRIDES],
}
