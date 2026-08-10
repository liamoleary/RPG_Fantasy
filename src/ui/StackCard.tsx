import { useState } from 'react'
import { UNIT_ART } from '../data/art'
import { FACTION_BY_ID, unit } from '../data/index'
import type { CastFx, Projectile, RowPref, UnitDef } from '../data/types'
import type { StackSnap } from '../engine/battle'
import { Plate } from './Plate'
import { Sigil } from './Sigil'

export function unitColor(def: UnitDef): string {
  // Mercenaries are deliberately drab; the value is a token so the theme owns
  // it (DN07 §4). Factions keep their own sampled colours.
  if (def.pool === 'merc') return 'var(--merc)'
  return FACTION_BY_ID.get(def.pool)?.colors.primary ?? 'var(--merc)'
}

/**
 * What this unit's volley looks like in flight (Design Notes 03 §4). Data wins;
 * otherwise the faction decides — Vanguard bolts, Verdant arrows, Stormtide
 * sparks, mercenaries plain arrows.
 */
export function projectileOf(def: UnitDef): Projectile {
  if (def.projectile) return def.projectile
  return def.pool === 'vanguard' ? 'bolt' : def.pool === 'verdant' ? 'arrow' : def.pool === 'stormtide' ? 'spark' : 'arrow'
}

/** Faction defaults for spell flavour (DN04 §10). */
const FACTION_CAST: Record<string, CastFx> = { vanguard: 'holy', verdant: 'nature', stormtide: 'storm' }

/** What this unit's magic looks like: data wins, otherwise its faction. */
export function castFxOf(def: UnitDef): CastFx {
  return def.castFx ?? FACTION_CAST[def.pool] ?? 'arcane'
}

/** What a hero's magic looks like — same rule, so an army reads as one colour. */
export function castFxOfFaction(factionId: string): CastFx {
  return FACTION_CAST[factionId] ?? 'arcane'
}

/** Row eligibility, in one character. Shared by every card and sheet (§1.4). */
export function rowGlyph(row: RowPref): string {
  return row === 'front' ? '⚔' : row === 'back' ? '➶' : '◈'
}

export function rowWord(row: RowPref): string {
  return row === 'front' ? 'Front' : row === 'back' ? 'Back' : 'Any'
}

/** Banner Rank chevrons: one bronze for Veteran, two gold for Honored (§3.3). */
export function RankPips({ rank, flash }: { rank: number; flash?: boolean }) {
  if (rank <= 0) return null
  return (
    <span className={`rank-pips${flash ? ' rank-flash' : ''}`} data-rank={rank >= 2 ? 2 : 1}>
      {rank >= 2 ? '››' : '›'}
    </span>
  )
}

export const rankWord = (rank: number): string => (rank >= 2 ? 'Honored' : rank === 1 ? 'Veteran' : '')

/**
 * One shield dot per remaining Cover charge (§3.3). Same family as the rank
 * chevrons but unmistakably distinct: dots, not carets, and on the left.
 */
export function CoverPips({ charges }: { charges: number }) {
  if (charges <= 0) return null
  return (
    <span className="cover-pips" aria-hidden="true">
      {Array.from({ length: Math.min(charges, 4) }, (_, i) => (
        <i key={i} />
      ))}
      {charges > 4 && <b>{charges}</b>}
    </span>
  )
}

/**
 * The Apex meter (Design Notes 04 §3): one segment per charge, filling as the
 * stack fights. Deliberately a bar, not pips — rank chevrons and Cover dots
 * already own that language, and a meter has to read as *progress*. On the
 * card it is a slim left-edge marker (DN07 §2): the plate is the point, and a
 * meter parked in the corner was competing with the stat pill for it.
 */
