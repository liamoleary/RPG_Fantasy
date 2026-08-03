import { useState } from 'react'
import { UNIT_ART } from '../data/art'
import { BOON_BY_ID, FACTION_BY_ID, HERO_BY_ID, unit } from '../data/index'
import type { BoonDef, Row } from '../data/types'
import { FRONT_SLOTS, spellPower, type BoardStack } from '../engine/battle'
import {
  canPromote,
  firstOpenSlot,
  musterCount,
  promoteCost,
  rerollCost,
  stackOfUnit,
  RECRUIT_COST,
  sellValue,
  tierUpCost,
} from '../engine/camp'
import { heroLevel } from '../engine/boons'
import { heroState, opponentOf, player, type RunState } from '../engine/run'
import { useGame } from '../state/store'
import { InspectSheet, RankProgress, promoteBlock } from './InspectSheet'
import { GlossarySheet } from './Glossary'
import { Plate } from './Plate'
import { unitArtFor, usePreloadArt } from './preload'
import { Ladder, WarlordSheet } from './Ladder'
import { Sigil } from './Sigil'
import { StackCard, rowGlyph, unitColor } from './StackCard'

/** The one place the two rows are explained in full (§1.2 row info tap). */
export const ROW_INFO: Record<Row, { label: string; clause: string; text: string }> = {
  front: {
    label: 'FRONT LINE',
    clause: 'melee, takes the hits',
    text: 'Four slots. Enemy melee always strikes your front line first, so these stacks absorb the battle. Put your tough, high-count units here — they buy your back line the time it needs.',
  },
  back: {
    label: 'BACK LINE',
    clause: 'ranged, protected',
    text: 'Three slots. Enemy melee cannot reach your back line until your front line is empty. It is not immune, though: Volley and Siege units, and hero spells, reach it at any time. Put ranged and support stacks here.',
  },
}

export type PromoteState = 'ready' | 'soon' | null

export interface RecruitBlock {
  ok: boolean
  reason?: string
}

/**
 * One gate for "can I buy this", used by the offer card, its Recruit button
 * and the Inspect sheet, so a greyed card and a disabled button can never
 * disagree. Gold is not the only blocker: the recruits need somewhere to
 * stand — an existing stack of the same line, or an open slot in a legal row.
 */
export function canRecruit(unitId: string | null, board: BoardStack[], gold: number): RecruitBlock {
  if (!unitId) return { ok: false }
  if (gold < RECRUIT_COST) return { ok: false, reason: `Costs ${RECRUIT_COST}g — you have ${gold}.` }
  const def = unit(unitId)
  if (stackOfUnit(board, unitId) || firstOpenSlot(board, def) !== null) return { ok: true }
  return { ok: false, reason: `No open ${def.row === 'any' ? '' : `${def.row} `}slot — sell or move something first.` }
}

