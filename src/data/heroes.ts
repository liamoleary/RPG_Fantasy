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
    passive: { id: 'frontBulwark3', x: 7, text: 'Your front-row stacks start battle with +7 Bulwark.' },
    spell: {
      id: 'shieldLowest',
      name: 'Shield Line',
      text: 'Grant the lowest-HP friendly stack +X Bulwark.',
      base: 6.6,
      perLevel: 2.2,
      atStart: true,
      everyN: 3,
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
      x: 2,
      text: 'The first two times each battle a friendly stack would be wiped, it survives with 1 unit.',
    },
    spell: {
      id: 'rallyAtk',
      name: 'Rallying Horn',
      text: 'All friendly stacks gain +X ATK for the rest of the battle.',
      // DN10 balance pass: at 2.8/level she won 30.7% of lobbies — an
      // army-wide, battle-long buff has to scale gently or it owns the game.
      base: 2.3,
      perLevel: 1.4,
      atStart: true,
      everyN: 3,
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
    passive: { id: 'growthPlusHp', x: 2, text: 'Growth triggers grant +2 extra HP.' },
    spell: {
      id: 'healMostWounded',
      name: 'Rejuvenate',
      text: 'Heal the most-wounded friendly stack for X (revives fallen units).',
      base: 21.5,
      perLevel: 15.4,
      atStart: false,
      everyN: 3,
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
      base: 4,
      perLevel: 1.0,
      atStart: true,
      everyN: 3,
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
      x: 2,
      text: "Each stack's first Frenzy trigger each battle grants +2 extra ATK.",
    },
    spell: {
      id: 'chainLightning',
      name: 'Chain Lightning',
      text: 'Deal X damage split across the 3 largest enemy stacks.',
      // DN10 balance pass: 62/level deleted whole boards by round 12 and held
      // Gorrath at 2.7 average placement across every archetype.
      base: 12,
      perLevel: 24,
      atStart: true,
      everyN: 3,
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
      // DN10 balance pass: at 0.05/level the spell never grew at all and Zhala
      // sat dead last at 6.7 average placement. Fury is her whole kit — it has
      // to become several extra actions a battle by the late campaign.
      base: 4,
      perLevel: 0.28,
      atStart: false,
      everyN: 3,
    },
    signatureBoons: ['b_nine_winds', 'b_ancestor_echo'],
  },
]

export const HERO_BY_ID = new Map(HEROES.map((h) => [h.id, h]))

export function heroesOfFaction(f: string): HeroDef[] {
  return HEROES.filter((h) => h.faction === f)
}