export function ApexMeter({ charge, max, ready }: { charge: number; max: number; ready?: boolean }) {
  if (max <= 0) return null
  return (
    <span className="apex-meter" data-ready={ready ? 'true' : undefined} aria-label={`Apex ${charge} of ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <i key={i} data-on={i < charge ? 'true' : undefined} />
      ))}
    </span>
  )
}

/**
 * The three canonical card sizes (Design Notes 07 §2). One component renders
 * all of them; nothing else in the app is allowed to invent a card layout.
 *
 * - `board`    grid-fitted, ~86–100px wide. No name: the art is the identity.
 * - `camp`     ~160px, the hand you buy from. Name plate on a local scrim.
 * - `showcase` full width — inspect and the Legend recap parade.
 */
export type CardSize = 'board' | 'camp' | 'showcase'

interface Props {
  unitId: string
  count: number
  atk: number
  hp: number
  /**
   * The pool this stack started the battle with. Supplying it is what lets the
   * HP number read as *wounded* rather than merely small — a 12/30 stack and a
   * 12/12 stack are in very different trouble and the bare number cannot say
   * which. Omit outside battle, where nothing is damaged.
   */
  hpMax?: number
  bulwark?: number
  /** 0 none / 1 Veteran / 2 Honored */
  rank?: number
  /** stamp the chevron in — set for one action after a rank-up */
  rankFlash?: boolean
  /** these numbers are above the unit's printed base — light them up (§2.1) */
  atkBuffed?: boolean
  hpBuffed?: boolean
  /** 0–1 pooled-HP fraction; omit outside battle */
  health?: number
  selected?: boolean
  /** placement mode: this card can't take the held stack, so it reads as inert */
  illegal?: boolean
  state?: 'hit' | 'act' | 'dead' | null
  onClick?: () => void
  float?: { text: string; kind: 'dmg' | 'heal' | 'buff' | 'soak'; weight?: number } | null
  /** share of pool this blow took — scales the shake, knockback and number (§7) */
  weight?: number
  /** a spell landing on this stack, in its caster's flavour (§10) */
  bloom?: CastFx | null
  /** this stack is the caster — it lights up in its own flavour (§10) */
  glow?: CastFx | null
  /** Muster: 'ready' = affordable promotion waiting, 'soon' = needs more gold */
  promote?: 'ready' | 'soon' | null
  /** tapping the badge promotes without opening the sheet (DN04 §8) */
  onPromoteTap?: () => void
  /** Cover charges available — one shield dot each (Design Notes 02 §3.3) */
  cover?: number
  /** Apex meter (DN04 §3) — omit for the forms that have no ultimate */
  apexCharge?: number
  apexMax?: number
  /** this stack is unleashing its ultimate this frame */
  apexFiring?: boolean
  /** this stack was just saved by a coverer — brief glow */
  savedByCover?: boolean
  /** measured by the battle screen to draw volley arcs */
  domId?: string
  /** on screen this frame (board, battle) — load the plate immediately */
  eager?: boolean
  /** jump the fetch queue (the visible camp offers) */
  priority?: boolean
  /** which of the three canonical sizes to render at (§2); defaults to board */
  size?: CardSize
}

export function StackCard({
  unitId,
  count,
  atk,
  hp,
  hpMax,
  bulwark = 0,
  rank = 0,
  rankFlash,
  atkBuffed,
  hpBuffed,
  health,
  selected,
  illegal,
  state,
  onClick,
  float,
  weight = 0,
  bloom,
  glow,
  promote,
  onPromoteTap,
  cover = 0,
  apexCharge = 0,
  apexMax = 0,
  apexFiring,
  savedByCover,
  domId,
  eager,
  priority,
  size = 'board',
}: Props) {
  const def = unit(unitId)
  const color = unitColor(def)
  const Tag = onClick ? 'button' : 'div'

  /**
   * Count the times this stack's health has *dropped*, so the number can be
   * seen falling rather than just being different on the next frame. A CSS
   * animation will not replay while the element stays mounted, so the counter
   * becomes the chip's key and a decrease remounts it.
   *
   * Only decreases tick. A heal already announces itself with a green `+N`
   * float, and a stack visibly flinching as it is healed reads as a bug.
   * Derived during render rather than in an effect — the number and its beat
   * have to land in the same frame or the animation trails the damage.
   */
  const [seenHp, setSeenHp] = useState(hp)
  const [hpTick, setHpTick] = useState(0)
  if (seenHp !== hp) {
    setSeenHp(hp)
    if (hp < seenHp) setHpTick((n) => n + 1)
  }
  // A tappable badge cannot live inside the card: the card is itself a button.
  // The wrapper is the positioning context for both (§8).
  const card = (
    <Tag
      className="stack"
      style={{ ['--sc' as string]: color }}
      data-size={size}
      data-tier={def.tier}
      data-sel={selected ? 'true' : 'false'}
      data-illegal={illegal ? 'true' : undefined}
      data-promote={promote ?? undefined}
      data-uid={domId}
      data-saved={savedByCover ? 'true' : undefined}
      data-apex={apexMax > 0 && apexCharge >= apexMax ? 'ready' : undefined}
      data-apex-firing={apexFiring ? 'true' : undefined}
      data-weight={weight >= 0.4 ? 'heavy' : weight > 0 ? 'light' : undefined}
      data-casting={glow ?? undefined}
      data-hit={state === 'hit' ? 'true' : undefined}
      data-act={state === 'act' ? 'true' : undefined}
      data-dead={state === 'dead' ? 'true' : undefined}
      onClick={onClick}
      type={onClick ? 'button' : undefined}
      aria-label={`${def.name}, ${count} units, ${atk} attack, ${
        hpMax !== undefined && hp < hpMax ? `${hp} of ${hpMax} health` : `${hp} health`
      }, ${rowWord(def.row)} row${rank > 0 ? `, ${rankWord(rank)}` : ''}${promote === 'ready' ? ', promotion available' : ''}${cover > 0 ? `, Cover ${cover}` : ''}${apexMax > 0 ? `, Apex ${apexCharge} of ${apexMax}` : ''}`}
    >
      {/* Full-bleed: the plate IS the card (§2). Everything below is an
          overlay floating on it, and none of it may become a frame again. */}
      <span className="card-art">
        <Plate src={UNIT_ART[unitId]} eager={eager} priority={priority} fallback={<Sigil id={def.sigil} size={26} />} />
      </span>
      {/* Hit flash is an overlay, never a filter on the image — a filter
          forces a re-decode mid-battle on Safari. */}
      {state === 'hit' && <span className="card-flash" aria-hidden="true" />}
      {bloom && <span className="cast-bloom" data-fx={bloom} aria-hidden="true" />}
      {float && (
        <span
          className={`float float-${float.kind}`}
          data-size={(float.weight ?? 0) >= 0.4 ? 'lg' : (float.weight ?? 0) >= 0.15 ? 'md' : undefined}
        >
          {float.text}
        </span>
      )}
      {/* Top bar: marks left, count right. One flex row rather than four
          absolutely-placed chips, which at 86px used to collide. */}
      <span className="card-top">
        <span className="card-marks">
          <RankPips rank={rank} flash={rankFlash} />
          <span className="row-glyph" aria-hidden="true">
            {rowGlyph(def.row)}
          </span>
          {promote && !onPromoteTap && (
            <span className="promote-flag" data-state={promote} aria-hidden="true">
              ▲
            </span>
          )}
        </span>
        <span className="count-badge">{count}</span>
      </span>
      {/* Slim edge markers, so neither one eats into the art (§2). */}
      <CoverPips charges={cover} />
      <ApexMeter charge={apexCharge} max={apexMax} ready={apexCharge >= apexMax && apexMax > 0} />
      <span className="card-foot">
        {/* No name at board size: the art is the identity (§2). */}
        {size !== 'board' && <span className="stack-name">{def.name}</span>}
        <span className="chips">
          <span className="chip-atk" data-buff={atkBuffed ? 'true' : undefined}>
            {atk}
          </span>
          <span className="dim">/</span>
          <span
            key={hpTick}
            className="chip-hp"
            data-buff={hpBuffed ? 'true' : undefined}
            data-hurt={hpMax !== undefined && hp < hpMax ? 'true' : undefined}
          >
            {hp}
          </span>
          {bulwark > 0 && <span className="chip-bul">◈{bulwark}</span>}
        </span>
      </span>
      {health !== undefined && (
        <span className="hpbar">
          <i style={{ width: `${Math.max(0, Math.min(1, health)) * 100}%` }} />
        </span>
      )}
    </Tag>
  )
  if (!onPromoteTap || !promote) return card
  return (
    <span className="stack-wrap" style={{ ['--sc' as string]: color }}>
      {card}
      <button
        className="promote-flag promote-tap"
        data-state={promote}
        onClick={onPromoteTap}
        aria-label={`Promote ${def.name}`}
      >
        ▲
      </button>
    </span>
  )
}

/** Battle-time variant driven purely by an event-log snapshot. */
export function SnapCard({
  snap,
  state,
  float,
  weight,
  bloom,
  glow,
  onClick,
  savedByCover,
  apexFiring,
  size,
}: {
  snap: StackSnap
  state?: 'hit' | 'act' | 'dead' | null
  float?: Props['float']
  weight?: number
  bloom?: CastFx | null
  glow?: CastFx | null
  onClick?: () => void
  savedByCover?: boolean
  apexFiring?: boolean
  size?: CardSize
}) {
  return (
    <StackCard
      unitId={snap.unitId}
      count={snap.count}
      // The stack's own numbers, not one model's. Per-model atk/maxHp are
      // constants and never moved during a fight, which left the health bar
      // as the only sign a stack was breaking — too quiet to read at speed.
      atk={snap.power}
      hp={snap.hp}
      hpMax={snap.hpMax}
      bulwark={snap.bulwark}
      rank={snap.rank}
      health={snap.hpMax > 0 ? snap.hp / snap.hpMax : 0}
      state={state}
      float={float}
      weight={weight}
      bloom={bloom}
      glow={glow}
      onClick={onClick}
      cover={snap.cover}
      apexCharge={snap.apexCharge}
      apexMax={snap.apexMax}
      apexFiring={apexFiring}
      savedByCover={savedByCover}
      domId={snap.uid}
      eager
      size={size}
    />
  )
}
