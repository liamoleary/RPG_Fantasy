/**
 * Verdant Court trees (Design Notes 05 §3).
 *
 * Might leans Growth: the ladder rewards buying growing stacks early and
 * holding them, which is the faction's whole clock. Magic tilts toward
 * scaling-over-time rather than burst.
 */
import { COMMAND_LADDER } from './shared'
import type { FactionTree, TalentNode } from './types'

const MIGHT: TalentNode[] = [
  {
    id: 't_vd_might1',
    name: 'Iron Rations',
    text: '+2 HP to every unit in your army.',
    branch: 'might',
    tier: 1,
    mods: { allHp: 2 },
    recycles: 'b_rations',
  },
  {
    id: 't_vd_might2a',
    name: 'Sharpened Steel',
    text: '+1 ATK to every unit in your army.',
    branch: 'might',
    tier: 2,
    fork: 'a',
    mods: { allAtk: 1 },
    recycles: 'b_sharpened',
  },
  {
    id: 't_vd_might2b',
    name: 'Mass Levy',
    text: 'Tier 1–2 recruits arrive with +2 extra count.',
    branch: 'might',
    tier: 2,
    fork: 'b',
    mods: { t12CountBonus: 2 },
    recycles: 'b_levy',
  },
  {
    id: 't_vd_might3',
    name: 'Fertile Ground',
    text: 'Growth grants +1 extra ATK and HP.',
    branch: 'might',
    tier: 3,
    mods: { growthBonus: 1 },
    recycles: 'b_fertile',
  },
  {
    id: 't_vd_might4a',
    name: 'Marksmen',
    text: '+2 ATK to back-row units.',
    branch: 'might',
    tier: 4,
    fork: 'a',
    mods: { backAtk: 2 },
    recycles: 'b_marksmen',
  },
  {
    id: 't_vd_might4b',
    name: 'Volley Drill',
    text: '+2 ATK to Volley stacks.',
    branch: 'might',
    tier: 4,
    fork: 'b',
    mods: { volleyAtk: 2 },
    recycles: 'b_volleydrill',
  },
  {
    id: 't_vd_might5',
    name: 'Vampiric Banner',
    text: 'Every stack you own gains Lifesteal.',
    branch: 'might',
    tier: 5,
    mods: { lifestealAll: true },
    recycles: 'b_vampiric',
  },
]

const MAGIC: TalentNode[] = [
  {
    id: 't_vd_magic1',
    name: 'Focus',
    text: 'Your battle spell is +3 stronger.',
    branch: 'magic',
    tier: 1,
    mods: { spellPower: 3 },
    recycles: 'b_focus',
  },
  {
    id: 't_vd_magic2a',
    name: 'Quickened Cant',
    text: 'Your battle spell recurs 1 exchange sooner.',
    branch: 'magic',
    tier: 2,
    fork: 'a',
    mods: { spellCadenceReduction: 1 },
    recycles: 'b_quicken',
  },
  {
    id: 't_vd_magic2b',
    name: 'Echoing Word',
    text: 'Your battle spell casts one extra time per battle.',
    branch: 'magic',
    tier: 2,
    fork: 'b',
    mods: { spellExtraCasts: 1 },
    recycles: 'b_echo',
  },
  {
    id: 't_vd_magic3',
    name: 'Attunement',
    text: 'Your battle spell gains +2 power per hero level.',
    branch: 'magic',
    tier: 3,
    mods: { spellPowerPerLevel: 2 },
    recycles: 'b_attunement',
  },
  {
    id: 't_vd_magic4a',
    name: 'Deep Focus',
    text: 'Your battle spell is +7 stronger.',
    branch: 'magic',
    tier: 4,
    fork: 'a',
    mods: { spellPower: 7 },
    recycles: 'b_deepfocus',
  },
  {
    id: 't_vd_magic4b',
    name: 'Leyline Tap',
    text: '+1 extra cast and +2 spell power.',
    branch: 'magic',
    tier: 4,
    fork: 'b',
    mods: { spellExtraCasts: 1, spellPower: 2 },
    recycles: 'b_leyline',
  },
  {
    id: 't_vd_magic5',
    name: 'Cataclysm',
    text: '+12 spell power and +1 target.',
    branch: 'magic',
    tier: 5,
    mods: { spellPower: 12, spellSplash: 1 },
    recycles: 'b_cataclysm',
  },
]

const OVERRIDES: TalentNode[] = [
  {
    id: 't_vd_might3_sylvaen',
    heroId: 'h_sylvaen',
    name: 'First Bloom',
    text: 'Growth grants +2 extra ATK and HP.',
    branch: 'might',
    tier: 3,
    mods: { growthBonus: 2 },
    recycles: 'b_first_bloom',
  },
  {
    id: 't_vd_magic4a_sylvaen',
    heroId: 'h_sylvaen',
    name: 'Worldroot',
    text: 'Rejuvenate is +10 stronger.',
    branch: 'magic',
    tier: 4,
    fork: 'a',
    mods: { spellPower: 10 },
    recycles: 'b_worldroot',
  },
  {
    id: 't_vd_might3_maravel',
    heroId: 'h_maravel',
    name: 'Thorn Crown',
    text: '+2 ATK to every unit in your army.',
    branch: 'might',
    tier: 3,
    mods: { allAtk: 2 },
    recycles: 'b_thorn_crown',
  },
  {
    id: 't_vd_magic4b_maravel',
    heroId: 'h_maravel',
    name: 'Bramble Field',
    text: 'Bramble Coil casts 2 extra times per battle.',
    branch: 'magic',
    tier: 4,
    fork: 'b',
    mods: { spellExtraCasts: 2 },
    recycles: 'b_bramble_field',
  },
]

export const VERDANT_TREE: FactionTree = {
  factionId: 'verdant',
  nodes: [...MIGHT, ...MAGIC, ...COMMAND_LADDER, ...OVERRIDES],
}
