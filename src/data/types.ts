/** Shared content types. All content is DATA — adding a faction means adding files here. */

export type FactionId = 'vanguard' | 'verdant' | 'stormtide' | 'gravebound' | 'conclave' | 'emberhorde'
export type PoolId = FactionId | 'merc'
export type Row = 'front' | 'back'
export type RowPref = Row | 'any'

export type KeywordId =
  | 'bulwark'
  | 'charge'
  | 'volley'
  | 'siege'
  | 'guard'
  | 'cleave'
  | 'venom'
  | 'lifesteal'
  | 'deathcry'
  | 'growth'
  | 'frenzy'
  | 'summon'
  | 'cover'

export interface Keyword {
  k: KeywordId
  /** magnitude, where the keyword takes one (Bulwark 2, Venom 1, Growth 1 …) */
  x?: number
  /** unit id to summon, for `summon` */
  unit?: string
}

export type AbilityTrigger = 'battleStart' | 'onCasualty' | 'onDeath' | 'everyExchange' | 'onAttack'

export type AbilityEffect =
  | { type: 'alliesBulwark'; x: number }
  | { type: 'alliesAtk'; x: number }
  | { type: 'healLowest'; x: number }
  | { type: 'selfAtk'; x: number }
  | { type: 'selfBulwark'; x: number }
  | { type: 'damageRandom'; x: number }
  | { type: 'summon'; unit: string; count: number }
  | { type: 'goldNextMuster'; x: number }
  | { type: 'extraAttackAlly' }

export interface Ability {
  trigger: AbilityTrigger
  effect: AbilityEffect
  /** for everyExchange abilities: fire every N of this stack's own actions */
  everyN?: number
  text: string
}

/**
 * Banner Ranks (Design Notes 01 §3). A stack that grows past a threshold
 * upgrades permanently. Rewards are a small CLOSED set the engine handles
 * centrally — same pipeline as keywords, so no reward needs bespoke UI code.
 */
export type RankReward =
  /** grant a keyword (adds to any the unit already carries) at battle start */
  | { type: 'keyword'; k: KeywordId; x?: number }
  /** volleys carry into a second random enemy stack for floor(frac × damage) */
  | { type: 'volleySplash'; frac: number }
  /** the stack's first attack each battle deals double raw damage */
  | { type: 'firstShotDouble' }
  /** the unit's triggered ability fires twice each time it triggers */
  | { type: 'abilityEcho' }
  /** Growth ticks grant +x extra (Verdant) — resolved at Muster, not in battle */
  | { type: 'growthPlus'; x: number }
  /** Frenzy triggers grant +x extra ATK (Stormtide) */
  | { type: 'frenzyPlus'; x: number }
  /** flat extra per-unit stats — the generic fallback */
  | { type: 'statPerUnit'; atk?: number; hp?: number }

export interface RankDef {
  /** override the musterSize defaults ([12,24] / [8,16] / [4,8]) */
  thresholds?: [number, number]
  /** Rank 1: a small per-unit stat bonus */
  veteran: { atk?: number; hp?: number }
  /** Rank 2: the named milestone skill */
  honoredName: string
  honoredText: string
  honored: RankReward
}

export type SigilId =
  | 'shield'
  | 'hammer'
  | 'bow'
  | 'cart'
  | 'cross'
  | 'cannon'
  | 'colossus'
  | 'leaf'
  | 'tree'
  | 'moon'
  | 'thorn'
  | 'stag'
  | 'fang'
  | 'lightning'
  | 'wolf'
  | 'drum'
  | 'totem'
  | 'dagger'
  | 'coin'
  | 'wall'
  | 'dragon'
  | 'skull'

/**
 * What a Volley stack throws (Design Notes 03 §4). Purely cosmetic — one CSS
 * class on the arc — but it is what makes a barrage read as *whose* barrage.
 * Left unset, a unit takes its faction's default.
 */
export type Projectile = 'bolt' | 'arrow' | 'spark' | 'harpoon'

/**
 * How a caster's magic looks (Design Notes 04 §10). Archers got projectiles in
 * DN02/03; casters got nothing, and the Battle Cleric's per-exchange heal was
 * the most invisible power in the game. Defaults by faction, overridable per
 * unit or hero.
 */
export type CastFx = 'holy' | 'nature' | 'storm' | 'arcane' | 'blood'

/**
 * Apex abilities (Design Notes 04 §3) — the reward for finishing a promotion
 * line, and only that: the six line-top forms, no T5s, no mercenaries. The
 * meter charges in battle and the ultimate fires in place of an attack.
 */
export type ApexId = 'sunburstVerdict' | 'sunlance' | 'rootquake' | 'moonfall' | 'bloodcall' | 'ninthWave'

export interface ApexDef {
  id: ApexId
  name: string
  text: string
  /** charges needed before it fires; the meter has this many segments */
  charge: number
  /** the ultimate's magnitude knob — what it means is per-ability */
  x: number
}

