import { useState } from 'react'
import { UNIT_ART } from '../data/art'
import { BOON_BY_ID, FACTION_BY_ID, HERO_BY_ID, unit } from '../data/index'
import { addMods, type BoonBranch, type BoonDef, type FactionId, type HeroDef, type HeroMods, type Row } from '../data/types'
import {
  FRONT_SLOTS,
  rowOfSlot,
  spellCadence,
  spellCasts,
  spellPower,
  spellTargets,
  stackStats,
  type BoardStack,
  type HeroState,
} from '../engine/battle'
import {
  canPromote,
  firstOpenSlot,
  promoteCost,
  recruitPlan,
  rerollCost,
  RECRUIT_COST,
  sellValue,
  tierUpCost,
  type RecruitPlan,
} from '../engine/camp'
import { heroLevel } from '../engine/boons'
import { opponentOf, player, type RunState } from '../engine/run'
import { useGame } from '../state/store'
import { InspectSheet, RankProgress, promoteBlock } from './InspectSheet'
import { GlossarySheet } from './Glossary'
import { HeroSheet, PathColumns, branchColor, branchPicks, pathTitle } from './HeroSheet'
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
    text: 'Four slots, shown at the top of your board — nearest the enemy. Enemy melee always strikes your front line first, so these stacks absorb the battle. Put your tough, high-count units here; they buy your back line the time it needs.',
  },
  back: {
    label: 'BACK LINE',
    clause: 'ranged, protected',
    text: 'Three slots, tucked behind your front line at the bottom of your board. Enemy melee cannot reach them until your front line is empty. They are not immune, though: Volley and Siege units, and hero spells, reach the back line at any time. Put ranged and support stacks here.',
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
export function canRecruit(unitId: string | null, board: BoardStack[], gold: number, mods: HeroMods): RecruitBlock {
  if (!unitId) return { ok: false }
  if (gold < RECRUIT_COST) return { ok: false, reason: `Costs ${RECRUIT_COST}g — you have ${gold}.` }
  const def = unit(unitId)
  // The plan, not just "do I own this line": buying a form ahead of anything
  // on the board starts its own stack, so it needs a slot (DN04 §1.2).
  if (recruitPlan(board, unitId, mods).target || firstOpenSlot(board, def) !== null) return { ok: true }
  return { ok: false, reason: `No open ${def.row === 'any' ? '' : `${def.row} `}slot — sell or move something first.` }
}

/**
 * What the buy button says out loud (§1.3). "+2 → Footmen" when the recruits
 * train up into a stack you already field, "+4 NEW" when they start their own.
 * No hidden math — the button is the tutorial.
 */
export function buyLabel(plan: RecruitPlan): { text: string; sub: string | null } {
  if (!plan.target) return { text: `+${plan.added} NEW`, sub: null }
  // Joining a stack of the form you are looking at needs no second name — the
  // card above the button already says it.
  if (plan.stepsBehind === 0) return { text: `+${plan.added}`, sub: null }
  return { text: `+${plan.added} →`, sub: unit(plan.formId).name }
}

export function MusterScreen({ run }: { run: RunState }) {
  const store = useGame()
  const p = player(run)
  const [heroOpen, setHeroOpen] = useState(false)
  const [glossary, setGlossary] = useState(false)
  const [rowInfo, setRowInfo] = useState<Row | null>(null)
  const [offerIndex, setOfferIndex] = useState<number | null>(null)
  const [stackUid, setStackUid] = useState<string | null>(null)
  /** the one-second beat after a boon lands: what it visibly changed (§2.2) */
  const [boonFx, setBoonFx] = useState<Record<string, string>>({})
  const [campFx, setCampFx] = useState<string | null>(null)
  /** uid whose promotion is one confirm away, straight from the board (§8) */
  const [promoteUid, setPromoteUid] = useState<string | null>(null)
  const [pathToast, setPathToast] = useState<{ branch: BoonBranch; title: string } | null>(null)
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
  // Out of battle the pips show what the stack will START each battle with.
  const coverWith = (stack: BoardStack, mods: HeroMods): number => {
    if (stack.slot >= FRONT_SLOTS) return 0
    const k = unit(stack.unitId).keywords.find((x) => x.k === 'cover')
    return (k ? (k.x ?? 1) : 0) + mods.frontCover
  }
  const coverOf = (stack: BoardStack): number => coverWith(stack, p.mods)

  const promoteStateOf = (stack: BoardStack): PromoteState => {
    const target = canPromote(stack, p.camp)
    if (!target) return null
    return p.gold >= promoteCost(target, p.mods) ? 'ready' : 'soon'
  }

  /**
   * Pick a boon and *show* it. The deltas are worked out from the boon's own
   * mods rather than by re-reading the store, so the floats are on screen in
   * the same frame the modal closes — the rule is that every pick visibly
   * touches the thing it changed within a second (§2.2).
   */
  const pickBoon = (id: string) => {
    const boon = BOON_BY_ID.get(id)
    const fx: Record<string, string> = {}
    if (boon) {
      const after = addMods(p.mods, boon.mods)
      const taken = [...p.boonsTaken, id]
      for (const st of p.board) {
        const row = rowOfSlot(st.slot)
        const b0 = stackStats(st, row, p.mods, p.boonsTaken)
        const b1 = stackStats(st, row, after, taken)
        const bits: string[] = []
        if (b1.atk !== b0.atk) bits.push(`${b1.atk > b0.atk ? '+' : ''}${b1.atk - b0.atk} ATK`)
        if (b1.hp !== b0.hp) bits.push(`${b1.hp > b0.hp ? '+' : ''}${b1.hp - b0.hp} HP`)
        // Cover is a number on the card too, so Overwatch has to land on the
        // front line rather than falling through to the War Camp.
        const dc = coverWith(st, after) - coverWith(st, p.mods)
        if (dc !== 0) bits.push(`${dc > 0 ? '+' : ''}${dc} Cover`)
        if (bits.length > 0) fx[st.uid] = bits.join(' ')
      }
    }
    store.chooseBoon(id)
    // "Your Magic is now Expert" — the pick advances a named rank (§11).
    if (boon) {
      const to = pathTitle(branchPicks(p.boonsTaken)[boon.branch] + 1)
      setPathToast({ branch: boon.branch, title: to })
      window.setTimeout(() => setPathToast(null), 1900)
    }
    // A boon that changes what you can *buy* has nothing on the board to touch,
    // so it floats over the War Camp — the thing it actually changed.
    setBoonFx(fx)
    setCampFx(Object.keys(fx).length === 0 && boon ? boon.name : null)
    window.setTimeout(() => {
      setBoonFx({})
      setCampFx(null)
    }, 1100)
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
  const recruitBlock = (unitId: string | null) => canRecruit(unitId, p.board, p.gold, p.mods)
  const planFor = (unitId: string | null) => (unitId ? recruitPlan(p.board, unitId, p.mods) : null)
  const offerBlock = recruitBlock(offerUnitId)
  const offerPlan = planFor(offerUnitId)
  const inspectedStack = stackUid ? p.board.find((s) => s.uid === stackUid) : null
  const promo = inspectedStack ? promoteBlock(inspectedStack.unitId, p.camp.tier, p.gold, p.mods) : null
  const promoteStack = promoteUid ? p.board.find((s) => s.uid === promoteUid) : null
  const promoteTarget = promoteStack ? promoteBlock(promoteStack.unitId, p.camp.tier, p.gold, p.mods) : null

  return (
    <div className="screen">
      <div className="screen-body">
      <Ladder run={run} onInspect={(id) => store.inspect(id)} />

      {/* One header row, not two: every line here costs the camp height it
          needs to keep Tier-up on screen. */}
      <div className="row spread muster-head">
        <div className="grow" style={{ minWidth: 0 }}>
          <span className="eyebrow">Round {run.round}</span>
          <div className="row" style={{ gap: 5 }}>
            {/* Just the name a player uses: the full title lives in the sheet,
                and a truncated "Thane Be…" reads worse than "Berrik". */}
            <span className="muster-hero">{hero.name.split(' ').slice(-1)[0]}</span>
            <span className="kw">Lv {level}</span>
            <button className="btn btn-sm btn-ghost" onClick={() => setHeroOpen(true)} aria-label="Your hero">
              ⓘ
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => setGlossary(true)} aria-label="Symbols and keywords">
              ?
            </button>
            <button className="btn btn-sm btn-ghost" onClick={store.autoArrange} aria-label="Auto-arrange your board">
              ⇄
            </button>
          </div>
          <BoonStrip ids={p.boonsTaken} onOpen={() => setHeroOpen(true)} />
        </div>
        {foe && (
          <button className="btn btn-sm" onClick={() => store.setScouting(true)}>
            <Sigil id={HERO_BY_ID.get(foe.heroId)?.sigil ?? 'shield'} size={15} />
            <span className="scout-name">Scout</span>
          </button>
        )}
      </div>

      {/* ── your board ── */}
      <div>
        <Board
          board={p.board}
          selected={store.selected}
          canDropAt={canDropAt}
          labels="full"
          rankFlash={store.rankFlash}
          promoteStateOf={promoteStateOf}
          coverOf={coverOf}
          owner={p}
          boonFx={boonFx}
          onPromoteTap={(uid) => setPromoteUid(uid)}
          onRowInfo={setRowInfo}
          onStack={(uid) => (store.selected === uid ? store.select(null) : setStackUid(uid))}
          onSlot={(slot) => store.place(slot)}
        />
      </div>

      {/* ── war camp: bottom-anchored, within thumb reach ── */}
      <div className="panel camp-panel">
        {campFx && <span className="float float-buff camp-float">{campFx}</span>}
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
              plan={planFor(unitId)}
              priority={i < 3}
              onInspect={() => setOfferIndex(i)}
              onRecruit={() => store.buy(i)}
            />
          ))}
        </div>

        <div className="row wrap" style={{ gap: 6 }}>
          <button className="btn btn-sm grow btn-quiet" disabled={p.gold < rCost} onClick={store.reroll}>
            Reroll {rCost === 0 ? 'free' : `${rCost}g`}
          </button>
          <button className="btn btn-sm grow btn-quiet" onClick={store.toggleFreeze}>
            {p.camp.frozen ? '❄ Frozen' : 'Freeze'}
          </button>
        </div>

        <TierUpButton tier={p.camp.tier} cost={tCost} gold={p.gold} onBuy={store.tierUp} />
      </div>
      </div>

      <div className="action-bar">
        <button className="btn btn-primary" onClick={store.fight}>
          {p.board.length === 0 ? 'Fight with an empty board' : 'Ready — Fight!'}
        </button>
      </div>

      {/* ── sheets ── */}
      {offerUnitId && (
        <InspectSheet
          unitId={offerUnitId}
          mods={p.mods}
          campTier={p.camp.tier}
          gold={p.gold}
          extra={
            <RankProgress
              // The rank bar has to project the CONVERTED intake, or the sheet
              // promises a threshold the purchase will not reach (§1.3).
              unitId={offerPlan?.formId ?? offerUnitId}
              count={offerPlan?.target?.count ?? 0}
              rank={offerPlan?.target?.rank ?? 0}
              projected={(offerPlan?.target?.count ?? 0) + (offerPlan?.added ?? 0)}
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
                {offerPlan?.target
                  ? `Recruit +${offerPlan.added} ${unit(offerPlan.formId).name} — ${RECRUIT_COST}g`
                  : `Recruit +${offerPlan?.added ?? 0} new stack — ${RECRUIT_COST}g`}
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
          context={{
            count: inspectedStack.count,
            stats: stackStats(inspectedStack, rowOfSlot(inspectedStack.slot), p.mods, p.boonsTaken),
          }}
          extra={<RankProgress unitId={inspectedStack.unitId} count={inspectedStack.count} rank={inspectedStack.rank} />}
          onClose={() => setStackUid(null)}
          onPromote={
            promo?.target
              ? () => {
                  store.promote(inspectedStack.uid)
                  setStackUid(null)
                }
              : undefined
          }
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

      {promoteStack && promoteTarget?.target && (
        <>
          <div className="scrim" onClick={() => setPromoteUid(null)} />
          <div className="promote-pop">
            <div className="row">
              <span className="promote-face">
                <Plate
                  src={UNIT_ART[promoteTarget.target.id]}
                  eager
                  fallback={<Sigil id={promoteTarget.target.sigil} size={16} />}
                />
              </span>
              <div className="grow">
                <strong>{promoteTarget.target.name}</strong>
                <div className="tiny dim">
                  {unit(promoteStack.unitId).name} · {promoteStack.count} strong
                  {promoteTarget.reason ? ` — ${promoteTarget.reason}` : ''}
                </div>
              </div>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-sm grow btn-quiet" onClick={() => setPromoteUid(null)}>
                Not yet
              </button>
              <button
                className="btn btn-sm btn-gold grow"
                disabled={!promoteTarget.ok}
                onClick={() => {
                  store.promote(promoteStack.uid)
                  setPromoteUid(null)
                }}
              >
                Promote · {promoteTarget.cost}g
              </button>
            </div>
          </div>
        </>
      )}

      {rowInfo && <RowInfoSheet row={rowInfo} onClose={() => setRowInfo(null)} />}
      {store.scouting && foe && <ScoutSheet run={run} foeId={foe.id} onClose={() => store.setScouting(false)} />}
      {store.inspecting && <WarlordSheet run={run} id={store.inspecting} onClose={() => store.inspect(null)} />}
      {heroOpen && <HeroSheet warlord={p} round={run.round} onClose={() => setHeroOpen(false)} />}
      {glossary && <GlossarySheet onClose={() => setGlossary(false)} />}
      {pathToast && (
        <div className="path-toast" style={{ ['--bc' as string]: branchColor(pathToast.branch) }} role="status">
          Your {pathToast.branch} is now <strong>{pathToast.title}</strong>
        </div>
      )}
      {run.phase === 'levelup' && run.boonOffer.length > 0 && (
        <BoonModal
          offers={run.boonOffer}
          level={level}
          hero={hero}
          mods={p.mods}
          round={run.round}
          taken={p.boonsTaken}
          onPick={pickBoon}
        />
      )}
    </div>
  )
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V']

/**
 * Camp Tier is one of the biggest decisions in the game and used to dress like
 * Reroll and Freeze (Design Notes 04 §6). It gets its own banner: the tier you
 * are buying as a Roman numeral on a shield, the cost, and a pulse ONLY when
 * you can actually afford it — so the pulse means "go", not "look at me".
 */
function TierUpButton({ tier, cost, gold, onBuy }: { tier: number; cost: number | null; gold: number; onBuy: () => void }) {
  const [flash, setFlash] = useState(false)
  if (cost === null) {
    return (
      <div className="tier-up" data-max="true">
        <span className="tier-shield">{ROMAN[tier]}</span>
        <span className="tier-body">
          <span className="tier-title">Camp Tier {ROMAN[tier]}</span>
          <span className="tier-sub">The camp can grow no further.</span>
        </span>
      </div>
    )
  }
  const afford = gold >= cost
  return (
    <button
      className="tier-up"
      data-afford={afford ? 'true' : undefined}
      data-flash={flash ? 'true' : undefined}
      disabled={!afford}
      onClick={() => {
        setFlash(true)
        window.setTimeout(() => setFlash(false), 450)
        onBuy()
      }}
    >
      <span className="tier-shield">{ROMAN[tier + 1]}</span>
      <span className="tier-body">
        <span className="tier-title">Raise the War Camp</span>
        <span className="tier-sub">Tier {ROMAN[tier + 1]} unlocks its recruits</span>
      </span>
      <span className="tier-cost">{cost}g</span>
    </button>
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
  coverOf,
  owner,
  boonFx,
  onPromoteTap,
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
  /** Muster only: Cover charges this stack starts each battle with */
  coverOf?: (stack: BoardStack) => number
  /** whose army this is — without it the cards print base stats only (§2.1) */
  owner?: { mods: HeroMods; boonsTaken: string[] }
  /** uid → float text, for the beat right after a boon lands (§2.2) */
  boonFx?: Record<string, string>
  /** Muster only: tapping a card's gold chevron promotes it in one step (§8) */
  onPromoteTap?: (uid: string) => void
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
          // The slot decides the row, not the unit's preference: a Row-any unit
          // standing in the back gets the back-row boons, exactly as in battle.
          const stats = owner ? stackStats(st, rowOfSlot(slot), owner.mods, owner.boonsTaken) : null
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
              atk={stats ? stats.atk : def.atk + st.bonusAtk}
              hp={stats ? stats.hp : def.hp + st.bonusHp}
              atkBuffed={(stats ? stats.atk : def.atk + st.bonusAtk) > def.atk}
              hpBuffed={(stats ? stats.hp : def.hp + st.bonusHp) > def.hp}
              float={boonFx?.[st.uid] ? { text: boonFx[st.uid], kind: 'buff' } : null}
              rank={st.rank}
              rankFlash={rankFlash === st.uid}
              promote={promoteStateOf?.(st) ?? null}
              onPromoteTap={onPromoteTap && promoteStateOf?.(st) ? () => onPromoteTap(st.uid) : undefined}
              cover={coverOf?.(st) ?? 0}
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
    // Front line on top, back line below it — mirroring your half of the
    // battlefield exactly (Design Notes 03 §3, correcting DN01 §1.3). DN01 put
    // the back line on top everywhere, which drew the enemy's front line
    // bearing down on YOUR back line and implied the back row was the wall.
    <div className="board" style={compact ? { opacity: 0.95 } : undefined}>
      {render([0, 1, 2, 3], 'front')}
      {render([4, 5, 6], 'back')}
    </div>
  )
}

// ── camp offer card ──────────────────────────────────────────────────────

function OfferCard({
  unitId,
  block,
  plan,
  priority,
  onInspect,
  onRecruit,
}: {
  unitId: string | null
  block: RecruitBlock
  /** exactly what this purchase will do, straight from the engine */
  plan: RecruitPlan | null
  /** the offers visible without scrolling on a small phone */
  priority?: boolean
  onInspect: () => void
  onRecruit: () => void
}) {
  if (!unitId || !plan) return <div className="offer-card" data-empty="true" />
  const def = unit(unitId)
  const label = buyLabel(plan)
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
        aria-label={
          plan.target
            ? `Recruit: adds ${plan.added} to your ${unit(plan.formId).name} stack for ${RECRUIT_COST} gold`
            : `Recruit ${def.name}: starts a new stack of ${plan.added} for ${RECRUIT_COST} gold`
        }
      >
        {/* One line: a second line here costs every offer card 14px of height,
            and the height budget is what keeps the camp on screen. */}
        <span className="buy-main">{label.text}</span>
        {label.sub && <span className="buy-sub">{label.sub}</span>}
        <span className="buy-cost">{RECRUIT_COST}g</span>
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
          <RangedThreat board={foe.board} />
          <div className="eyebrow">Their board right now — tap a stack to inspect</div>
          <Board board={foe.board} compact labels="tag" owner={foe} onStack={setPeek} />
          <button className="btn btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      {peeked && (
        <InspectSheet
          unitId={peeked.unitId}
          context={{ count: peeked.count, stats: stackStats(peeked, rowOfSlot(peeked.slot), foe.mods, foe.boonsTaken) }}
          extra={<RankProgress unitId={peeked.unitId} count={peeked.count} rank={peeked.rank} />}
          onClose={() => setPeek(null)}
        />
      )}
    </>
  )
}