export function MusterScreen({ run }: { run: RunState }) {
  const store = useGame()
  const p = player(run)
  const [heroOpen, setHeroOpen] = useState(false)
  const [glossary, setGlossary] = useState(false)
  const [rowInfo, setRowInfo] = useState<Row | null>(null)
  const [offerIndex, setOfferIndex] = useState<number | null>(null)
  const [stackUid, setStackUid] = useState<string | null>(null)
  const foeId = opponentOf(run, p.id)
  const foe = foeId ? run.warlords.find((w) => w.id === foeId) : null
  const rCost = rerollCost(p.camp, p.mods)
  const tCost = tierUpCost(p.camp, p.mods)
  const level = heroLevel(run.round)
  const hero = HERO_BY_ID.get(p.heroId)!

  // Your board and the board you are about to fight, fetched while the player
  // reads the camp — the battle must never open on a blank frame (§4).
  usePreloadArt(unitArtFor([...p.board.map((s) => s.unitId), ...(foe?.board ?? []).map((s) => s.unitId)]))

  // Promotion is the easiest thing to miss on this screen — surface it on the
  // card instead of making the player open every stack to go looking.
  const promoteStateOf = (stack: BoardStack): PromoteState => {
    const target = canPromote(stack, p.camp)
    if (!target) return null
    return p.gold >= promoteCost(target, p.mods) ? 'ready' : 'soon'
  }

  const selectedStack = store.selected ? p.board.find((s) => s.uid === store.selected) : null
  const occupied = new Map(p.board.map((s) => [s.slot, s]))

  const canDropAt = (slot: number): boolean => {
    if (!selectedStack) return false
    const def = unit(selectedStack.unitId)
    const row = slot < FRONT_SLOTS ? 'front' : 'back'
    if (def.row !== 'any' && def.row !== row) return false
    const occ = occupied.get(slot)
    if (occ && occ.uid !== selectedStack.uid) {
      const occDef = unit(occ.unitId)
      const movingRow = selectedStack.slot < FRONT_SLOTS ? 'front' : 'back'
      if (occDef.row !== 'any' && occDef.row !== movingRow) return false
    }
    return true
  }

  const offerUnitId = offerIndex !== null ? p.camp.offer[offerIndex] : null
  const recruitBlock = (unitId: string | null) => canRecruit(unitId, p.board, p.gold)
  const offerBlock = recruitBlock(offerUnitId)
  const offerStack = offerUnitId ? stackOfUnit(p.board, offerUnitId) : undefined
  const inspectedStack = stackUid ? p.board.find((s) => s.uid === stackUid) : null
  const promo = inspectedStack ? promoteBlock(inspectedStack.unitId, p.camp.tier, p.gold, p.mods) : null

  return (
    <div className="screen">
      <Ladder run={run} onInspect={(id) => store.inspect(id)} />

      <div className="row spread">
        <div>
          <span className="eyebrow">Round {run.round}</span>
          <div className="row" style={{ gap: 6 }}>
            <span style={{ fontWeight: 800 }}>{hero.name}</span>
            <span className="kw">Lv {level}</span>
            <button className="btn btn-sm btn-ghost" onClick={() => setHeroOpen(true)} aria-label="Your hero">
              ⓘ
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => setGlossary(true)} aria-label="Symbols and keywords">
              ?
            </button>
          </div>
        </div>
        {foe && (
          <button className="btn btn-sm" onClick={() => store.setScouting(true)}>
            <Sigil id={HERO_BY_ID.get(foe.heroId)?.sigil ?? 'shield'} size={15} />
            Scout {foe.name.split(' ')[0]}
          </button>
        )}
      </div>

      {/* ── your board ── */}
      <div>
        <div className="row spread" style={{ marginBottom: 5 }}>
          <span className="eyebrow">
            {selectedStack ? 'Tap a glowing slot — or the raised card to cancel' : 'Your warband — tap a stack to inspect'}
          </span>
          <button className="btn btn-sm btn-ghost" onClick={store.autoArrange}>
            Auto-arrange
          </button>
        </div>
        <Board
          board={p.board}
          selected={store.selected}
          canDropAt={canDropAt}
          labels="full"
          rankFlash={store.rankFlash}
          promoteStateOf={promoteStateOf}
          onRowInfo={setRowInfo}
          onStack={(uid) => (store.selected === uid ? store.select(null) : setStackUid(uid))}
          onSlot={(slot) => store.place(slot)}
        />
      </div>

      {/* ── war camp: bottom-anchored, within thumb reach ── */}
      <div className="panel" style={{ display: 'grid', gap: 8, marginTop: 'auto' }}>
        <div className="row spread">
          <span className="eyebrow">War Camp · Tier {p.camp.tier}</span>
          <span className="gold">{p.gold} gold</span>
        </div>

        <div className="offer" style={{ gridTemplateColumns: `repeat(${Math.min(5, Math.max(3, p.camp.offer.length))}, 1fr)` }}>
          {p.camp.offer.map((unitId, i) => (
            <OfferCard
              key={i}
              unitId={unitId}
              block={recruitBlock(unitId)}
              bonusCount={unitId ? musterCount(unit(unitId), p.mods) : 0}
              priority={i < 3}
              onInspect={() => setOfferIndex(i)}
              onRecruit={() => store.buy(i)}
            />
          ))}
        </div>

        <div className="row wrap" style={{ gap: 6 }}>
          <button className="btn btn-sm grow" disabled={p.gold < rCost} onClick={store.reroll}>
            Reroll {rCost === 0 ? 'free' : `${rCost}g`}
          </button>
          <button className="btn btn-sm grow" onClick={store.toggleFreeze}>
            {p.camp.frozen ? '❄ Frozen' : 'Freeze'}
          </button>
          <button className="btn btn-sm grow" disabled={tCost === null || p.gold < tCost} onClick={store.tierUp}>
            {tCost === null ? 'Max Tier' : `Tier ${p.camp.tier + 1} · ${tCost}g`}
          </button>
        </div>
      </div>

      <button className="btn btn-primary" onClick={store.fight}>
        {p.board.length === 0 ? 'Fight with an empty board' : 'Ready — Fight!'}
      </button>

      {/* ── sheets ── */}
      {offerUnitId && (
        <InspectSheet
          unitId={offerUnitId}
          mods={p.mods}
          campTier={p.camp.tier}
          gold={p.gold}
          extra={
            <RankProgress
              unitId={offerUnitId}
              count={offerStack?.count ?? 0}
              rank={offerStack?.rank ?? 0}
              projected={(offerStack?.count ?? 0) + musterCount(unit(offerUnitId), p.mods)}
            />
          }
          onClose={() => setOfferIndex(null)}
          actions={
            <>
              <button
                className="btn btn-gold grow"
                disabled={!offerBlock.ok}
                onClick={() => {
                  store.buy(offerIndex!)
                  setOfferIndex(null)
                }}
              >
                Recruit — {RECRUIT_COST}g
              </button>
              {offerBlock.reason && <div className="tiny dim center grow">{offerBlock.reason}</div>}
            </>
          }
        />
      )}

      {inspectedStack && (
        <InspectSheet
          unitId={inspectedStack.unitId}
          mods={p.mods}
          campTier={p.camp.tier}
          gold={p.gold}
          context={{ count: inspectedStack.count, bonusAtk: inspectedStack.bonusAtk, bonusHp: inspectedStack.bonusHp }}
          extra={<RankProgress unitId={inspectedStack.unitId} count={inspectedStack.count} rank={inspectedStack.rank} />}
          onClose={() => setStackUid(null)}
          actions={
            <>
              <button
                className="btn btn-sm grow"
                onClick={() => {
                  setStackUid(null)
                  store.select(inspectedStack.uid)
                }}
              >
                Move
              </button>
              {promo?.target && (
                <button
                  className="btn btn-sm btn-gold grow"
                  disabled={!promo.ok}
                  title={promo.reason}
                  onClick={() => {
                    store.promote(inspectedStack.uid)
                    setStackUid(null)
                  }}
                >
                  Promote → {promo.target.name} · {promo.cost}g
                </button>
              )}
              <button
                className="btn btn-sm btn-danger"
                onClick={() => {
                  store.sell(inspectedStack.uid)
                  setStackUid(null)
                }}
              >
                Sell +{sellValue(inspectedStack, p.mods)}g
              </button>
            </>
          }
        />
      )}

      {rowInfo && <RowInfoSheet row={rowInfo} onClose={() => setRowInfo(null)} />}
      {store.scouting && foe && <ScoutSheet run={run} foeId={foe.id} onClose={() => store.setScouting(false)} />}
      {store.inspecting && <WarlordSheet run={run} id={store.inspecting} onClose={() => store.inspect(null)} />}
      {heroOpen && <HeroSheet run={run} onClose={() => setHeroOpen(false)} />}
      {glossary && <GlossarySheet onClose={() => setGlossary(false)} />}
      {run.phase === 'levelup' && run.boonOffer.length > 0 && (
        <BoonModal offers={run.boonOffer} level={level} onPick={store.chooseBoon} />
      )}
    </div>
  )
}