export interface UnitDef {
  id: string
  name: string
  pool: PoolId
  tier: number
  atk: number
  hp: number
  init: number
  musterSize: number
  row: RowPref
  keywords: Keyword[]
  ability?: Ability
  /**
   * What this form can promote into (DN11 §2). One entry is a straight line and
   * behaves exactly as the old `lineNext` did; two open the Path choice sheet,
   * and the stack becomes whichever the player picked — permanently, for that
   * stack. The promotion graph is a TREE: every form has at most one parent, so
   * no two paths may name the same target and no path may loop back. Both are
   * enforced at load in `engine/lines.ts` rather than trusted.
   */
  linePaths?: string[]
  /** Banner Rank rewards, defined on the LINE ROOT only — every later form
   *  inherits them, so a promoted Footman still fights as Militia veterans. */
  rank?: RankDef
  sigil: SigilId
  /** overrides the faction's default volley flavour (DN03 §4) */
  projectile?: Projectile
  /** line-top forms only: the ultimate this form charges toward (DN04 §3) */
  apex?: ApexDef
  /** overrides the faction's default spell flavour (DN04 §10) */
  castFx?: CastFx
  /** synergy tags used by rival scoring and by the player's own sorting */
  tags?: string[]
}

export type SpellEffectId =
  | 'shieldLowest'
  | 'rallyAtk'
  | 'healMostWounded'
  | 'root'
  | 'chainLightning'
  | 'extraAttack'

export interface HeroSpell {
  id: SpellEffectId
  name: string
  text: string
  /** base magnitude; scales with hero level and Magic boons */
  base: number
  perLevel: number
  /** cast at battle start? */
  atStart: boolean
  /** and again every N exchanges (0 = never) */
  everyN: number
}

export type PassiveId =
  | 'frontBulwark3'
  | 'lastStand'
  | 'growthPlusHp'
  | 'survivorGrowsCount'
  | 'frenzyPermanentAtk'
  | 'extraCast'

export interface HeroDef {
  id: string
  name: string
  faction: FactionId
  title: string
  passive: { id: PassiveId; text: string; x?: number }
  spell: HeroSpell
  /** boon ids seeded into the offer pools for this hero */
  signatureBoons: string[]
  unlockRenown: number
  sigil: SigilId
  /** overrides the faction's default spell flavour (DN04 §10) */
  castFx?: CastFx
}

export interface FactionDef {
  id: FactionId
  name: string
  mechanic: string
  mechanicText: string
  blurb: string
  unlockRenown: number
  colors: { primary: string; secondary: string; accent: string; ink: string }
  shape: string
  nameBank: string[]
  titleBank: string[]
}

export type BoonBranch = 'might' | 'magic' | 'command'

/** Boons are pure modifier bundles — see HeroMods. */
export interface BoonDef {
  id: string
  name: string
  text: string
  branch: BoonBranch
  /** minimum round this boon can be offered (capstones gate to 10+) */
  minRound: number
  mods: Partial<HeroMods>
  /** if set, only offered to this hero */
  heroId?: string
  /** if set, only offered to this faction */
  factionId?: FactionId
  capstone?: boolean
}

/**
 * Every boon in the game resolves to deltas on this record. The engine reads
 * only this — no boon has bespoke code, which is what keeps the pools tunable.
 */
export interface HeroMods {
  // Might — army
  allAtk: number
  allHp: number
  frontAtk: number
  backAtk: number
  frontBulwark: number
  t12CountBonus: number
  t45CountBonus: number
  frenzyAtk: number
  growthBonus: number
  volleyAtk: number
  chargeAll: boolean
  lifestealAll: boolean
  cleaveFront: boolean
  /** Overwatch: every front-row stack gains this many Cover charges */
  frontCover: number
  retaliationAtk: number
  firstStrikeBulwark: number
  // Magic — spell
  spellPower: number
  spellExtraCasts: number
  spellCadenceReduction: number
  spellPowerPerLevel: number
  spellSplash: number
  // Command — economy
  income: number
  rerollDiscount: number
  freeRerollsPerRound: number
  tierUpDiscount: number
  promoteDiscount: number
  extraOfferSlots: number
  sellBonus: number
  /** applied immediately when the boon is taken, then never read again */
  campTierUp: number
}

export const ZERO_MODS: HeroMods = {
  allAtk: 0,
  allHp: 0,
  frontAtk: 0,
  backAtk: 0,
  frontBulwark: 0,
  t12CountBonus: 0,
  t45CountBonus: 0,
  frenzyAtk: 0,
  growthBonus: 0,
  volleyAtk: 0,
  chargeAll: false,
  lifestealAll: false,
  cleaveFront: false,
  frontCover: 0,
  retaliationAtk: 0,
  firstStrikeBulwark: 0,
  spellPower: 0,
  spellExtraCasts: 0,
  spellCadenceReduction: 0,
  spellPowerPerLevel: 0,
  spellSplash: 0,
  income: 0,
  rerollDiscount: 0,
  freeRerollsPerRound: 0,
  tierUpDiscount: 0,
  promoteDiscount: 0,
  extraOfferSlots: 0,
  sellBonus: 0,
  campTierUp: 0,
}

export function addMods(base: HeroMods, delta: Partial<HeroMods>): HeroMods {
  const out: HeroMods = { ...base }
  for (const k of Object.keys(delta) as (keyof HeroMods)[]) {
    const v = delta[k]
    if (typeof v === 'boolean') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(out as any)[k] = (out[k] as boolean) || v
    } else if (typeof v === 'number') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(out as any)[k] = (out[k] as number) + v
    }
  }
  return out
}
