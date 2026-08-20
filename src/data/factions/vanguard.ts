import type { FactionDef, UnitDef } from '../types'

export const VANGUARD: FactionDef = {
  id: 'vanguard',
  name: 'The Iron Vanguard',
  mechanic: 'Bulwark',
  mechanicText:
    'Armor that soaks damage from each incoming attack, then wears down by 1. Every stack that walks off the field keeps +1 ATK / +2 HP for the rest of the run.',
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
    hp: 2,
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
    //
    // DN12 §3.2 makes it a Paladin, which is two behaviours: a periodic heal on
    // the Guard chassis, and one Raise. The heal reuses the Battle Cleric's
    // exact shape — `everyExchange` + `healLowest` — because the maths is
    // already understood, and it is pitched deliberately UNDER the Cleric's:
    // every 3rd action rather than every 2nd, on a stack that musters 1 rather
    // than 2. The Bannerguard is getting a second gift in the same commit, and
    // it already reads +4.1% before either of them.
    id: 'vg_bannerguard',
    name: 'Bannerguard Sentinel',
    pool: 'vanguard',
    tier: 4,
    atk: 3,
    hp: 7,
    init: 4,
    musterSize: 1,
    row: 'front',
    keywords: [{ k: 'guard', x: 1 }, { k: 'bulwark', x: 1 }, { k: 'raise', x: 1 }],
    ability: {
      trigger: 'everyExchange',
      everyN: 4,
      effect: { type: 'healLowest', x: 2 },
      text: 'Every 4th action: heal the most-wounded ally for 2 per unit in this stack',
    },
    sigil: 'wall',
    tags: ['elite', 'wall', 'bulwark', 'support'],
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
    // DN12 §3.3: the crossbow line learns to fork, like the Footman before it.
    // One enormous bolt, or two pistols fired together.
    linePaths: ['vg_ballistier', 'vg_marksman'],
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
    atk: 4,
    hp: 3,
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
  {
    /**
     * The Duellist twin (DN12 §3.3). The id stays `vg_marksman` and the name
     * is "Sunshot Duellist" — §6 is explicit that the string may change and
     * the id may not, because the approved art gave him duelling pistols
     * rather than a sunlance and "Marksman" stopped fitting the picture.
     *
     * The fork's lever, in §3.3's own words: "the Ballistier's single hit
     * overkills small stacks, the Duellist never wastes a point but never
     * one-shots a T5 either." So he is built UNDER the Ballistier per shot and
     * over it in total — ATK 3 to its 5, fired twice. Three per unit keeps a
     * typical stack's barrel below a T5's pool, which is the half of that
     * sentence that had to be a number rather than a feeling.
     *
     * No Apex: DN04 §3 keeps meters to the six named line tops, and
     * tests/apex.test.ts checks that exhaustively.
     */
    id: 'vg_marksman',
    name: 'Sunshot Duellist',
    pool: 'vanguard',
    tier: 4,
    atk: 3,
    hp: 3,
    init: 5,
    musterSize: 1,
    row: 'back',
    keywords: [{ k: 'volley' }],
    ability: {
      trigger: 'onAttack',
      effect: { type: 'strikeSecondTarget', frac: 0.55 },
      text: 'Both pistols: a second enemy stack takes just over half the same shot',
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
    // DN12 §7.1. The id is deliberately NOT renamed with her: it is written
    // into art.ts, into save data and into the sim harness, and none of that
    // is worth churning for a string.
    name: 'Shield Bearer',
    pool: 'vanguard',
    tier: 2,
    atk: 2,
    hp: 5,
    init: 3,
    musterSize: 2,
    row: 'front',
    keywords: [{ k: 'bulwark', x: 2 }, { k: 'guard', x: 1 }, { k: 'cover', x: 2 }],
    // DN12 §3.4: the fork at the top of the line. Two women with the same
    // shield who disagree about what a shield is for — one holds it up, one
    // throws it.
    linePaths: ['vg_aegis', 'vg_aegiswarden'],
    sigil: 'shield',
    tags: ['wall', 'bulwark'],
  },
  {
    // Aegis of Light (DN12 §3.4). The defensive end of the fork: she gathers
    // light across the fight and, at full charge, hands the next blow straight
    // back. Reflect 3 means roughly every fourth attack on her is returned —
    // slow enough that the meter is worth watching, fast enough to see twice
    // in a battle.
    //
    // Pointedly NOT a Deflect (§4.6): that eats a blow and the attacker walks
    // away. This one is a mirror.
    id: 'vg_aegis',
    name: 'Aegis of Light',
    pool: 'vanguard',
    tier: 4,
    atk: 3,
    hp: 7,
    init: 3,
    musterSize: 1,
    row: 'front',
    keywords: [{ k: 'bulwark', x: 3 }, { k: 'cover', x: 2 }, { k: 'reflect', x: 3 }],
    sigil: 'shield',
    castFx: 'holy',
    tags: ['elite', 'wall', 'bulwark'],
  },
  {
    // Aegis Warden (DN12 §3.4). The offensive end: she throws the shield and it
    // ricochets twice through the enemy line, ×0.75 a hop (§6).
    //
    // The note is explicit that "total damage across a full board is enormous,
    // so the decay and the base number are the whole balance job" — and the
    // decay is fixed by §6, so ATK is the only lever left. Deliberately started
    // at 4 rather than a Champion's 5: across a full seven-stack board the arc
    // sums to roughly 3.6x one swing, so a point of ATK here is worth nearly
    // four anywhere else.
    id: 'vg_aegiswarden',
    name: 'Aegis Warden',
    pool: 'vanguard',
    tier: 4,
    atk: 2,
    hp: 8,
    init: 4,
    musterSize: 1,
    row: 'front',
    keywords: [{ k: 'bulwark', x: 2 }],
    ability: {
      trigger: 'onAttack',
      effect: { type: 'bounceAttack', frac: 0.6, passes: 2 },
      text: 'The thrown shield ricochets twice through the enemy line, each hop three fifths of the last',
    },
    sigil: 'shield',
    tags: ['elite', 'bulwark'],
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
    // Bloodlust (DN12 §3.1/§4.1), and the stat cut §3.1 asks for in the same
    // commit: 4/5 → 3/5. The Champion is the highest win-delta in the game and
    // TODO.md has it flagged, so the note is explicit that the buff does not
    // ship alone.
    //
    // What the counter is actually worth is smaller than §3.1 assumes. The
    // engine has retaliated at FULL ATK, for every stack, once a cycle, since
    // long before DN12 — so half ATK is not "a straight buff", it is a second
    // answer on top of an existing one. Where it earns its keep is the two
    // cases the universal retaliation skips: Volley attackers, who currently
    // pay nothing for shooting into melee, and extra attacks. That is the
    // Champion's identity here — the archers stop being safe.
    id: 'vg_champion',
    name: 'Sunforged Champion',
    pool: 'vanguard',
    tier: 4,
    atk: 3,
    hp: 5,
    init: 5,
    musterSize: 1,
    row: 'front',
    keywords: [{ k: 'bulwark', x: 2 }, { k: 'cleave' }],
    ability: {
      trigger: 'onAttacked',
      effect: { type: 'counterAttack', frac: 0.5 },
      text: 'Bloodlust: when this stack is attacked and lives, it strikes back for half its power',
    },
    apex: {
      id: 'sunburstVerdict',
      name: 'Sunburst Verdict',
      text: 'A colossal strike that ignores Bulwark, and your front line gains +1 Bulwark.',
      charge: 5,
      x: 1,
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
    atk: 2,
    hp: 6,
    init: 3,
    musterSize: 4,
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
    // The unit the Deflect keyword was written for (DN12 §3.5/§4.6). It carries
    // both halves of the distinction at once — Bulwark 2 shaving every blow all
    // battle, and one Deflect that cancels a single blow whole — which is
    // exactly why the Glossary sets the two side by side. Naming the unit "The
    // Bulwark" while its signature trick is the OTHER thing is the trap; the
    // copy does the work, since the name is fixed by the note.
    id: 'vg_bulwark',
    name: 'The Bulwark',
    pool: 'vanguard',
    tier: 3,
    atk: 3,
    hp: 7,
    init: 2,
    musterSize: 2,
    row: 'front',
    keywords: [{ k: 'bulwark', x: 2 }, { k: 'deflect', x: 1 }, { k: 'cover', x: 1 }],
    linePaths: ['vg_colossus'],
    sigil: 'colossus',
    tags: ['wall', 'bulwark'],
  },
  {
    // DN12 §3.5/§4.5: Taunt. Every enemy attack must come to it while it
    // stands, which the note calls the most disruptive thing in the pass.
    //
    // Note the anti-synergy it creates on its own card, which is real and
    // deliberate rather than an oversight: its Guard 1 buffs a neighbour who
    // will never be attacked while the Taunt holds, and its Cover 2 can
    // intercept nothing because nothing is ever aimed past it. Both come back
    // the moment it falls, which is exactly when the line needs them.
    //
    id: 'vg_colossus',
    // Renamed with the Shield Bearer, and for the same reason the id stays put.
    name: 'Quarry Titan',
    pool: 'vanguard',
    tier: 5,
    atk: 8,
    hp: 14,
    init: 3,
    musterSize: 1,
    row: 'front',
    keywords: [{ k: 'bulwark', x: 4 }, { k: 'guard', x: 1 }, { k: 'cover', x: 2 }, { k: 'taunt' }],
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
    hp: 7,
    init: 3,
    musterSize: 1,
    row: 'back',
    // DN12 §3.6. The whole front rank intercepts while he lives, so the back
    // row cannot be reached at all.
    //
    // §6 decides this REPLACES the battle-start +2 Bulwark to all allies
    // rather than stacking with it, and §3.6 has him "grant the front row
    // Guard rather than carrying Guard himself" — so his own Guard 1 comes off
    // too. Both the ability and the keyword are gone; the wall is what he is
    // now. That is meant to be roughly cost-neutral on a unit TODO.md has
    // flagged at the top of the game, not a quiet buff.
    //
    // The two interim balance comments this replaces are discharged with it:
    // the Apprentice and the Runesmith keep their single-target grants, and
    // the board-wide one the Runelord used to add on top no longer exists, so
    // nothing in the line stacks Bulwark on everything any more.
    keywords: [{ k: 'intercept' }],
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
    atk: 2,
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
    // DN12 §3.6: a hammer in each hand, over the line and into the back row.
    //
    // The note says to reuse `strikeEnemyBackRow` from DN11 — it does not
    // exist, and never did, so it is written here. It rides on `onAttack`, so
    // his ordinary blow still lands on the front rank and the leap comes on
    // top: a second targeting override would have had to fight both Taunt and
    // his own line's rune-wall, and the reach is not worth that.
    //
    // The leap is deliberately not stopped by the Runelord's wall. One end of
    // this fork makes the back row unreachable and the other goes over it,
    // which is the two branches arguing rather than an oversight.
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
    ability: {
      trigger: 'onAttack',
      effect: { type: 'strikeEnemyBackRow', frac: 0.3 },
      text: 'Leaps the line: every enemy back-row stack takes a third of this stack’s power',
    },
    sigil: 'colossus',
    tags: ['elite', 'wall', 'bulwark'],
  },
]
