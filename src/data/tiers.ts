/**
 * War Tiers (Design Notes 09) — the opt-in climb.
 *
 * Ten authored, cumulative rules. A run at Tier N carries **exactly rules 2..N**
 * — Tier 1 carries none and is the game as shipped, byte-identical, which is
 * what `tests/tiers.test.ts` proves rather than asserts.
 *
 * Everything here is data. A rule is a name, a line of player-facing text, and
 * a set of knobs; `modsForTier` merges them and the engine reads the merged
 * result. Nothing in this file knows how a battle works, and nothing in
 * `battle.ts` knows tiers exist (DN09 §7.3).
 *
 * Two authoring rules from §3, worth restating because they are what keeps the
 * ladder feeling like a challenge rather than a punishment:
 *
 *   - Alternate between *the enemy grows* and *you march leaner*.
 *   - **Never remove the toys.** Board slots, talent points, Banner Ranks and
 *     the war banks are untouched at every tier. Pressure comes from
 *     opposition and margins, never from amputating the systems that make the
 *     game fun.
 */

export const MAX_WAR_TIER = 10

export interface TierMods {
  /** rival AI noise override — lower is sharper. Lowest of the active rules wins. */
  rivalNoise?: number
  /** flat gold added to every rival's income each round */
  rivalIncome?: number
  /** multiplier on the income a rival's *talents* grant */
  rivalIncomeTalentMult?: number
  /** rivals draft with no noise and take the deep forks */
  rivalEliteDraft?: boolean
  /** extra Bulwark on every rival's front row, via the mod the engine reads */
  rivalFrontBulwark?: number
  /** flat change to the player's starting banner HP (negative = leaner) */
  playerHp?: number
  /** flat change to the player's income ceiling (negative = leaner) */
  playerIncomeCap?: number
  /** the strongest surviving rival is paired against you every Nth round */
  grudgeEvery?: number
  /** the last N rounds replace fallen rivals with authored boss boards */
  bossRounds?: number
}

export interface WarTier {
  tier: number
  /** null at Tier 1: the on-ramp adds nothing */
  name: string | null
  /** one line, shown at run start, in the pause sheet and in the picker */
  text: string | null
  mods: TierMods
}

/**
 * Two of these numbers are placeholders and say so, because DN09 was written
 * against DN08's economy and DN08 is not implemented yet. Thin Rations is
 * specified as 50 → 42 HP and Long Supply Lines as an 18 → 15 income ceiling;
 * today those baselines are 30 and 10. Both are set to a proportion of the
 * live numbers so the ladder's shape is right now and the absolute values land
 * when DN08 does. Long Supply Lines is -3 rather than the -2 the DN09 ratio
 * gives: at -2 it bit for barely a point and the designer re-pointed it at a
 * 15 → 13-equivalent.
 *
 * When DN08 §5 lands, Tiers 4, 6 and 7 must be re-pointed at the new baselines
 * in the same change. That obligation is tracked in TODO.md and pinned by
 * `tests/tiers.test.ts` — which fails the moment START_HP or BASE_INCOME_CAP
 * moves, so this comment cannot be the only thing standing between a new
 * economy and a stale ladder.
 */
export const WAR_TIERS: WarTier[] = [
  { tier: 1, name: null, text: null, mods: {} },
  {
    tier: 2,
    name: 'Veteran Rivals',
    text: 'Every rival warlord drafts with a steady hand — no more lucky mistakes.',
    mods: { rivalNoise: 1 },
  },
  {
    tier: 3,
    name: 'Rich Foes',
    text: 'Rivals draw an extra gold every round.',
    mods: { rivalIncome: 1 },
  },
  {
    tier: 4,
    name: 'Thin Rations',
    text: 'Your banner marches on less: 5 fewer starting HP.',
    mods: { playerHp: -5 },
  },
  {
    tier: 5,
    name: 'Elite Muster',
    text: 'Rivals draft for synergy and walk their war councils to the deep forks.',
    mods: { rivalEliteDraft: true, rivalNoise: 0 },
  },
  {
    tier: 6,
    name: 'Their War Chests',
    text: "Rivals' gold talents pay twice.",
    mods: { rivalIncomeTalentMult: 2 },
  },
  {
    tier: 7,
    name: 'Long Supply Lines',
    text: 'Your income ceiling drops by 3.',
    mods: { playerIncomeCap: -3 },
  },
  {
    tier: 8,
    name: 'Grudge Pairings',
    text: 'Every third round, the strongest banner still standing comes for you.',
    mods: { grudgeEvery: 3 },
  },
  {
    tier: 9,
    name: 'Iron Banners',
    text: 'Every rival front line enters battle with +1 Bulwark.',
    mods: { rivalFrontBulwark: 1 },
  },
  {
    tier: 10,
    name: 'The Crownless Throne',
    text: 'In the last rounds, the fallen are replaced by something worse.',
    mods: { bossRounds: 2 },
  },
]

export const tierDef = (tier: number): WarTier =>
  WAR_TIERS.find((t) => t.tier === tier) ?? WAR_TIERS[0]

