import type { FactionDef, UnitDef } from '../types'

export const VANGUARD: FactionDef = {
  id: 'vanguard',
  name: 'The Iron Vanguard',
  mechanic: 'Bulwark',
  mechanicText:
    'Armor that soaks damage from each incoming attack, then wears down by 1. Every stack that walks off the field keeps +2 ATK / +3 HP for the rest of the run.',
  blurb: 'Shield walls, cannons and oaths. Wins long battles by refusing to die.',
  unlockRenown: 0,
  /* `ink` is currently referenced nowhere outside these files — PLAN §4 asked
     whether it drives text or borders over art, and the answer is that it
     drives nothing. Left as-is rather than retuned to --stroke-ink, so a future
     use starts from a deliberate choice instead of a value that was changed
     blind. */
  colors: { primary: '#6f9ed0', secondary: '#f0c96b', accent: '#a9c9ea', ink: '#0d1622' },
  shape: '10px',
  nameBank: ['Halvard', 'Dagna', 'Roderic', 'Ingrith', 'Tormund', 'Mabel', 'Osric', 'Brynja', 'Aldric', 'Sigrun'],
  titleBank: ['Stonewarden', 'Hammerfast', 'of the Long Wall', 'Ironvow', 'Shieldborn', 'the Oathkeeper'],
}