// ── board ────────────────────────────────────────────────────────────────

export function Board({
  board,
  selected,
  canDropAt,
  onStack,
  onSlot,
  compact,
  labels = 'none',
  onRowInfo,
  rankFlash,
  promoteStateOf,
}: {
  board: BoardStack[]
  selected?: string | null
  canDropAt?: (slot: number) => boolean
  onStack?: (uid: string) => void
  onSlot?: (slot: number) => void
  compact?: boolean
  /** 'full' = tappable eyebrow labels (Muster), 'tag' = faint corner word */
  labels?: 'full' | 'tag' | 'none'
  onRowInfo?: (row: Row) => void
  /** uid of a stack that just ranked up, for the chevron stamp (§3.3) */
  rankFlash?: string | null
  /** Muster only: flags stacks that can be promoted right now */
  promoteStateOf?: (stack: BoardStack) => PromoteState
}) {
  const bySlot = new Map(board.map((s) => [s.slot, s]))
  const holding = selected !== undefined && selected !== null
  const render = (slots: number[], row: Row) => (
    <div className="board-line" key={row}>
      {labels === 'full' && (
        <button className="row-label" onClick={() => onRowInfo?.(row)}>
          <span className="row-label-name">
            {rowGlyph(row)} {ROW_INFO[row].label}
          </span>
          <span className="row-label-clause"> — {ROW_INFO[row].clause}</span>
          <span className="row-label-info">ⓘ</span>
        </button>
      )}
      <div className="board-row" data-row={row} data-tag={labels === 'tag' ? 'true' : undefined}>
        {labels === 'tag' && <span className="row-tag">{row}</span>}
        {slots.map((slot) => {
          const st = bySlot.get(slot)
          const droppable = canDropAt?.(slot) ?? false
          if (!st) {
            return (
              <div
                key={slot}
                className="slot"
                data-drop={droppable ? 'true' : undefined}
                data-illegal={holding && !droppable ? 'true' : undefined}
                onClick={() => droppable && onSlot?.(slot)}
              >
                {droppable ? (
                  '↓'
                ) : (
                  <span className="slot-hint">
                    <Sigil id={row === 'front' ? 'shield' : 'bow'} size={16} />
                    <span>{row}</span>
                  </span>
                )}
              </div>
            )
          }
          const def = unit(st.unitId)
          const held = selected === st.uid
          // While a stack is held, an occupied slot either swaps (legal) or is
          // inert (illegal) — tapping the held stack itself puts it back down.
          const handle = held
            ? () => onStack?.(st.uid)
            : holding
              ? droppable
                ? () => onSlot?.(slot)
                : undefined
              : onStack
                ? () => onStack(st.uid)
                : undefined
          return (
            <StackCard
              key={slot}
              unitId={st.unitId}
              count={st.count}
              atk={def.atk + st.bonusAtk}
              hp={def.hp + st.bonusHp}
              rank={st.rank}
              rankFlash={rankFlash === st.uid}
              promote={promoteStateOf?.(st) ?? null}
              selected={held}
              illegal={holding && !held && !droppable}
              onClick={handle}
            />
          )
        })}
      </div>
    </div>
  )
  return (
    // Back line on top, front line on the bottom — everywhere in the game
    // (Design Notes 01 §1.3). Your front line sits nearest your thumb, and the
    // enemy's front line sits against the divider, bearing down on you: one
    // reading of the board that transfers straight from Muster to Battle.
    <div className="board" style={compact ? { opacity: 0.95 } : undefined}>
      {render([4, 5, 6], 'back')}
      {render([0, 1, 2, 3], 'front')}
    </div>
  )
}

