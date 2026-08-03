/**
 * The universal Inspect sheet (Design Notes 01 §2). One component serves the
 * War Camp offer, your own board, the scout view and the battle replay — a tap
 * anywhere opens this and never spends gold. The caller supplies the buttons,
 * so the sheet itself has no opinion about game actions.
 */
import type { ReactNode } from 'react'
import { unit } from '../data/index'
import { ZERO_MODS, type HeroMods, type UnitDef } from '../data/types'
import { lineOf, promoteCost } from '../engine/camp'
import { RANK_NAMES, lineRootOf, rankDefOf, rankForCount, thresholdsOf, veteranText } from '../engine/ranks'
import { Sigil } from './Sigil'
import { keywordName, keywordText } from './keywords'
import { RankPips, rowGlyph, rowWord, unitColor } from './StackCard'

export function lineFormsOf(unitId: string): UnitDef[] {
  return lineOf(lineRootOf(unitId)).map(unit)
}

export interface StackContext {
  count: number
  bonusAtk?: number
  bonusHp?: number
}

export function InspectSheet({
  unitId,
  context,
  mods = ZERO_MODS,
  extra,
  actions,
  onClose,
}: {
  unitId: string
  /** live stack numbers, when inspecting something already on a board */
  context?: StackContext
  /** for promotion pricing; read-only callers can leave it out */
  mods?: HeroMods
  /** Phase B slot — Banner Rank progress renders here (§3.3) */
  extra?: ReactNode
  actions?: ReactNode
  onClose: () => void
}) {
  const def = unit(unitId)
  const atk = def.atk + (context?.bonusAtk ?? 0)
  const hp = def.hp + (context?.bonusHp ?? 0)
  const forms = lineFormsOf(unitId)
  const currentIndex = forms.findIndex((f) => f.id === unitId)

  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <span className="faction-icon" style={{ ['--fc' as string]: unitColor(def) }}>
            <Sigil id={def.sigil} size={22} />
          </span>
          <div className="grow">
            <h2>{def.name}</h2>
            <div className="small dim">
              Tier {def.tier} · <span className="row-tag-inline">{rowGlyph(def.row)}</span> {rowWord(def.row)} line
              {def.row === 'any' ? ' — stands in either row' : ''}
            </div>
          </div>
        </div>

        <div className="stat-grid">
          <Stat label="ATK" value={atk} className="chip-atk" />
          <Stat label="HP" value={hp} className="chip-hp" />
          <Stat label="Init" value={def.init} />
          <Stat label="Per buy" value={`+${def.musterSize}`} />
          <Stat label="Tier" value={def.tier} />
          {context && <Stat label="Count" value={context.count} />}
        </div>

        {context && (
          <div className="tiny dim">
            {context.count} × {atk} ATK = {context.count * atk} damage a swing, {context.count * hp} pooled HP.
          </div>
        )}

        {def.keywords.length > 0 && (
          <div className="panel small" style={{ display: 'grid', gap: 5 }}>
            {def.keywords.map((k) => (
              <div key={k.k}>{keywordText(k)}</div>
            ))}
          </div>
        )}
        {def.ability && (
          <div className="panel small">
            <div className="eyebrow">Ability</div>
            {def.ability.text}
          </div>
        )}

        {forms.length > 1 && (
          <div style={{ display: 'grid', gap: 6 }}>
            <div className="eyebrow">Promotion line</div>
            {forms.map((f, i) => {
              const ahead = i > currentIndex
              return (
                <div key={f.id} className="line-form" data-now={f.id === unitId ? 'true' : undefined}>
                  <span className="line-form-icon" style={{ ['--fc' as string]: unitColor(f) }}>
                    <Sigil id={f.sigil} size={16} />
                  </span>
                  <span className="grow">
                    <strong className="small">{f.name}</strong>
                    <span className="tiny dim" style={{ display: 'block' }}>
                      {f.atk}/{f.hp} · {rowGlyph(f.row)} {rowWord(f.row)}
                      {f.keywords.length > 0 ? ` · ${f.keywords.map(keywordName).join(', ')}` : ''}
                    </span>
                  </span>
                  <span className="tiny center" style={{ flex: 'none' }}>
                    {f.id === unitId ? (
                      <span className="kw">now</span>
                    ) : ahead ? (
                      <>
                        <span className="gold" style={{ display: 'block' }}>
                          {promoteCost(f, mods)}g
                        </span>
                        <span className="dim">Camp T{f.tier}</span>
                      </>
                    ) : (
                      <span className="dim">earlier</span>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {/* Banner Ranks (§3) land here in Phase B. */}
        {extra}

        {actions && <div className="row wrap sheet-actions">{actions}</div>}

        <button className="btn btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}

/**
 * Banner Rank progress (§3.3). All the arithmetic lives in engine/ranks.ts —
 * this only formats what the engine already decided.
 */
export function RankProgress({
  unitId,
  count,
  rank = 0,
  /** count after one more purchase, for a shop offer card */
  projected,
}: {
  unitId: string
  count: number
  rank?: number
  projected?: number
}) {
  const def = rankDefOf(unitId)
  if (!def) return null
  const th = thresholdsOf(def, unit(lineRootOf(unitId)))
  const earned = Math.max(rank, rankForCount(count, th))
  const next = earned === 0 ? th[0] : earned === 1 ? th[1] : null
  const nextName = earned === 0 ? 'Veteran' : `Honored: ${def.honoredName}`
  const rootName = unit(lineRootOf(unitId)).name

  return (
    <div className="rank-panel">
      <div className="row spread">
        <span className="eyebrow">Banner Rank — {rootName} line</span>
        <span className="row" style={{ gap: 4 }}>
          <RankPips rank={earned} />
          <span className="tiny dim">{earned === 0 ? 'Unranked' : RANK_NAMES[earned]}</span>
        </span>
      </div>

      {next !== null ? (
        <>
          <div className="small">
            <strong>
              {count} / {next}
            </strong>{' '}
            — {nextName}
          </div>
          <span className="rank-bar">
            <i style={{ width: `${Math.min(100, (count / next) * 100)}%` }} />
          </span>
          {projected !== undefined && projected > count && (
            <div className="tiny gold">
              {projected >= next
                ? `This purchase reaches ${earned === 0 ? 'Veteran' : 'Honored'}.`
                : `After this purchase: ${projected} / ${next}.`}
            </div>
          )}
        </>
      ) : (
        <div className="small gold">Fully honoured — both banners earned.</div>
      )}

      <div className="rank-row" data-earned={earned >= 1 ? 'true' : undefined}>
        <RankPips rank={1} />
        <span className="grow">
          <strong className="small">Veteran — {th[0]}+</strong>
          <span className="tiny dim" style={{ display: 'block' }}>
            {veteranText(def)}
          </span>
        </span>
      </div>
      <div className="rank-row" data-earned={earned >= 2 ? 'true' : undefined}>
        <RankPips rank={2} />
        <span className="grow">
          <strong className="small">
            {def.honoredName} — {th[1]}+
          </strong>
          <span className="tiny dim" style={{ display: 'block' }}>
            {def.honoredText}
          </span>
        </span>
      </div>
      <div className="tiny dim">Ranks are permanent for the run and survive promotion — they only ever go up.</div>
    </div>
  )
}

function Stat({ label, value, className }: { label: string; value: number | string; className?: string }) {
  return (
    <span className="center">
      <span className="eyebrow">{label}</span>
      <div className={className} style={{ fontSize: 19, fontWeight: 800 }}>
        {value}
      </div>
    </span>
  )
}