/** The rules a run at this tier is playing under: exactly 2..tier, in order. */
export function rulesForTier(tier: number): WarTier[] {
  const n = clampTier(tier)
  return WAR_TIERS.filter((t) => t.tier >= 2 && t.tier <= n)
}

export const clampTier = (tier: number): number =>
  Number.isFinite(tier) ? Math.min(MAX_WAR_TIER, Math.max(1, Math.floor(tier))) : 1

/**
 * The merged knobs for a tier. Numbers add; flags OR; `rivalNoise` takes the
 * *lowest* value on offer, because two rules that both sharpen the AI should
 * not cancel out into the looser of the two.
 */
export function modsForTier(tier: number): TierMods {
  const out: TierMods = {}
  for (const rule of rulesForTier(tier)) {
    const m = rule.mods
    if (m.rivalNoise !== undefined) out.rivalNoise = Math.min(out.rivalNoise ?? Infinity, m.rivalNoise)
    if (m.rivalIncome) out.rivalIncome = (out.rivalIncome ?? 0) + m.rivalIncome
    if (m.rivalIncomeTalentMult) out.rivalIncomeTalentMult = (out.rivalIncomeTalentMult ?? 1) * m.rivalIncomeTalentMult
    if (m.rivalEliteDraft) out.rivalEliteDraft = true
    if (m.rivalFrontBulwark) out.rivalFrontBulwark = (out.rivalFrontBulwark ?? 0) + m.rivalFrontBulwark
    if (m.playerHp) out.playerHp = (out.playerHp ?? 0) + m.playerHp
    if (m.playerIncomeCap) out.playerIncomeCap = (out.playerIncomeCap ?? 0) + m.playerIncomeCap
    if (m.grudgeEvery !== undefined) out.grudgeEvery = Math.min(out.grudgeEvery ?? Infinity, m.grudgeEvery)
    if (m.bossRounds) out.bossRounds = Math.max(out.bossRounds ?? 0, m.bossRounds)
  }
  return out
}

/**
 * The Crownless Throne (Tier 10). Authored, not procedural — §3 is explicit
 * that authored beats procedural for feel, and a boss that is "a rival board
 * with the numbers turned up" reads as a bug rather than an opponent.
 *
 * These replace the ghost board in the endgame, which is the one slot in the
 * lobby that is already a stand-in for a dead warlord. Each is legal: real
 * units, real counts, nothing the game cannot otherwise produce — they are
 * simply better boards than the round would have offered.
 */
export interface BossBoard {
  name: string
  /**
   * What the Throne carries that a fresh roster does not.
   *
   * The first pass authored these boards as rosters alone and they were a
   * *gift*: the harness measured a round-13 player board at ~1775 power
   * against 447, and the player won 98.2% of boss battles for 1.5 HP. A board
   * met in the last rounds of a run is standing opposite fifteen rounds of
   * Growth, war banks and Banner Ranks, so it has to arrive carrying the same
   * kind of history. `rank: 2` is Honored — the thing the player spends a
   * whole run chasing, and the reason this reads as a boss rather than a
   * bigger rival. DN09 §3 leaves these numbers to the harness; §7 is where
   * they were tuned.
   */
  temper: { atk: number; hp: number; rank: number }
  stacks: { unitId: string; count: number; slot: number }[]
}

export const BOSS_BOARDS: BossBoard[] = [
  {
    // One banner from each faction's top of the line — the lobby's survivors
    // fused into the thing that took the throne while you were climbing.
    name: 'The Crownless Host',
    temper: { atk: 12, hp: 26, rank: 2 },
    stacks: [
      { unitId: 'vg_colossus', count: 12, slot: 0 },
      { unitId: 'vg_champion', count: 16, slot: 1 },
      { unitId: 'vd_elderbark', count: 12, slot: 2 },
      { unitId: 'st_warlord', count: 16, slot: 3 },
      { unitId: 'vg_ballistier', count: 16, slot: 4 },
      { unitId: 'vd_matriarch', count: 16, slot: 5 },
      { unitId: 'st_stormspear', count: 16, slot: 6 },
    ],
  },
  {
    // Verdant to the last stack: the faction whose whole identity is that it
    // never stops growing, met at the end of a run where it never had to stop.
    name: 'The Last Grove',
    temper: { atk: 12, hp: 26, rank: 2 },
    stacks: [
      { unitId: 'vd_ancient', count: 12, slot: 0 },
      { unitId: 'vd_elderbark', count: 14, slot: 1 },
      { unitId: 'vd_stag', count: 20, slot: 2 },
      { unitId: 'vd_thornbark', count: 24, slot: 3 },
      { unitId: 'vd_matriarch', count: 18, slot: 4 },
      { unitId: 'vd_warden', count: 16, slot: 5 },
      { unitId: 'vd_moonshade', count: 24, slot: 6 },
    ],
  },
]

/** Renown pays for altitude, win or lose (§4). */
export const renownMultiplier = (tier: number): number => 1 + 0.15 * (clampTier(tier) - 1)