// ── camp offer card ──────────────────────────────────────────────────────

function OfferCard({
  unitId,
  block,
  bonusCount,
  priority,
  onInspect,
  onRecruit,
}: {
  unitId: string | null
  block: RecruitBlock
  bonusCount: number
  /** the offers visible without scrolling on a small phone */
  priority?: boolean
  onInspect: () => void
  onRecruit: () => void
}) {
  if (!unitId) return <div className="offer-card" data-empty="true" />
  const def = unit(unitId)
  // Tapping the card still only ever opens the Inspect sheet — reading is free
  // and never costs gold. Recruiting is its own explicit button so the common
  // case does not need a round trip through the sheet.
  return (
    <div className="offer-card" style={{ ['--sc' as string]: unitColor(def) }} data-blocked={!block.ok || undefined}>
      <button className="offer-body" onClick={onInspect} aria-label={`Inspect ${def.name}`}>
        <span className="offer-art">
          <Plate src={UNIT_ART[unitId]} priority={priority} fallback={<Sigil id={def.sigil} size={20} />} />
        </span>
        <span className="tier-pip">T{def.tier}</span>
        <span className="row-glyph" aria-hidden="true">
          {rowGlyph(def.row)}
        </span>
        <span className="stack-name">{def.name}</span>
        <span className="chips">
          <span className="chip-atk">{def.atk}</span>
          <span className="dim">/</span>
          <span className="chip-hp">{def.hp}</span>
        </span>
      </button>
      <button
        className="offer-buy"
        disabled={!block.ok}
        onClick={onRecruit}
        title={block.reason}
        aria-label={`Recruit ${def.name} for ${RECRUIT_COST} gold`}
      >
        +{bonusCount} · {RECRUIT_COST}g
      </button>
    </div>
  )
}

// ── sheets ───────────────────────────────────────────────────────────────

function RowInfoSheet({ row, onClose }: { row: Row; onClose: () => void }) {
  const info = ROW_INFO[row]
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>
          {rowGlyph(row)} {info.label}
        </h2>
        <div className="small dim">{info.clause}</div>
        <div className="panel small">{info.text}</div>
        <div className="tiny dim">
          Cards carry the same glyphs: ⚔ front only, ➶ back only, ◈ either row.
        </div>
        <button className="btn btn-primary" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}

