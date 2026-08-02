import { useEffect, useMemo, useRef, useState } from 'react'
import { FACTION_BY_ID, unit } from '../data/index'
import type { BattleEvent, BattleResult, StackSnap } from '../engine/battle'
import { player, type RunState } from '../engine/run'
import { useGame } from '../state/store'
import { Ladder } from './Ladder'
import { SnapCard } from './StackCard'

/**
 * The renderer is a projector over `result.events` — it never computes an
 * outcome (§12.3 rule 2). Each event carries the resulting snapshot of the
 * stacks it touched, so replaying is just "apply snap, show a flourish".
 */

interface Frame {
  boards: Record<string, StackSnap>
  /** transient per-stack effects for this frame */
  fx: Record<string, { state?: 'hit' | 'act' | 'dead'; float?: { text: string; kind: 'dmg' | 'heal' | 'buff' | 'soak' } }>
  banner: string | null
  line: string
}

const BASE_MS = 620

function describe(e: BattleEvent, playerIsA: boolean): string {
  const side = (s: 'a' | 'b') => (s === 'a') === playerIsA
  switch (e.t) {
    case 'battleStart':
      return 'The warbands close.'
    case 'passive':
      return e.text
    case 'attack': {
      const name = (uid: string, fallback: string) => {
        const s = e.snap.find((x) => x.uid === uid)
        return s ? unit(s.unitId).name : fallback
      }
      const src = name(e.src, 'A stack')
      const dst = name(e.dst, 'the enemy')
      const verb = e.retaliation ? 'retaliates against' : 'strikes'
      if (e.dmg === 0 && e.absorbed > 0) return `${src} ${verb} ${dst} — ${e.absorbed} absorbed by Bulwark.`
      return `${src} ${verb} ${dst} for ${e.dmg}${e.killed > 0 ? `, ${e.killed} slain` : ''}.`
    }
    case 'spellCast':
      return `${side(e.side) ? 'Your' : 'Enemy'} hero casts ${e.name}`
    case 'frenzy':
      return 'Frenzy! +ATK'
    case 'lastStand':
      return 'Last Stand — one unit holds the line.'
    case 'root':
      return 'Rooted — it cannot act.'
    case 'venom':
      return 'Venom courses through the ranks.'
    case 'heal':
      return 'Healed.'
    case 'cleave':
      return 'Cleave!'
    case 'death':
      return 'A stack is wiped out.'
    case 'summon':
      return 'Reinforcements arrive.'
    case 'buff':
      return e.text
    case 'battleEnd':
      return e.winner === 'tie' ? 'A standstill.' : side(e.winner) ? 'Victory!' : 'Defeat.'
  }
}

function buildFrames(result: BattleResult, playerIsA: boolean): Frame[] {
  const boards: Record<string, StackSnap> = {}
  const frames: Frame[] = []

  for (const e of result.events) {
    const fx: Frame['fx'] = {}
    let banner: string | null = null

    if (e.t === 'battleStart') {
      for (const s of [...e.a, ...e.b]) boards[s.uid] = s
    } else if ('snap' in e) {
      for (const s of e.snap) boards[s.uid] = s
    }

    switch (e.t) {
      case 'attack': {
        fx[e.src] = { state: 'act' }
        fx[e.dst] = {
          state: 'hit',
          float:
            e.dmg > 0
              ? { text: `-${e.dmg}`, kind: 'dmg' }
              : e.absorbed > 0
                ? { text: `◈${e.absorbed}`, kind: 'soak' }
                : undefined,
        }
        break
      }
      case 'cleave':
        fx[e.dst] = { state: 'hit', float: { text: `-${e.dmg}`, kind: 'dmg' } }
        break
      case 'heal':
        fx[e.uid] = { float: { text: `+${e.amount}`, kind: 'heal' } }
        break
      case 'frenzy':
        fx[e.uid] = { float: { text: `+${e.atk} ATK`, kind: 'buff' } }
        break
      case 'venom':
        fx[e.uid] = { state: 'hit', float: { text: 'venom', kind: 'dmg' } }
        break
      case 'buff':
        for (const uid of e.uids) fx[uid] = { float: { text: e.text, kind: 'buff' } }
        break
      case 'root':
        fx[e.uid] = { float: { text: 'rooted', kind: 'soak' } }
        break
      case 'lastStand':
        fx[e.uid] = { float: { text: 'holds!', kind: 'buff' } }
        banner = 'Last Stand'
        break
      case 'death':
        fx[e.uid] = { state: 'dead' }
        break
      case 'spellCast':
        banner = `${(e.side === 'a') === playerIsA ? '✦' : '✧'} ${e.name}\n${e.text}`
        break
      default:
        break
    }

    frames.push({ boards: { ...boards }, fx, banner, line: describe(e, playerIsA) })
  }
  return frames
}

