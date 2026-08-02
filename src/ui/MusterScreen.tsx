import { useState } from 'react'
import { BOON_BY_ID, FACTION_BY_ID, HERO_BY_ID, unit } from '../data/index'
import type { BoonDef } from '../data/types'
import { FRONT_SLOTS, type BoardStack } from '../engine/battle'
import { canPromote, musterCount, promoteCost, rerollCost, RECRUIT_COST, sellValue, tierUpCost } from '../engine/camp'
import { heroLevel } from '../engine/boons'
import { opponentOf, player, type RunState } from '../engine/run'
import { useGame } from '../state/store'
import { Ladder, WarlordSheet } from './Ladder'
import { Sigil } from './Sigil'
import { StackCard, unitColor } from './StackCard'

export function MusterScreen({ run }: { run: RunState }) {
  const store = useGame()
  const p = player(run)
  const [detail, setDetail] = useState<string | null>(null)
  const foeId = opponentOf(run, p.id)
  const foe = foeId ? run.warlords.find((w) => w.id === foeId) : null
  const rCost = rerollCost(p.camp, p.mods)
  const tCost = tierUpCost(p.camp, p.mods)
  const level = heroLevel(run.round)
  const hero = HERO_BY_ID.get(p.heroId)!

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

  return (
    <div className="screen">
      <Ladder run={run} onInspect={(id) => store.inspect(id)} />

      <div className="row spread">
        <div>
          <span className="eyebrow">Round {run.round}</span>
          <div className="row" style={{ gap: 6 }}>
            <span style={{ fontWeight: 800 }}>{hero.name}</span>
            <span className="kw">Lv {level}</span>
            <button className="btn btn-sm btn-ghost" onClick={() => setDetail('hero')}>
              ⓘ
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
          <span className="eyebrow">Your warband{selectedStack ? ' — tap a slot to place' : ''}</span>
          <button className="btn btn-sm btn-ghost" onClick={store.autoArrange}>
            Auto-arrange
          </button>
        </div>
        <Board
          board={p.board}
          selected={store.selected}
          canDropAt={canDropAt}
          onStack={(uid) => (store.selected === uid ? setDetail(uid) : store.select(uid))}
          onSlot={(slot) => store.place(slot)}
        />
      </div>

      {selectedStack && <StackActions run={run} stack={selectedStack} onDetail={() => setDetail(selectedStack.uid)} />}

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
              affordable={p.gold >= RECRUIT_COST}
              bonusCount={unitId ? musterCount(unit(unitId), p.mods) : 0}
              onBuy={() => store.buy(i)}
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

      {store.scouting && foe && <ScoutSheet run={run} foeId={foe.id} onClose={() => store.setScouting(false)} />}
      {store.inspecting && <WarlordSheet run={run} id={store.inspecting} onClose={() => store.inspect(null)} />}
      {detail === 'hero' && <HeroSheet run={run} onClose={() => setDetail(null)} />}
      {detail && detail !== 'hero' && (
        <UnitSheet uid={detail} run={run} onClose={() => setDetail(null)} />
      )}
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
}: {
  board: BoardStack[]
  selected?: string | null
  canDropAt?: (slot: number) => boolean
  onStack?: (uid: string) => void
  onSlot?: (slot: number) => void
  compact?: boolean
}) {
  const bySlot = new Map(board.map((s) => [s.slot, s]))
  const render = (slots: number[], row: 'front' | 'back') => (
    <div className="board-row" data-row={row}>
      {slots.map((slot) => {
        const st = bySlot.get(slot)
        const droppable = canDropAt?.(slot) ?? false
        if (!st) {
          return (
            <div
              key={slot}
              className="slot"
              data-drop={droppable ? 'true' : undefined}
              onClick={() => droppable && onSlot?.(slot)}
            >
              {droppable ? '↓' : ''}
            </div>
          )
        }
        const def = unit(st.unitId)
        // With a stack held, tapping an occupied slot swaps the two;
        // otherwise it picks this stack up (or opens it, if already held).
        const swap = droppable && selected !== undefined && selected !== null && selected !== st.uid
        const handle = swap ? () => onSlot?.(slot) : onStack ? () => onStack(st.uid) : undefined
        return (
          <StackCard
            key={slot}
            unitId={st.unitId}
            count={st.count}
            atk={def.atk + st.bonusAtk}
            hp={def.hp + st.bonusHp}
            selected={selected === st.uid}
            onClick={handle}
          />
        )
      })}
    </div>
  )
  return (
    <div className="board" style={compact ? { opacity: 0.95 } : undefined}>
      {render([4, 5, 6], 'back')}
      {render([0, 1, 2, 3], 'front')}
    </div>
  )
}

// ── camp offer card ──────────────────────────────────────────────────────

