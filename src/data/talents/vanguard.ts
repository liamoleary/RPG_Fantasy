/**
 * Iron Vanguard trees (Design Notes 05 §3).
 *
 * Might leans Bulwark and Cover — the faction's own mechanics — so the ladder
 * reads as "hold the line harder" rather than a generic stat climb. Magic is
 * the shared spell ladder with the Vanguard's defensive tilt at Expert.
 */
import { COMMAND_LADDER } from './shared'
import type { FactionTree, TalentNode } from './types'

const MIGHT: TalentNode[] = [
  {
    id: 't_vg_might1',
    name: 'Sharpened Steel',
    text: '+1 ATK to every unit in your army.',
    branch: 'might',
    tier: 1,
    mods: { allAtk: 1 },
    recycles: 'b_sharpened',
  },
  {
    id: 't_vg_might2a',
    name: 'Iron Rations',
    text: '+2 HP to every unit in your army.',
    branch: 'might',
    tier: 2,
    fork: 'a',
    mods: { allHp: 2 },
    recycles: 'b_rations',
  },
  {
    id: 't_vg_might2b',
    name: 'Shield Wall',
    text: '+2 Bulwark to front-row stacks at battle start.',
    branch: 'might',
    tier: 2,
    fork: 'b',
    mods: { frontBulwark: 2 },
    recycles: 'b_shieldwall',
  },
  {
    id: 't_vg_might3',
    name: 'Front Line Doctrine',
    text: '+2 ATK to front-row units.',
    branch: 'might',
    tier: 3,
    mods: { frontAtk: 2 },
    recycles: 'b_frontline',
  },
  {
    id: 't_vg_might4a',
    name: 'Overwatch',
    text: 'Front-row stacks gain Cover 1 — each intercepts one volley aimed behind it.',
    branch: 'might',
    tier: 4,
    fork: 'a',
    mods: { frontCover: 1 },
    recycles: 'b_overwatch',
  },
  {
    id: 't_vg_might4b',
    name: 'Vengeance',
    text: 'Your stacks retaliate with +2 ATK.',
    branch: 'might',
    tier: 4,
    fork: 'b',
    mods: { retaliationAtk: 2 },
    recycles: 'b_vengeance',
  },
  {
    id: 't_vg_might5',
    name: 'Cleaving Advance',
    text: 'Front-row stacks gain Cleave — adjacency matters everywhere.',
    branch: 'might',
    tier: 5,
    mods: { cleaveFront: true },
    recycles: 'b_cleaver',
  },
]

const MAGIC: TalentNode[] = [
  {
    id: 't_vg_magic1',
    name: 'Focus',
    text: 'Your battle spell is +3 stronger.',
    branch: 'magic',
    tier: 1,
    mods: { spellPower: 3 },
    recycles: 'b_focus',
  },
  {
    id: 't_vg_magic2a',
    name: 'Echoing Word',
    text: 'Your battle spell casts one extra time per battle.',
    branch: 'magic',
    tier: 2,
    fork: 'a',
    mods: { spellExtraCasts: 1 },
    recycles: 'b_echo',
  },
  {
    id: 't_vg_magic2b',
    name: 'Quickened Cant',
    text: 'Your battle spell recurs 1 exchange sooner.',
    branch: 'magic',
    tier: 2,
    fork: 'b',
    mods: { spellCadenceReduction: 1 },
    recycles: 'b_quicken',
  },
  {
    id: 't_vg_magic3',
    name: 'Warded Vanguard',
    text: 'Your first-striking stack begins with +3 Bulwark and your spell is +1 stronger.',
    branch: 'magic',
    tier: 3,
    mods: { firstStrikeBulwark: 3, spellPower: 1 },
    recycles: 'b_ward',
  },
  {
    id: 't_vg_magic4a',
    name: 'Deep Focus',
    text: 'Your battle spell is +7 stronger.',
    branch: 'magic',
    tier: 4,
    fork: 'a',
    mods: { spellPower: 7 },
    recycles: 'b_deepfocus',
  },
  {
    id: 't_vg_magic4b',
    name: 'Spellsplash',
    text: 'Your battle spell affects one additional target.',
    branch: 'magic',
    tier: 4,
    fork: 'b',
    mods: { spellSplash: 1 },
    recycles: 'b_splash',
  },
  {
    id: 't_vg_magic5',
    name: 'Archmage',
    text: '+2 extra casts and +6 spell power — the spell becomes your win condition.',
    branch: 'magic',
    tier: 5,
    mods: { spellExtraCasts: 2, spellPower: 6 },
    recycles: 'b_archmage',
  },
]

/**
 * Hero overrides (§3). Each replaces the base node at its slot, so Berrik and
 * Yseult read as different characters on the same skeleton — and they override
 * *different* slots, which is what §8.3 asks to be visible.
 */
const OVERRIDES: TalentNode[] = [
  {
    id: 't_vg_might3_berrik',
    heroId: 'h_berrik',
    name: 'Oathwall',
    text: '+3 Bulwark and +1 ATK to front-row stacks.',
    branch: 'might',
    tier: 3,
    mods: { frontBulwark: 3, frontAtk: 1 },
    recycles: 'b_oathwall',
  },
  {
    id: 't_vg_magic3_berrik',
    heroId: 'h_berrik',
    name: 'Endless Oath',
    text: 'Shield Line is +4 stronger and casts one extra time.',
    branch: 'magic',
    tier: 3,
    mods: { spellPower: 4, spellExtraCasts: 1 },
    recycles: 'b_bulwark_engine',
  },
  {
    id: 't_vg_might3_yseult',
    heroId: 'h_yseult',
    name: 'The Unbroken Line',
    text: '+3 HP to every unit in your army.',
    branch: 'might',
    tier: 3,
    mods: { allHp: 3 },
    recycles: 'b_unbroken_line',
  },
  {
    id: 't_vg_magic4a_yseult',
    heroId: 'h_yseult',
    name: 'Echoing Horn',
    text: 'Rallying Horn recurs 3 exchanges sooner.',
    branch: 'magic',
    tier: 4,
    fork: 'a',
    mods: { spellCadenceReduction: 3 },
    recycles: 'b_horn_echo',
  },
]

export const VANGUARD_TREE: FactionTree = {
  factionId: 'vanguard',
  nodes: [...MIGHT, ...MAGIC, ...COMMAND_LADDER, ...OVERRIDES],
}