/**
 * What their board can do to your back line (§3.4). This is the line that
 * turns "my shaman died at random" into "I saw three volleys coming and put
 * the Shieldmaiden in front of him".
 */
function RangedThreat({ board }: { board: BoardStack[] }) {
  let volley = 0
  let siege = 0
  for (const st of board) {
    const def = unit(st.unitId)
    if (def.keywords.some((k) => k.k === 'siege')) siege++
    else if (def.keywords.some((k) => k.k === 'volley')) volley++
  }
  const none = volley === 0 && siege === 0
  return (
    <div className="threat-line">
      <span className="threat-label">Ranged threat</span>
      {none ? (
        <span className="small dim">nothing on that board shoots over your front line.</span>
      ) : (
        <span className="small">
          {volley > 0 && (
            <>
              <strong>{volley}</strong> volley stack{volley === 1 ? '' : 's'}
            </>
          )}
          {volley > 0 && siege > 0 && ', '}
          {siege > 0 && (
            <>
              <strong>{siege}</strong> siege
            </>
          )}
          <span className="dim">
            {siege > 0 ? ' — siege ignores Cover.' : ' — Cover can intercept these.'}
          </span>
        </span>
      )}
    </div>
  )
}

/**
 * Boons the run has accumulated, kept on screen instead of buried in a sheet
 * nobody opens (§2.3). One dot per boon, coloured by branch; tap for the sheet.
 */