export const VANGUARD_UNITS: UnitDef[] = [
  {
    id: 'vg_militia',
    name: 'Militia',
    pool: 'vanguard',
    tier: 1,
    atk: 1,
    hp: 2,
    init: 4,
    musterSize: 4,
    row: 'front',
    keywords: [],
    linePaths: ['vg_footman'],
    rank: {
      veteran: { hp: 1 },
      honoredName: 'Shield Wall',
      honoredText: 'The whole company locks shields: the stack gains Bulwark 1, on top of any it already carries.',
      honored: { type: 'keyword', k: 'bulwark', x: 1 },
    },
    sigil: 'shield',
    tags: ['wall', 'line'],
  },
  {
    id: 'vg_crossbow',
    name: 'Crossbow Levy',
    pool: 'vanguard',
    tier: 1,
    atk: 1,
    hp: 1,
    init: 5,
    musterSize: 3,
    row: 'back',
    keywords: [{ k: 'volley' }],
    linePaths: ['vg_arbalest'],
    rank: {
      veteran: { atk: 1 },
      honoredName: 'Piercing Volley',
      honoredText: 'Every volley punches through into a second random enemy stack for half its damage.',
      honored: { type: 'volleySplash', frac: 0.5 },
    },
    sigil: 'bow',
    tags: ['ranged', 'line'],
  },
  {
    id: 'vg_mule',
    name: 'Mule Cart',
    pool: 'vanguard',
    tier: 1,
    atk: 0,
    hp: 4,
    init: 1,
    musterSize: 1,
    row: 'back',
    keywords: [],
    ability: { trigger: 'battleStart', effect: { type: 'goldNextMuster', x: 1 }, text: '+1 gold next Muster' },
    rank: {
      veteran: { hp: 1 },
      honoredName: 'Outrider Escort',
      honoredText: 'Escorts ride the column: the neighbouring stack gains Guard 1 for the whole battle.',
      honored: { type: 'keyword', k: 'guard', x: 1 },
    },
    sigil: 'cart',
    tags: ['economy'],
  },
  {
    id: 'vg_footman',
    name: 'Footman',
    pool: 'vanguard',
    tier: 2,
    atk: 2,
    hp: 4,
    init: 4,
    musterSize: 3,
    row: 'front',
    keywords: [{ k: 'bulwark', x: 1 }],
    // DN11 §2.3: the oldest line in the game learns to fork. The Champion
    // cleaves; the Bannerguard holds the stack beside it up.
    linePaths: ['vg_champion', 'vg_bannerguard'],
    sigil: 'hammer',
    tags: ['wall', 'bulwark'],
  },
  {
    // The defensive twin to the Champion (DN11 §2.3). Guard is already "adjacent
    // stacks +1 Bulwark" in the engine, so the identity is data, not new code.
    id: 'vg_bannerguard',
    name: 'Bannerguard Sentinel',
    pool: 'vanguard',
    tier: 4,
    atk: 3,
    hp: 8,
    init: 4,
    musterSize: 1,
    row: 'front',
    keywords: [{ k: 'guard', x: 1 }, { k: 'bulwark', x: 1 }],
    sigil: 'wall',
    tags: ['elite', 'wall', 'bulwark'],
  },
  {
    id: 'vg_arbalest',
    name: 'Arbalest',
    pool: 'vanguard',
    tier: 2,
    atk: 3,
    hp: 2,
    init: 5,
    musterSize: 2,
    row: 'back',
    keywords: [{ k: 'volley' }],
    linePaths: ['vg_ballistier'],
    sigil: 'bow',
    tags: ['ranged'],
  },
  {
    // Top of the crossbow line (Design Notes 03 §5.2). Ranks come from the
    // line root, vg_crossbow — a block here would never be read.
    id: 'vg_ballistier',
    name: 'Sunlance Ballistier',
    pool: 'vanguard',
    tier: 4,
    atk: 5,
    hp: 4,
    init: 5,
    musterSize: 1,
    row: 'back',
    keywords: [{ k: 'volley' }],
    apex: {
      id: 'sunlance',
      name: 'Sunlance',
      text: 'A piercing bolt through the front-row target and the stack behind it.',
      charge: 5,
      x: 1,
    },
    sigil: 'bow',
    tags: ['ranged', 'elite'],
  },
  // ── The Shieldmaiden line (DN12 §3.4) ────────────────────────────────────
  //
  // A girl who picked up a shield too big for her, and what she becomes by
  // refusing to put it down. DN10 sold the Shieldmaiden as a standalone T2;
  // she is now the middle rung, so the line gets a root the camp can sell and
  // the T2 becomes something you make.
  {
    id: 'vg_shieldgirl',
    name: 'Shield Girl',
    pool: 'vanguard',
    tier: 1,
    atk: 1,
    hp: 3,
    init: 3,
    musterSize: 3,
    row: 'front',
    // The line's whole identity in miniature: a little armour, and one chance
    // to step in front of the stack behind her.
    keywords: [{ k: 'bulwark', x: 1 }, { k: 'cover', x: 1 }],
    linePaths: ['vg_shieldmaiden'],
    // Sister-Shield moves here from vg_shieldmaiden, which is no longer this
    // line's root — a rank block anywhere but the root is never read
    // (`rankDefOf` resolves through `lineRootOf`). The reward is unchanged; the
    // copy is reworded because it now has to read true on the root form too,
    // and a Shield Girl carries no Guard of her own to double.
    rank: {
      veteran: { hp: 1 },
      honoredName: 'Sister-Shield',
      honoredText: 'The sisters lock tighter: the neighbouring stack gains another point of Bulwark all battle.',
      honored: { type: 'keyword', k: 'guard', x: 1 },
    },
    sigil: 'shield',
    tags: ['wall', 'bulwark', 'line'],
  },
  {
    // T2 since DN10: with promoted forms out of the camp, every tier of the
    // camp has to sell something of the faction's own. The wall comes early.
    //
    // DN12 §3.4 hangs her off vg_shieldgirl, so the camp stops selling her and
    // the Path sheet is the only door. The id stays whatever she is called —
    // renaming it would churn art.ts, save data and the sim harness for
    // nothing. Her fork into the two Aegis forms lands with those units.
    id: 'vg_shieldmaiden',
    name: 'Shieldmaiden',
    pool: 'vanguard',
    tier: 2,
    atk: 2,
    hp: 5,
    init: 3,
    musterSize: 2,
    row: 'front',
    keywords: [{ k: 'bulwark', x: 2 }, { k: 'guard', x: 1 }, { k: 'cover', x: 2 }],
    sigil: 'shield',
    tags: ['wall', 'bulwark'],
  },
  {
    id: 'vg_cleric',
    name: 'Battle Cleric',
    pool: 'vanguard',
    tier: 3,
    atk: 2,
    hp: 3,
    init: 6,
    musterSize: 2,
    row: 'back',
    keywords: [],
    ability: {
      trigger: 'everyExchange',
      everyN: 2,
      effect: { type: 'healLowest', x: 2 },
      text: 'Every 2nd action: heal the most-wounded ally for 2 per unit in this stack',
    },
    rank: {
      veteran: { hp: 1 },
      honoredName: 'Twin Litany',
      honoredText: 'The litany is sung in two voices: the healing prayer resolves twice every time it triggers.',
      honored: { type: 'abilityEcho' },
    },
    sigil: 'cross',
    tags: ['support'],
  },
  {
    id: 'vg_champion',
    name: 'Sunforged Champion',
    pool: 'vanguard',
    tier: 4,
    atk: 4,
    hp: 5,
    init: 5,
    musterSize: 1,
    row: 'front',
    keywords: [{ k: 'bulwark', x: 2 }, { k: 'cleave' }],
    apex: {
      id: 'sunburstVerdict',
      name: 'Sunburst Verdict',
      text: 'A colossal strike that ignores Bulwark, and your front line gains +1 Bulwark.',
      charge: 5,
      x: 2,
    },
    sigil: 'hammer',
    tags: ['elite', 'bulwark'],
  },
  {
    id: 'vg_cannon',
    name: 'Cannon Crew',
    pool: 'vanguard',
    tier: 4,
    atk: 6,
    hp: 3,
    init: 2,
    musterSize: 1,
    row: 'back',
    keywords: [{ k: 'volley' }, { k: 'siege' }],
    rank: {
      veteran: { atk: 1 },
      honoredName: 'Overcharge',
      honoredText: 'The opening shot of each battle is packed to bursting and deals double damage.',
      honored: { type: 'firstShotDouble' },
    },
    sigil: 'cannon',
    tags: ['ranged', 'elite'],
  },
  // ── The Colossus line (DN12 §3.5) ────────────────────────────────────────
  //
  // Three rungs of the same stone. The Colossus shipped in DN10 as a T5 the
  // camp sold outright, which made the largest thing in the game a purchase
  // rather than an ascent; it now has two forms beneath it and is reached the
  // way every other capstone is.
  {
    id: 'vg_cairn',
    name: 'Cairn Whelp',
    pool: 'vanguard',
    tier: 1,
    atk: 1,
    hp: 4,
    init: 2,
    musterSize: 3,
    row: 'front',
    // Slow and stony from the first rung: the line trades Initiative for a
    // health pool nothing its tier can chew through.
    keywords: [{ k: 'bulwark', x: 1 }],
    linePaths: ['vg_bulwark'],
    // Avalanche Step moves here from vg_colossus for the same reason
    // Sister-Shield moved to vg_shieldgirl: the Colossus is no longer the root
    // of its line, and a rank block off the root is dead data. Unchanged
    // otherwise — the copy already reads true on any form of the line.
    rank: {
      veteran: { hp: 1 },
      honoredName: 'Avalanche Step',
      honoredText: 'Damage left over after crushing a stack rolls on into the stack beside it (Cleave).',
      honored: { type: 'keyword', k: 'cleave' },
    },
    sigil: 'colossus',
    tags: ['wall', 'bulwark', 'line'],
  },
  {
    // DN12 §3.5's deflect — "the first attack against it each battle is negated
    // outright" — is a primitive the engine does not have yet, and it lands in
    // its own commit. This form ships with its body only, the way the DN11
    // riders did: the stats are the whole unit until the keyword exists.
    id: 'vg_bulwark',
    name: 'The Bulwark',
    pool: 'vanguard',
    tier: 3,
    atk: 3,
    hp: 7,
    init: 2,
    musterSize: 2,
    row: 'front',
    keywords: [{ k: 'bulwark', x: 2 }, { k: 'cover', x: 1 }],
    linePaths: ['vg_colossus'],
    sigil: 'colossus',
    tags: ['wall', 'bulwark'],
  },
  {
    // DN12 §3.5 renames it Quarry Titan and gives it Taunt, both in later
    // commits. Here it only stops being a root: the id is untouched, and so is
    // everything it does on a board.
    id: 'vg_colossus',
    name: 'Mountain Colossus',
    pool: 'vanguard',
    tier: 5,
    atk: 8,
    hp: 14,
    init: 3,
    musterSize: 1,
    row: 'front',
    keywords: [{ k: 'bulwark', x: 4 }, { k: 'guard', x: 1 }, { k: 'cover', x: 2 }],
    ability: {
      trigger: 'battleStart',
      effect: { type: 'alliesBulwark', x: 1 },
      text: 'Battle start: +1 Bulwark to all allies',
    },
    sigil: 'colossus',
    tags: ['elite', 'bulwark', 'capstone'],
  },

  // ── The Forgeline (DN11 §2.2) ────────────────────────────────────────────
  //
  // An anvil-boy with a bucket of rivets, and the two things he can grow into:
  // the smith who armours the army from the back, or the smith who becomes the
  // armour. Both ends are Bulwark; they disagree about who wears it.
  {
    id: 'vg_apprentice',
    name: 'Forge Apprentice',
    pool: 'vanguard',
    tier: 1,
    atk: 1,
    hp: 3,
    init: 3,
    musterSize: 3,
    row: 'back',
    keywords: [],
    ability: {
      trigger: 'battleStart',
      effect: { type: 'allyBulwark', x: 1, pick: 'randomFront' },
      text: 'Battle start: +1 Bulwark to a random front-line ally',
    },
    linePaths: ['vg_runesmith', 'vg_warsmith'],
    rank: {
      veteran: { hp: 1 },
      honoredName: 'Riveted',
      honoredText: 'The company works in step: the forge blessing is struck twice each battle.',
      honored: { type: 'abilityEcho' },
    },
    sigil: 'hammer',
    tags: ['support', 'bulwark', 'line'],
  },
  {
    // Balance (interim): her grant was +2 to the WHOLE board, which made a T2
    // out-grant both T5 capstones in the game — Ancient of the First Seed and
    // the Ironbound Colossus each give +1 — and it stacked additively with the
    // Apprentice's and the Runelord's, so one line could put +5 Bulwark on
    // everything. Measured +21.5% win-delta on the Runelord at n=308.
    //
    // The root cause is an over-approximation, not the sketch: DN11 §2.2 gives
    // the Apprentice and the Runesmith SINGLE-target grants ("a random friendly
    // front stack", "the lowest-Bulwark stack") and only the Runelord "all
    // friendly". The engine has no single-ally Bulwark effect yet, so both were
    // mapped to the board-wide one. Until that effect kind lands with the other
    // riders, the magnitude carries the correction.
    id: 'vg_runesmith',
    name: 'Runesmith',
    pool: 'vanguard',
    tier: 2,
    atk: 1,
    hp: 5,
    init: 3,
    musterSize: 3,
    row: 'back',
    keywords: [],
    ability: {
      trigger: 'battleStart',
      effect: { type: 'allyBulwark', x: 2, pick: 'lowestBulwark' },
      text: 'Battle start: +2 Bulwark to the ally with the least',
    },
    linePaths: ['vg_runelord'],
    sigil: 'hammer',
    tags: ['support', 'bulwark'],
  },
  {
    id: 'vg_runelord',
    name: 'Runelord of the Deep Halls',
    pool: 'vanguard',
    tier: 4,
    atk: 3,
    hp: 8,
    init: 3,
    musterSize: 1,
    row: 'back',
    keywords: [{ k: 'guard', x: 1 }],
    // Balance (interim), second cut: halving the Runesmith's grant only took
    // the Runelord from +21.5% to +19.2%, because the Runelord's OWN grant was
    // the rest of it — a T4 handing the whole board +2 when both T5 capstones
    // in the game hand it +1. All three Forgeline grants now read +1.
    //
    // That flattens the line's progression, and it is meant to be temporary:
    // DN11 §2.2 only ever made the Runelord's grant board-wide. When the
    // single-ally Bulwark effect lands with the other riders, the Apprentice
    // and Runesmith go back to one target and the Runelord takes +2 again —
    // progression restored, stacking gone.
    ability: {
      trigger: 'battleStart',
      effect: { type: 'alliesBulwark', x: 2 },
      text: 'Battle start: +2 Bulwark to all allies',
    },
    sigil: 'wall',
    tags: ['elite', 'support', 'bulwark'],
  },
  {
    // A man who forges himself into the wall. DN11 wants the Bulwark gained
    // "whenever any friendly Bulwark absorbs"; the engine's existing casualty
    // trigger is the closest honest hook — he thickens when his own line bleeds.
    id: 'vg_warsmith',
    name: 'Warsmith',
    pool: 'vanguard',
    tier: 2,
    atk: 3,
    hp: 5,
    init: 4,
    musterSize: 3,
    row: 'front',
    keywords: [{ k: 'bulwark', x: 1 }],
    ability: {
      trigger: 'onCasualty',
      effect: { type: 'selfBulwark', x: 1 },
      text: 'When this stack takes casualties: +1 Bulwark',
    },
    linePaths: ['vg_anvilborn'],
    sigil: 'hammer',
    tags: ['wall', 'bulwark'],
  },
  {
    id: 'vg_anvilborn',
    name: 'Anvilborn Juggernaut',
    pool: 'vanguard',
    tier: 4,
    atk: 5,
    hp: 10,
    init: 4,
    musterSize: 1,
    row: 'front',
    keywords: [{ k: 'bulwark', x: 3 }, { k: 'cleave' }],
    sigil: 'colossus',
    tags: ['elite', 'wall', 'bulwark'],
  },
]
