import type { HeroDef } from './types'

export const HEROES: HeroDef[] = [
  // ── Iron Vanguard ────────────────────────────────────────────────────────
  {
    id: 'h_berrik',
    name: 'Thane Berrik',
    title: 'Oathmantle',
    faction: 'vanguard',
    unlockRenown: 0,
    sigil: 'shield',
    passive: { id: 'frontBulwark3', x: 2, text: 'Your front-row stacks start battle with +2 Bulwark.' },
    spell: {
      id: 'shieldLowest',
      name: 'Shield Line',
      text: 'Grant the lowest-HP friendly stack +X Bulwark.',
      base: 2,
      perLevel: 0.7,
      atStart: true,
      everyN: 6,
    },
    signatureBoons: ['b_oathwall', 'b_bulwark_engine'],
  },
  {
    id: 'h_yseult',
    name: 'Marshal Yseult',
    title: 'the Unbroken',
    faction: 'vanguard',
    unlockRenown: 150,
    sigil: 'hammer',
    passive: {
      id: 'lastStand',
      text: 'The first time each battle a friendly stack would be wiped, it survives with 1 unit.',
    },
    spell: {
      id: 'rallyAtk',
      name: 'Rallying Horn',
      text: 'All friendly stacks gain +X ATK for the rest of the battle.',
      base: 1,
      perLevel: 0.9,
      atStart: true,
      everyN: 6,
    },
    signatureBoons: ['b_unbroken_line', 'b_horn_echo'],
  },

  // ── Verdant Court ────────────────────────────────────────────────────────
  {
    id: 'h_sylvaen',
    name: 'Archdruid Sylvaen',
    title: 'the Rootspeaker',
    faction: 'verdant',
    unlockRenown: 0,
    sigil: 'leaf',
    passive: { id: 'growthPlusHp', x: 1, text: 'Growth triggers grant +1 extra HP.' },
    spell: {
      id: 'healMostWounded',
      name: 'Rejuvenate',
      text: 'Heal the most-wounded friendly stack for X (revives fallen units).',
      base: 8,
      perLevel: 4,
      atStart: false,
      everyN: 5,
    },
    signatureBoons: ['b_first_bloom', 'b_worldroot'],
  },
  {
    id: 'h_maravel',
    name: 'Thornqueen Maravel',
    title: 'of the Deep Grove',
    faction: 'verdant',
    unlockRenown: 200,
    sigil: 'thorn',
    passive: {
      id: 'survivorGrowsCount',
      text: 'Each stack that survives a battle permanently gains +1 count.',
    },
    spell: {
      id: 'root',
      name: 'Bramble Coil',
      text: "Root the enemy's highest-ATK stack for X exchanges — it cannot act.",
      base: 2,
      perLevel: 0.5,
      atStart: true,
      everyN: 7,
    },
    signatureBoons: ['b_thorn_crown', 'b_bramble_field'],
  },

  // ── Stormtide Clans ──────────────────────────────────────────────────────
  {
    id: 'h_grommash',
    // Display name only — the id stays h_grommash so saves and art keep working.
    name: 'Warchief Gorrath',
    title: 'Tidebreaker',
    faction: 'stormtide',
    unlockRenown: 0,
    sigil: 'fang',
    passive: {
      id: 'frenzyPermanentAtk',
      x: 1,
      text: "Each stack's first Frenzy trigger each battle grants +1 extra ATK.",
    },
    spell: {
      id: 'chainLightning',
      name: 'Chain Lightning',
      text: 'Deal X damage split across the 3 largest enemy stacks.',
      base: 12,
      perLevel: 6,
      atStart: true,
      everyN: 6,
    },
    signatureBoons: ['b_blood_tide', 'b_storm_crown'],
  },
  {
    id: 'h_zhala',
    name: 'Seeress Zhala',
    title: 'of the Nine Winds',
    faction: 'stormtide',
    unlockRenown: 250,
    sigil: 'totem',
    passive: { id: 'extraCast', x: 1, text: 'Your battle spell casts one extra time per battle.' },
    spell: {
      id: 'extraAttack',
      name: 'Ancestral Fury',
      text: 'A random friendly stack immediately attacks X times.',
      base: 1,
      perLevel: 0.45,
      atStart: false,
      everyN: 4,
    },
    signatureBoons: ['b_nine_winds', 'b_ancestor_echo'],
  },
]

export const HERO_BY_ID = new Map(HEROES.map((h) => [h.id, h]))

export function heroesOfFaction(f: string): HeroDef[] {
  return HEROES.filter((h) => h.faction === f)
}