function HeroSheet({ run, onClose }: { run: RunState; onClose: () => void }) {
  const p = player(run)
  const hero = HERO_BY_ID.get(p.heroId)!
  const f = FACTION_BY_ID.get(p.factionId)!
  const x = spellPower(hero, heroState(p, run.round))
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <span className="faction-icon" style={{ ['--fc' as string]: f.colors.primary }}>
            <Sigil id={hero.sigil} size={22} />
          </span>
          <div className="grow">
            <h2>
              {hero.name} {hero.title}
            </h2>
            <div className="small dim">
              {f.name} · Level {heroLevel(run.round)}
            </div>
          </div>
        </div>
        <div className="panel small">
          <div className="eyebrow">Passive</div>
          <div>{hero.passive.text}</div>
          <div className="eyebrow" style={{ marginTop: 8 }}>
            {hero.spell.name}
          </div>
          <div>{hero.spell.text.replace(/\bX\b/g, String(x))}</div>
          <div className="tiny dim">Currently X = {x}.</div>
        </div>
        <div className="eyebrow">Boons taken ({p.boonsTaken.length})</div>
        {p.boonsTaken.length === 0 && <div className="small dim">None yet — your first choice comes on round 2.</div>}
        {p.boonsTaken.map((id) => {
          const b = BOON_BY_ID.get(id)
          return b ? (
            <div key={id} className="panel small">
              <span className="boon-branch" style={{ ['--bc' as string]: branchColor(b.branch) }}>
                {b.branch}
              </span>
              <strong style={{ display: 'block' }}>{b.name}</strong>
              <span className="dim">{b.text}</span>
            </div>
          ) : null
        })}
        <button className="btn btn-primary" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}

function ScoutSheet({ run, foeId, onClose }: { run: RunState; foeId: string; onClose: () => void }) {
  const foe = run.warlords.find((w) => w.id === foeId)!
  const hero = HERO_BY_ID.get(foe.heroId)!
  const f = FACTION_BY_ID.get(foe.factionId)!
  const [peek, setPeek] = useState<string | null>(null)
  const peeked = peek ? foe.board.find((s) => s.uid === peek) : null
  return (
    // The inspect sheet is a sibling, not a child: nesting it inside this
    // sheet would let one tap close both.
    <>
      <div className="scrim" onClick={onClose}>
        <div className="sheet" onClick={(e) => e.stopPropagation()}>
          <div className="row">
            <span className="faction-icon" style={{ ['--fc' as string]: f.colors.primary }}>
              <Sigil id={hero.sigil} size={22} />
            </span>
            <div className="grow">
              <h2>{foe.name}</h2>
              <div className="small dim">
                {f.name} · {foe.hp} HP · Camp Tier {foe.camp.tier}
              </div>
            </div>
          </div>
          <div className="small dim">
            {hero.name} — {hero.passive.text}
          </div>
          <div className="eyebrow">Their board right now — tap a stack to inspect</div>
          <Board board={foe.board} compact labels="tag" onStack={setPeek} />
          <button className="btn btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      {peeked && (
        <InspectSheet
          unitId={peeked.unitId}
          context={{ count: peeked.count, bonusAtk: peeked.bonusAtk, bonusHp: peeked.bonusHp }}
          extra={<RankProgress unitId={peeked.unitId} count={peeked.count} rank={peeked.rank} />}
          onClose={() => setPeek(null)}
        />
      )}
    </>
  )
}

function branchColor(b: string): string {
  return b === 'might' ? '#e08a5a' : b === 'magic' ? '#9a7ae0' : '#5ab0a0'
}

function BoonModal({ offers, level, onPick }: { offers: BoonDef[]; level: number; onPick: (id: string) => void }) {
  return (
    <div className="scrim">
      <div className="sheet">
        <div className="center">
          <div className="eyebrow">Level {level}</div>
          <h2>Choose a boon</h2>
        </div>
        {offers.map((b) => (
          <button key={b.id} className="boon" style={{ ['--bc' as string]: branchColor(b.branch) }} onClick={() => onPick(b.id)}>
            <span className="boon-branch">
              {b.branch}
              {b.capstone ? ' · capstone' : ''}
            </span>
            <strong>{b.name}</strong>
            <span className="small dim">{b.text}</span>
          </button>
        ))}
        <div className="center tiny dim">Boons are permanent for this run.</div>
      </div>
    </div>
  )
}