function BoonStrip({ ids, onOpen }: { ids: string[]; onOpen: () => void }) {
  if (ids.length === 0) return null
  const picks = branchPicks(ids)
  // Grouped by branch with its rank (§11) — the strip should read as three
  // paths you are walking, not a pile of icons in pick order.
  return (
    <button className="boon-strip" onClick={onOpen} aria-label={`Boons taken — open hero sheet`}>
      {(['might', 'magic', 'command'] as BoonBranch[])
        .filter((b) => picks[b] > 0)
        .map((branch) => (
          <span key={branch} className="strip-group" style={{ ['--bc' as string]: branchColor(branch) }}>
            <i>{BRANCH_GLYPH[branch]}</i>
            <b>{pathTitle(picks[branch])}</b>
          </span>
        ))}
    </button>
  )
}

const BRANCH_GLYPH: Record<BoonBranch, string> = { might: '\u2694', magic: '\u2726', command: '\u25c8' }

/** How each spell's X reads in a preview line (§2.4). */
const SPELL_VERB: Record<string, string> = {
  shieldLowest: 'shields',
  rallyAtk: 'grants',
  healMostWounded: 'heals',
  root: 'roots for',
  chainLightning: 'deals',
  extraAttack: 'strikes',
}

/**
 * Magic boons buff a spell the player has never seen a number for, so the card
 * shows the before → after it is buying (§2.4). Same numbers the battle banner
 * then proves — pick, preview, proof.
 */
