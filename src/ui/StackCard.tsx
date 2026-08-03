import { UNIT_ART } from '../data/art'
import { FACTION_BY_ID, unit } from '../data/index'
import type { Projectile, RowPref, UnitDef } from '../data/types'
import type { StackSnap } from '../engine/battle'
import { Plate } from './Plate'
import { Sigil } from './Sigil'

export function unitColor(def: UnitDef): string {
  if (def.pool === 'merc') return '#8a8fa6'
  return FACTION_BY_ID.get(def.pool)?.colors.primary ?? '#8a8fa6'
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

interface Props {
  unitId: string
  count: number
  atk: number
  hp: number
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
  float?: { text: string; kind: 'dmg' | 'heal' | 'buff' | 'soak' } | null
  /** Muster: 'ready' = affordable promotion waiting, 'soon' = needs more gold */
  promote?: 'ready' | 'soon' | null
  /** Cover charges available — one shield dot each (Design Notes 02 §3.3) */
  cover?: number
  /** this stack was just saved by a coverer — brief glow */
  savedByCover?: boolean
  /** measured by the battle screen to draw volley arcs */
  domId?: string
  /** on screen this frame (board, battle) — load the plate immediately */
  eager?: boolean
  /** jump the fetch queue (the visible camp offers) */
  priority?: boolean
}

export function StackCard({
  unitId,
  count,
  atk,
  hp,
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
  promote,
  cover = 0,
  savedByCover,
  domId,
  eager,
  priority,
}: Props) {
  const def = unit(unitId)
  const color = unitColor(def)
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      className="stack"
      style={{ ['--sc' as string]: color }}
      data-tier={def.tier}
      data-sel={selected ? 'true' : 'false'}
      data-illegal={illegal ? 'true' : undefined}
      data-promote={promote ?? undefined}
      data-uid={domId}
      data-saved={savedByCover ? 'true' : undefined}
      data-hit={state === 'hit' ? 'true' : undefined}
      data-act={state === 'act' ? 'true' : undefined}
      data-dead={state === 'dead' ? 'true' : undefined}
      onClick={onClick}
      type={onClick ? 'button' : undefined}
      aria-label={`${def.name}, ${count} units, ${atk} attack, ${hp} health, ${rowWord(def.row)} row${rank > 0 ? `, ${rankWord(rank)}` : ''}${promote === 'ready' ? ', promotion available' : ''}${cover > 0 ? `, Cover ${cover}` : ''}`}
    >
      <span className="card-art">
        <Plate src={UNIT_ART[unitId]} eager={eager} priority={priority} fallback={<Sigil id={def.sigil} size={26} />} />
      </span>
      {/* Name sits on the scrim, so it stays legible over any plate. */}
      <span className="card-scrim" aria-hidden="true" />
      {/* Hit flash is an overlay, never a filter on the image — a filter
          forces a re-decode mid-battle on Safari. */}
      {state === 'hit' && <span className="card-flash" aria-hidden="true" />}
      {promote && (
        <span className="promote-flag" data-state={promote} aria-hidden="true">
          ▲
        </span>
      )}
      {float && <span className={`float float-${float.kind}`}>{float.text}</span>}
      <span className="row-glyph" aria-hidden="true">
        {rowGlyph(def.row)}
      </span>
      <RankPips rank={rank} flash={rankFlash} />
      <CoverPips charges={cover} />
      <span className="count-badge">{count}</span>
      <span className="card-foot">
        <span className="stack-name">{def.name}</span>
        <span className="chips">
          <span className="chip-atk" data-buff={atkBuffed ? 'true' : undefined}>
            {atk}
          </span>
          <span className="dim">/</span>
          <span className="chip-hp" data-buff={hpBuffed ? 'true' : undefined}>
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
}

/** Battle-time variant driven purely by an event-log snapshot. */
export function SnapCard({
  snap,
  state,
  float,
  onClick,
  savedByCover,
}: {
  snap: StackSnap
  state?: 'hit' | 'act' | 'dead' | null
  float?: Props['float']
  onClick?: () => void
  savedByCover?: boolean
}) {
  const total = snap.startCount * snap.maxHp
  const cur = snap.count * snap.maxHp - snap.wound
  return (
    <StackCard
      unitId={snap.unitId}
      count={snap.count}
      atk={snap.atk}
      hp={snap.maxHp}
      bulwark={snap.bulwark}
      rank={snap.rank}
      health={total > 0 ? cur / total : 0}
      state={state}
      float={float}
      onClick={onClick}
      cover={snap.cover}
      savedByCover={savedByCover}
      domId={snap.uid}
      eager
    />
  )
}
