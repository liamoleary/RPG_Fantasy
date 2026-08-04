/**
 * The universal Inspect sheet (Design Notes 01 §2). One component serves the
 * War Camp offer, your own board, the scout view and the battle replay — a tap
 * anywhere opens this and never spends gold. The caller supplies the buttons,
 * so the sheet itself has no opinion about game actions.
 */
import type { ReactNode } from 'react'
import { UNIT_ART } from '../data/art'
import { unit } from '../data/index'
import { ZERO_MODS, type HeroMods, type UnitDef } from '../data/types'
import type { StatBreakdown } from '../engine/battle'
import { lineOf, promoteCost } from '../engine/camp'
import { RANK_NAMES, lineRootOf, rankDefOf, rankForCount, thresholdsOf, veteranText } from '../engine/ranks'
import { Plate } from './Plate'
import { Sigil } from './Sigil'
import { keywordName, keywordText } from './keywords'
import { ApexMeter, RankPips, rowGlyph, rowWord, unitColor } from './StackCard'

export function lineFormsOf(unitId: string): UnitDef[] {
  return lineOf(lineRootOf(unitId)).map(unit)
}

export interface PromoteBlock {
  /** the next form, if this unit has one at all */
  target: UnitDef | null
  ok: boolean
  cost: number | null
  reason?: string
}

/**
 * Why you can or cannot promote, in one place. Returning a reason rather than
 * `null` is the point: a promotion that silently vanishes from the sheet reads
 * as a bug, not a requirement.
 */
export function promoteBlock(unitId: string, campTier: number, gold: number, mods: HeroMods): PromoteBlock {
  const def = unit(unitId)
  if (!def.lineNext) return { target: null, ok: false, cost: null }
  const target = unit(def.lineNext)
  const cost = promoteCost(target, mods)
  if (target.tier > campTier) {
    return { target, ok: false, cost, reason: `Needs Camp Tier ${target.tier} — you are on Tier ${campTier}.` }
  }
  if (gold < cost) return { target, ok: false, cost, reason: `Costs ${cost}g — you have ${gold}.` }
  return { target, ok: true, cost }
}

export interface StackContext {
  count: number
  bonusAtk?: number
  bonusHp?: number
  /** itemised effective stats — renders the "why is this number big" line (§2.1) */
  stats?: StatBreakdown
  /** mid-battle only: how full this stack's Apex meter is right now */
  apexCharge?: number
}

/** `ATK 5 = 3 base + 1 Growth + 1 Overwatch` — one tap answers the whole Might branch. */
function Breakdown({ stats }: { stats: StatBreakdown }) {
  const line = (key: 'atk' | 'hp', total: number) => {
    const parts = stats.parts.filter((pt) => pt[key] !== 0)
    if (parts.length <= 1) return null
    return (
      <div>
        <span className="stat-sum">
          {key.toUpperCase()} {total}
        </span>{' '}
        = {parts.map((pt, i) => `${i > 0 && pt[key] > 0 ? '+ ' : i > 0 ? '- ' : ''}${i > 0 ? Math.abs(pt[key]) : pt[key]} ${pt.label}`).join(' ')}
      </div>
    )
  }
  const atk = line('atk', stats.atk)
  const hp = line('hp', stats.hp)
  if (!atk && !hp) return null
  return (
    <div className="tiny dim stat-breakdown">
      {atk}
      {hp}
    </div>
  )
}