function MagicPreview({ hero, mods, round, boon }: { hero: HeroDef; mods: HeroMods; round: number; boon: BoonDef }) {
  const base: HeroState = { heroId: hero.id, name: hero.name, factionId: hero.faction as FactionId, level: heroLevel(round), mods }
  const next: HeroState = { ...base, mods: addMods(mods, boon.mods) }
  const bits: string[] = []
  const pair = <T,>(a: T, b: T, text: (a: T, b: T) => string) => {
    if (a !== b) bits.push(text(a, b))
  }
  pair(spellPower(hero, base), spellPower(hero, next), (a, b) => `${SPELL_VERB[hero.spell.id] ?? 'is'} ${a} \u2192 ${b}`)
  pair(spellCasts(hero, base), spellCasts(hero, next), (a, b) => `casts ${a}\u00d7 \u2192 ${b}\u00d7`)
  pair(spellCadence(hero, base), spellCadence(hero, next), (a, b) => `every ${a} \u2192 ${b} exchanges`)
  pair(spellTargets(hero, base), spellTargets(hero, next), (a, b) => `${a} \u2192 ${b} targets`)
  if (bits.length === 0) return null
  return (
    <span className="boon-preview">
      {hero.spell.name}: {bits.join(', ')}
    </span>
  )
}

