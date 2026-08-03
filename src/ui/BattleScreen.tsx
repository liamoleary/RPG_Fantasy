import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { FACTION_BY_ID, unit } from '../data/index'
import type { BattleEvent, BattleResult, StackSnap } from '../engine/battle'
import { player, type RunState } from '../engine/run'
import { useGame } from '../state/store'
import { InspectSheet, RankProgress } from './InspectSheet'
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
  /** a shot to draw arcing over the front line, from one card to another */
  arc: { from: string; to: string; covered: boolean } | null
  /** the back-row stack a coverer just saved — it glows rather than dies */
  saved: string | null
}

/** Volley is a unit property, so the log does not need to repeat it. */
function isVolley(unitId: string | undefined): boolean {
  if (!unitId) return false
  return unit(unitId).keywords.some((k) => k.k === 'volley')
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
    case 'cover': {
      const name = (uid: string, fallback: string) => {
        const sn = e.snap.find((x) => x.uid === uid)
        return sn ? unit(sn.unitId).name : fallback
      }
      return `${name(e.by, 'The front line')} covers ${name(e.saved, 'the back line')} — volley intercepted.`
    }
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
    let arc: Frame['arc'] = null
    let saved: string | null = null

    if (e.t === 'battleStart') {
      for (const s of [...e.a, ...e.b]) boards[s.uid] = s
    } else if ('snap' in e) {
      for (const s of e.snap) boards[s.uid] = s
    }

    switch (e.t) {
      case 'attack': {
        fx[e.src] = { state: 'act' }
        // A volley must read as a shot, not a shove (§3.1).
        if (!e.retaliation && isVolley(boards[e.src]?.unitId)) arc = { from: e.src, to: e.dst, covered: false }
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
      case 'cover':
        // The save is the whole point of the feature — make it unmissable.
        fx[e.by] = { float: { text: 'Covered!', kind: 'soak' } }
        arc = { from: e.src, to: e.by, covered: true }
        saved = e.saved
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

    frames.push({ boards: { ...boards }, fx, banner, line: describe(e, playerIsA), arc, saved })
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
  /** the snapshot the player tapped; inspecting holds the replay (§2.1) */
  const [peek, setPeek] = useState<StackSnap | null>(null)
  const timer = useRef<number | null>(null)
  const fieldRef = useRef<HTMLDivElement | null>(null)
  const [shot, setShot] = useState<{ x1: number; y1: number; x2: number; y2: number; covered: boolean; key: number } | null>(null)

  useEffect(() => {
    setI(0)
    setDone(false)
    setPeek(null)
  }, [result])

  /**
   * Rows are dropped when empty, so slot arithmetic would put the arc in the
   * wrong place — measure the real cards instead. Layout effect so the arc is
   * positioned in the same paint as the frame it belongs to.
   */
  useLayoutEffect(() => {
    const arc = frames[i]?.arc
    const field = fieldRef.current
    if (!arc || !field) {
      setShot(null)
      return
    }
    const from = field.querySelector(`[data-uid="${CSS.escape(arc.from)}"]`)
    const to = field.querySelector(`[data-uid="${CSS.escape(arc.to)}"]`)
    if (!from || !to) {
      setShot(null)
      return
    }
    const box = field.getBoundingClientRect()
    const centre = (el: Element) => {
      const r = el.getBoundingClientRect()
      return { x: r.left - box.left + r.width / 2, y: r.top - box.top + r.height / 2 }
    }
    const a = centre(from)
    const b = centre(to)
    setShot({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, covered: arc.covered, key: i })
  }, [i, frames])

  useEffect(() => {
    if (done || frames.length === 0) return
    if (i >= frames.length - 1) {
      setDone(true)
      return
    }
    // An open Inspect sheet pauses playback rather than racing it.
    if (peek) return
    const ms = BASE_MS / store.speed
    timer.current = window.setTimeout(() => setI((n) => n + 1), ms)
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [i, frames.length, done, store.speed, peek])

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
      {/* HP is already applied when the replay starts, so the ladder would
          spoil the outcome — hold its space until the fight has played out. */}
      {done ? (
        <Ladder run={run} onInspect={() => {}} />
      ) : (
        <div className="row center dim tiny" style={{ height: 52, justifyContent: 'center' }}>
          Round {run.round}
        </div>
      )}

      <div className="side-label">
        <span className="eyebrow" style={{ color: foeFaction?.colors.accent }}>
          {foe?.name ?? 'Rival'}
        </span>
        <span className="tiny dim">
          {foeFaction?.name}
          {foe ? ` · ${foe.hp} HP` : ''}
        </span>
      </div>

      <div className="battlefield" style={{ position: 'relative' }} ref={fieldRef}>
        {shot && !peek && (
          <span
            key={shot.key}
            className="volley-arc"
            data-covered={shot.covered ? 'true' : undefined}
            style={
              {
                '--x1': `${shot.x1}px`,
                '--y1': `${shot.y1}px`,
                '--dx': `${shot.x2 - shot.x1}px`,
                '--dy': `${shot.y2 - shot.y1}px`,
                // Lift the apex clear of the front line it is arcing over.
                '--lift': `${Math.max(26, Math.abs(shot.y2 - shot.y1) * 0.45)}px`,
                '--ms': `${Math.round(360 / store.speed)}ms`,
              } as React.CSSProperties
            }
            aria-hidden="true"
          >
            <i />
          </span>
        )}
        {frame.banner && (
          <div className="spell-banner" style={{ whiteSpace: 'pre-line' }} key={`${i}-banner`}>
            {frame.banner}
          </div>
        )}
        <SnapBoard snaps={theirs} fx={frame.fx} saved={frame.saved} onPeek={setPeek} />
        <div className="center dim tiny">— — —</div>
        <SnapBoard snaps={mine} fx={frame.fx} saved={frame.saved} mine onPeek={setPeek} />
      </div>

      <div className="log center small">{peek ? 'Paused — close to resume.' : frame.line}</div>

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

      {peek && (
        <InspectSheet
          unitId={peek.unitId}
          context={{ count: peek.count, bonusAtk: peek.atk - unit(peek.unitId).atk, bonusHp: peek.maxHp - unit(peek.unitId).hp }}
          extra={<RankProgress unitId={peek.unitId} count={peek.startCount} rank={peek.rank} />}
          onClose={() => setPeek(null)}
        />
      )}
    </div>
  )
}

function SnapBoard({
  snaps,
  fx,
  mine,
  saved,
  onPeek,
}: {
  snaps: StackSnap[]
  fx: Frame['fx']
  /** your own block — mirror it so your front line faces the enemy */
  mine?: boolean
  /** uid of a stack a coverer just saved this frame */
  saved?: string | null
  onPeek: (s: StackSnap) => void
}) {
  const bySlot = new Map(snaps.map((s) => [s.slot, s]))
  const visible = (slot: number) => {
    const s = bySlot.get(slot)
    return s ? s.alive || Boolean(fx[s.uid]?.state) : false
  }
  const row = (slots: number[], name: 'front' | 'back') => {
    // A row nobody occupies is dead space on a phone — drop it entirely.
    if (!slots.some(visible)) return null
    return (
      <div className="board-row" data-row={name} data-tag="true">
        <span className="row-tag">{name}</span>
        {slots.map((slot) => {
          const s = bySlot.get(slot)
          if (!s || !visible(slot)) return <div key={slot} className="slot" />
          const f = fx[s.uid]
          return (
            <SnapCard
              key={slot}
              snap={s}
              state={f?.state ?? null}
              float={f?.float ?? null}
              savedByCover={saved === s.uid}
              onClick={() => onPeek(s)}
            />
          )
        })}
      </div>
    )
  }
  // The battlefield is one vertical axis (Design Notes 03 §3, which formally
  // corrects DN01 §1.3): enemy back, enemy front, divider, your front, your
  // back. The two front lines meet in the middle like a real battle line and
  // your back row sits furthest from the enemy, nearest your thumb. Only your
  // block mirrors; the Muster board shows your half in this same order.
  return (
    <div className="board">
      {mine ? row([0, 1, 2, 3], 'front') : row([4, 5, 6], 'back')}
      {mine ? row([4, 5, 6], 'back') : row([0, 1, 2, 3], 'front')}
    </div>
  )
}
