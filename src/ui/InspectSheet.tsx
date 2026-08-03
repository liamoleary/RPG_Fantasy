/**
 * The universal Inspect sheet (Design Notes 01 §2). One component serves the
 * War Camp offer, your own board, the scout view and the battle replay — a tap
 * anywhere opens this and never spends gold. The caller supplies the buttons,
 * so the sheet itself has no opinion about game actions.
 */
import type { ReactNode } from 'react'
import { ALL_UNITS, unit } from '../data/index'
import { ZERO_MODS, type HeroMods, type UnitDef } from '../data/types'
import { lineOf, promoteCost } from '../engine/camp'
import { Sigil } from './Sigil'
import { keywordName, keywordText } from './keywords'
import { rowGlyph, rowWord, unitColor } from './StackCard'

/**
 * unitId -> the first form of its promotion line. `lineNext` only points
 * forward, so the root is found by walking the predecessor map built once here.
 */
const LINE_ROOT: Map<string, string> = (() => {
  const prev = new Map<string, string>()
  for (const u of ALL_UNITS) if (u.lineNext) prev.set(u.lineNext, u.id)
  const root = new Map<string, string>()
  for (const u of ALL_UNITS) {
    let cur = u.id
    const seen = new Set<string>([cur])
    for (;;) {
      const p = prev.get(cur)
      if (!p || seen.has(p)) break
      cur = p
      seen.add(p)
    }
    root.set(u.id, cur)
  }
  return root
})()

export function lineFormsOf(unitId: string): UnitDef[] {
  return lineOf(LINE_ROOT.get(unitId) ?? unitId).map(unit)
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