function BoonModal({
  offers,
  level,
  hero,
  mods,
  round,
  taken,
  onPick,
}: {
  offers: BoonDef[]
  level: number
  hero: HeroDef
  mods: HeroMods
  round: number
  taken: string[]
  onPick: (id: string) => void
}) {
  const picks = branchPicks(taken)
  return (
    <div className="scrim">
      <div className="sheet">
        <div className="center">
          <div className="eyebrow">Level {level}</div>
          <h2>Choose a path</h2>
        </div>
        <PathColumns boonsTaken={taken} />
        {offers.map((b) => (
          <button key={b.id} className="boon" style={{ ['--bc' as string]: branchColor(b.branch) }} onClick={() => onPick(b.id)}>
            <span className="boon-branch">
              {b.branch}
              {b.capstone ? ' \u00b7 capstone' : ''}
            </span>
            <span className="boon-advance">
              advances {b.branch} to {pathTitle(picks[b.branch] + 1)}
            </span>
            <strong>{b.name}</strong>
            <span className="small dim">{b.text}</span>
            {b.branch === 'magic' && <MagicPreview hero={hero} mods={mods} round={round} boon={b} />}
          </button>
        ))}
        <div className="center tiny dim">Boons are permanent for this run.</div>
      </div>
    </div>
  )
}