export function BattleScreen({ run, result }: { run: RunState; result: BattleResult | null }) {
  const store = useGame()
  const p = player(run)
  const report = run.reports.find((r) => r.aId === p.id || r.bId === p.id)
  const playerIsA = report ? report.aId === p.id : true
  const frames = useMemo(() => (result ? buildFrames(result, playerIsA) : []), [result, playerIsA])
  const [i, setI] = useState(0)
  const [done, setDone] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    setI(0)
    setDone(false)
  }, [result])

  useEffect(() => {
    if (done || frames.length === 0) return
    if (i >= frames.length - 1) {
      setDone(true)
      return
    }
    const ms = BASE_MS / store.speed
    timer.current = window.setTimeout(() => setI((n) => n + 1), ms)
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [i, frames.length, done, store.speed])

  if (!result || frames.length === 0) {
    return (
      <div className="screen center">
        <p className="dim">No battle to show.</p>
        <button className="btn btn-primary" onClick={store.finishBattle}>
          Continue
        </button>
      </div>
    )
  }

  const frame = frames[i]
  const mine = Object.values(frame.boards).filter((s) => (s.side === 'a') === playerIsA)
  const theirs = Object.values(frame.boards).filter((s) => (s.side === 'a') !== playerIsA)
  const foe = report ? run.warlords.find((w) => w.id === (playerIsA ? report.bId : report.aId)) : null
  const foeFaction = foe ? FACTION_BY_ID.get(foe.factionId) : null

  return (
    <div className="screen">
      <Ladder run={run} onInspect={() => {}} />

      <div className="side-label">
        <span className="eyebrow" style={{ color: foeFaction?.colors.accent }}>
          {foe?.name ?? 'Rival'}
        </span>
        <span className="tiny dim">
          {foeFaction?.name}
          {foe ? ` · ${foe.hp} HP` : ''}
        </span>
      </div>

      <div className="battlefield" style={{ position: 'relative' }}>
        {frame.banner && (
          <div className="spell-banner" style={{ whiteSpace: 'pre-line' }} key={`${i}-banner`}>
            {frame.banner}
          </div>
        )}
        <SnapBoard snaps={theirs} fx={frame.fx} flip />
        <div className="center dim tiny">— — —</div>
        <SnapBoard snaps={mine} fx={frame.fx} />
      </div>

      <div className="log center small">{frame.line}</div>

      <div className="row" style={{ gap: 8 }}>
        <button className="btn btn-sm grow" onClick={() => store.setSpeed(store.speed === 1 ? 2 : 1)}>
          {store.speed}× speed
        </button>
        <button className="btn btn-sm grow" onClick={() => setI(frames.length - 1)} disabled={done}>
          Skip to result
        </button>
      </div>

      <button className="btn btn-primary" disabled={!done} onClick={store.finishBattle}>
        {done ? 'Continue' : 'Fighting…'}
      </button>
    </div>
  )
}

function SnapBoard({ snaps, fx, flip }: { snaps: StackSnap[]; fx: Frame['fx']; flip?: boolean }) {
  const bySlot = new Map(snaps.map((s) => [s.slot, s]))
  const visible = (slot: number) => {
    const s = bySlot.get(slot)
    return s ? s.alive || Boolean(fx[s.uid]?.state) : false
  }
  const row = (slots: number[], name: 'front' | 'back') => {
    // A row nobody occupies is dead space on a phone — drop it entirely.
    if (!slots.some(visible)) return null
    return (
      <div className="board-row" data-row={name}>
        {slots.map((slot) => {
          const s = bySlot.get(slot)
          if (!s || !visible(slot)) return <div key={slot} className="slot" />
          const f = fx[s.uid]
          return <SnapCard key={slot} snap={s} state={f?.state ?? null} float={f?.float ?? null} />
        })}
      </div>
    )
  }
  const front = row([0, 1, 2, 3], 'front')
  const back = row([4, 5, 6], 'back')
  return (
    <div className="board">
      {flip ? front : back}
      {flip ? back : front}
    </div>
  )
}