function OfferCard({
  unitId,
  affordable,
  bonusCount,
  onBuy,
}: {
  unitId: string | null
  affordable: boolean
  bonusCount: number
  onBuy: () => void
}) {
  if (!unitId) return <div className="offer-card" data-empty="true" />
  const def = unit(unitId)
  return (
    <button className="offer-card" style={{ ['--sc' as string]: unitColor(def) }} disabled={!affordable} onClick={onBuy}>
      <span className="tier-pip">T{def.tier}</span>
      <Sigil id={def.sigil} size={20} />
      <span className="stack-name">{def.name}</span>
      <span className="chips">
        <span className="chip-atk">{def.atk}</span>
        <span className="dim">/</span>
        <span className="chip-hp">{def.hp}</span>
      </span>
      <span className="tiny gold">+{bonusCount} · 3g</span>
    </button>
  )
}

// ── selected stack actions ───────────────────────────────────────────────

function StackActions({ run, stack, onDetail }: { run: RunState; stack: BoardStack; onDetail: () => void }) {
  const store = useGame()
  const p = player(run)
  const def = unit(stack.unitId)
  const target = canPromote(stack, p.camp)
  const pCost = target ? promoteCost(target, p.mods) : null
  return (
    <div className="panel row wrap" style={{ gap: 6, padding: 8 }}>
      <span className="grow small">
        <strong>{def.name}</strong> ×{stack.count}
      </span>
      <button className="btn btn-sm" onClick={onDetail}>
        Details
      </button>
      {target && pCost !== null && (
        <button className="btn btn-sm btn-gold" disabled={p.gold < pCost} onClick={() => store.promote(stack.uid)}>
          Promote → {target.name} · {pCost}g
        </button>
      )}
      <button className="btn btn-sm btn-danger" onClick={() => store.sell(stack.uid)}>
        Sell +{sellValue(stack, p.mods)}g
      </button>
      <button className="btn btn-sm btn-ghost" onClick={() => store.select(null)}>
        Cancel
      </button>
    </div>
  )
}

// ── sheets ───────────────────────────────────────────────────────────────

function keywordText(k: { k: string; x?: number }): string {
  const map: Record<string, string> = {
    bulwark: 'Bulwark — soaks damage from each attack, then wears down by 1.',
    charge: 'Charge — acts first on the opening cycle.',
    volley: 'Volley — ranged; never provokes retaliation.',
    siege: 'Siege — ignores Bulwark entirely.',
    guard: 'Guard — grants Bulwark to the adjacent stack.',
    cleave: 'Cleave — overkill damage spills into an adjacent stack.',
    venom: 'Venom — the target loses units when it next acts.',
    lifesteal: 'Lifesteal — heals this stack for half the damage dealt.',
    deathcry: 'Deathcry — triggers an effect on death.',
    growth: 'Growth — permanent stats every Muster this stack survives.',
    frenzy: 'Frenzy — gains ATK whenever it takes casualties and survives.',
    summon: 'Summon — adds a stack mid-battle.',
  }
  return `${k.k[0].toUpperCase()}${k.k.slice(1)}${k.x ? ` ${k.x}` : ''} · ${map[k.k] ?? ''}`
}

function UnitSheet({ uid, run, onClose }: { uid: string; run: RunState; onClose: () => void }) {
  const p = player(run)
  const stack = p.board.find((s) => s.uid === uid)
  if (!stack) return null
  const def = unit(stack.unitId)
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
              Tier {def.tier} · {def.row} row · Initiative {def.init} · +{def.musterSize} per purchase
            </div>
          </div>
        </div>
        <div className="row" style={{ gap: 14 }}>
          <span>
            <span className="eyebrow">ATK</span>
            <div className="chip-atk" style={{ fontSize: 22, fontWeight: 800 }}>
              {def.atk + stack.bonusAtk}
            </div>
          </span>
          <span>
            <span className="eyebrow">HP</span>
            <div className="chip-hp" style={{ fontSize: 22, fontWeight: 800 }}>
              {def.hp + stack.bonusHp}
            </div>
          </span>
          <span>
            <span className="eyebrow">Count</span>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{stack.count}</div>
          </span>
          <span className="grow">
            <span className="eyebrow">Stack damage</span>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{(def.atk + stack.bonusAtk) * stack.count}</div>
          </span>
        </div>
        {def.keywords.length > 0 && (
          <div className="panel small" style={{ display: 'grid', gap: 5 }}>
            {def.keywords.map((k) => (
              <div key={k.k}>{keywordText(k)}</div>
            ))}
          </div>
        )}
        {def.ability && <div className="panel small">{def.ability.text}</div>}
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
          <div>{hero.spell.text}</div>
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
  return (
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
        <div className="eyebrow">Their board right now</div>
        <Board board={foe.board} compact />
        <button className="btn btn-primary" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
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
