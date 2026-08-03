import { FACTION_BY_ID, unit } from '../data/index'
import type { RowPref, UnitDef } from '../data/types'
import type { StackSnap } from '../engine/battle'
import { Sigil } from './Sigil'

export function unitColor(def: UnitDef): string {
  if (def.pool === 'merc') return '#8a8fa6'
  return FACTION_BY_ID.get(def.pool)?.colors.primary ?? '#8a8fa6'
}

/** Row eligibility, in one character. Shared by every card and sheet (§1.4). */
export function rowGlyph(row: RowPref): string {
  return row === 'front' ? '⚔' : row === 'back' ? '➶' : '◈'
}

export function rowWord(row: RowPref): string {
  return row === 'front' ? 'Front' : row === 'back' ? 'Back' : 'Any'
}

interface Props {
  unitId: string
  count: number
  atk: number
  hp: number
  bulwark?: number
  /** 0–1 pooled-HP fraction; omit outside battle */
  health?: number
  selected?: boolean
  /** placement mode: this card can't take the held stack, so it reads as inert */
  illegal?: boolean
  state?: 'hit' | 'act' | 'dead' | null
  onClick?: () => void
  float?: { text: string; kind: 'dmg' | 'heal' | 'buff' | 'soak' } | null
}

export function StackCard({
  unitId,
  count,
  atk,
  hp,
  bulwark = 0,
  health,
  selected,
  illegal,
  state,
  onClick,
  float,
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
      data-hit={state === 'hit' ? 'true' : undefined}
      data-act={state === 'act' ? 'true' : undefined}
      data-dead={state === 'dead' ? 'true' : undefined}
      onClick={onClick}
      type={onClick ? 'button' : undefined}
      aria-label={`${def.name}, ${count} units, ${atk} attack, ${hp} health, ${rowWord(def.row)} row`}
    >
      {float && <span className={`float float-${float.kind}`}>{float.text}</span>}
      <span className="row-glyph" aria-hidden="true">
        {rowGlyph(def.row)}
      </span>
      <span className="count-badge">{count}</span>
      <Sigil id={def.sigil} size={20} />
      <span className="stack-name">{def.name}</span>
      <span className="chips">
        <span className="chip-atk">{atk}</span>
        <span className="dim">/</span>
        <span className="chip-hp">{hp}</span>
        {bulwark > 0 && <span className="chip-bul">◈{bulwark}</span>}
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
}: {
  snap: StackSnap
  state?: 'hit' | 'act' | 'dead' | null
  float?: Props['float']
  onClick?: () => void
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
      health={total > 0 ? cur / total : 0}
      state={state}
      float={float}
      onClick={onClick}
    />
  )
}