export function InspectSheet({
  unitId,
  context,
  mods = ZERO_MODS,
  campTier,
  gold,
  extra,
  onPromote,
  actions,
  onClose,
}: {
  unitId: string
  /** live stack numbers, when inspecting something already on a board */
  context?: StackContext
  /** for promotion pricing; read-only callers can leave it out */
  mods?: HeroMods
  /** live camp tier and purse, so the line can say what is blocking a promotion */
  campTier?: number
  gold?: number
  /** Phase B slot — Banner Rank progress renders here (§3.3) */
  extra?: ReactNode
  /** DN04 §8: promotion pins to the top of the sheet, not the bottom */
  onPromote?: () => void
  actions?: ReactNode
  onClose: () => void
}) {
  const def = unit(unitId)
  const atk = context?.stats ? context.stats.atk : def.atk + (context?.bonusAtk ?? 0)
  const hp = context?.stats ? context.stats.hp : def.hp + (context?.bonusHp ?? 0)
  const forms = lineFormsOf(unitId)
  const currentIndex = forms.findIndex((f) => f.id === unitId)
  const tierLocked = (tier: number) => campTier !== undefined && tier > campTier
  const nextBlock =
    campTier !== undefined && gold !== undefined ? promoteBlock(unitId, campTier, gold, mods) : null

  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        {/* The plate leads: this is the screen where the player decides. */}
        <div className="sheet-art" style={{ ['--sc' as string]: unitColor(def) }}>
          <Plate src={UNIT_ART[unitId]} eager fallback={<Sigil id={def.sigil} size={64} />} />
        </div>
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

        {/* The player should never scroll to grow (§8). */}
        {onPromote && nextBlock?.target && (
          <button
            className="btn btn-gold promote-pin"
            disabled={!nextBlock.ok}
            title={nextBlock.reason}
            onClick={onPromote}
          >
            <span className="promote-face">
              <Plate src={UNIT_ART[nextBlock.target.id]} eager fallback={<Sigil id={nextBlock.target.sigil} size={14} />} />
            </span>
            <span className="grow" style={{ textAlign: 'left' }}>
              Promote → {nextBlock.target.name}
              {nextBlock.reason && <span className="promote-why">{nextBlock.reason}</span>}
            </span>
            <span>{nextBlock.cost}g</span>
          </button>
        )}

        <div className="stat-grid">
          <Stat label="ATK" value={atk} className="chip-atk" buffed={atk > def.atk} />
          <Stat label="HP" value={hp} className="chip-hp" buffed={hp > def.hp} />
          <Stat label="Init" value={def.init} />
          <Stat label="Buy" value={`+${def.musterSize}`} />
          <Stat label="Tier" value={def.tier} />
          {context && <Stat label="Held" value={context.count} />}
        </div>

        {context?.stats && <Breakdown stats={context.stats} />}

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
        {/* Buyers should see what finishing the line is building toward (DN04 §3). */}
        {def.apex && (
          <div className="panel small apex-panel" style={{ ['--sc' as string]: unitColor(def) }}>
            <div className="row spread">
              <span className="eyebrow">Apex — {def.apex.name}</span>
              <ApexMeter charge={context?.apexCharge ?? 0} max={def.apex.charge} />
            </div>
            <div>{def.apex.text}</div>
            <div className="tiny dim blurb-flavour">
              Charges once when this stack attacks and once when it survives casualties; fires at {def.apex.charge}.
            </div>
          </div>
        )}

        {forms.length > 1 && (
          <div style={{ display: 'grid', gap: 6 }}>
            <div className="eyebrow">Promotion line</div>
            {forms.map((f, i) => {
              const ahead = i > currentIndex
              return (
                <div key={f.id} className="line-form" data-now={f.id === unitId ? 'true' : undefined}>
                  <span className="line-form-art" style={{ ['--sc' as string]: unitColor(f) }}>
                    <Plate src={UNIT_ART[f.id]} fallback={<Sigil id={f.sigil} size={16} />} />
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
                        {/* Say whether the tier is a wall or already cleared,
                            rather than a bare number the player must decode. */}
                        <span className={tierLocked(f.tier) ? 'g-locked' : 'dim'}>
                          {tierLocked(f.tier) ? `🔒 Camp T${f.tier}` : `Camp T${f.tier}`}
                        </span>
                      </>
                    ) : (
                      <span className="dim">earlier</span>
                    )}
                  </span>
                </div>
              )
            })}
            {nextBlock?.target && (
              <div className={`tiny ${nextBlock.ok ? 'gold' : 'g-locked'}`}>
                {nextBlock.ok
                  ? `Promote now for ${nextBlock.cost}g — the whole stack upgrades at once and keeps its count.`
                  : nextBlock.reason}
              </div>
            )}
          </div>
        )}

        {/* Banner Ranks (§3) land here in Phase B. */}
        {extra}

        {/* Actions and Close share one row: a full-width Close of its own cost
            the sheet 50px, which is a keyword block. */}
        <div className="sheet-foot">
          <div className="row wrap sheet-actions">
            {actions}
            <button className="btn btn-sm btn-ghost" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
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
      <div className="tiny dim blurb-flavour">Ranks are permanent for the run and survive promotion — they only ever go up.</div>
    </div>
  )
}

function Stat({
  label,
  value,
  className,
  buffed,
}: {
  label: string
  value: number | string
  className?: string
  /** above the printed base — same buff colour the board uses (§2.1) */
  buffed?: boolean
}) {
  return (
    <span className="center">
      <span className="eyebrow">{label}</span>
      <div className={className} data-buff={buffed ? 'true' : undefined} style={{ fontSize: 19, fontWeight: 800 }}>
        {value}
      </div>
    </span>
  )
}
