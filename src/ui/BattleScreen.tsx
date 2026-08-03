import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { HERO_ART } from '../data/art'
import { FACTION_BY_ID, HERO_BY_ID, unit } from '../data/index'
import type { BattleEvent, BattleResult, Side, SpellOutcome, StackSnap } from '../engine/battle'
import { player, type RunState, type Warlord } from '../engine/run'
import { useGame } from '../state/store'
import { HeroSheet } from './HeroSheet'
import { InspectSheet, RankProgress } from './InspectSheet'
import { Ladder } from './Ladder'
import { Plate } from './Plate'
import { Sigil } from './Sigil'
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
  /** a hero spell resolving this frame: flares the plaque and beams the targets */
  cast: { side: Side; targets: string[] } | null
  /** a battle-start passive announcing itself off its hero's plaque */
  pulse: { side: Side; text: string } | null
  /** casts each hero has spent by this frame, for the plaque pips */
  spent: Record<Side, number>
}

/**
 * The banner has to say what the spell *did*, not what it says on the tin
 * (§1.2) — the numbers are rolled in the engine and ride on the event.
 */
function spellSummary(name: string, amount: number, kind: SpellOutcome, targets: number): string {
  if (targets === 0) return `${name} — no target`
  const across = targets > 1 ? ` across ${targets} stacks` : ''
  const stacks = `${targets} stack${targets === 1 ? '' : 's'}`
  switch (kind) {
    case 'heal':
      return `${name} — ${amount} healed${across}`
    case 'damage':
      return `${name} — ${amount} damage${across}`
    case 'shield':
      return `${name} — +${amount} Bulwark${across}`
    case 'atk':
      return `${name} — +${amount} ATK to ${stacks}`
    case 'root':
      return `${name} — ${stacks} rooted for ${amount} exchanges`
    case 'strikes':
      return `${name} — ${amount} extra strike${amount === 1 ? '' : 's'}`
  }
}

/** Volley is a unit property, so the log does not need to repeat it. */
function isVolley(unitId: string | undefined): boolean {
  if (!unitId) return false
  return unit(unitId).keywords.some((k) => k.k === 'volley')
}

const BASE_MS = 620
/** A spell banner must be readable even at 2× (§1.2). */
const SPELL_MIN_MS = 600

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
      return `${side(e.side) ? 'Your' : 'Enemy'} hero casts ${spellSummary(e.name, e.amount, e.kind, e.targets.length)}`
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
  const spent: Record<Side, number> = { a: 0, b: 0 }

  for (const e of result.events) {
    const fx: Frame['fx'] = {}
    let banner: string | null = null
    let arc: Frame['arc'] = null
    let saved: string | null = null
    let cast: Frame['cast'] = null
    let pulse: Frame['pulse'] = null

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
        spent[e.side] += 1
        cast = { side: e.side, targets: e.targets }
        banner = `${(e.side === 'a') === playerIsA ? '✦' : '✧'} ${spellSummary(e.name, e.amount, e.kind, e.targets.length)}`
        break
      case 'passive':
        pulse = { side: e.side, text: e.text }
        break
      default:
        break
    }

    frames.push({
      boards: { ...boards },
      fx,
      banner,
      line: describe(e, playerIsA),
      arc,
      saved,
      cast,
      pulse,
      spent: { ...spent },
    })
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
  /** the hero whose plaque was tapped — pauses the replay and shows their kit */
  const [heroPeek, setHeroPeek] = useState<Warlord | null>(null)
  const [paused, setPaused] = useState(false)
  const timer = useRef<number | null>(null)
  const fieldRef = useRef<HTMLDivElement | null>(null)
  const [shot, setShot] = useState<{ x1: number; y1: number; x2: number; y2: number; covered: boolean; key: number } | null>(null)
  const [beams, setBeams] = useState<{ x1: number; y1: number; len: number; rot: number; key: number }[]>([])

  useEffect(() => {
    setI(0)
    setDone(false)
    setPeek(null)
    setHeroPeek(null)
    setPaused(false)
  }, [result])

  /**
   * Rows are dropped when empty, so slot arithmetic would put the arc in the
   * wrong place — measure the real cards instead. Layout effect so the arc is
   * positioned in the same paint as the frame it belongs to.
   */
  useLayoutEffect(() => {
    const frame = frames[i]
    const field = fieldRef.current
    if (!frame || !field) {
      setShot(null)
      setBeams([])
      return
    }
    const box = field.getBoundingClientRect()
    const centre = (el: Element) => {
      const r = el.getBoundingClientRect()
      return { x: r.left - box.left + r.width / 2, y: r.top - box.top + r.height / 2 }
    }
    const card = (uid: string) => field.querySelector(`[data-uid="${CSS.escape(uid)}"]`)

    const arc = frame.arc
    const from = arc && card(arc.from)
    const to = arc && card(arc.to)
    if (arc && from && to) {
      const a = centre(from)
      const b = centre(to)
      setShot({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, covered: arc.covered, key: i })
    } else {
      setShot(null)
    }

    // The beam is the attribution — it has to leave the plaque of the hero who
    // paid for the cast, so measure the plaque rather than assuming a corner.
    const plaque = frame.cast && field.querySelector(`[data-plaque="${frame.cast.side}"]`)
    if (frame.cast && plaque) {
      const o = centre(plaque)
      setBeams(
        frame.cast.targets
          .map((uid) => card(uid))
          .filter((el): el is Element => Boolean(el))
          .map((el, n) => {
            const t = centre(el)
            const dx = t.x - o.x
            const dy = t.y - o.y
            return { x1: o.x, y1: o.y, len: Math.hypot(dx, dy), rot: (Math.atan2(dy, dx) * 180) / Math.PI, key: i * 100 + n }
          }),
      )
    } else {
      setBeams([])
    }
  }, [i, frames])

  useEffect(() => {
    if (done || frames.length === 0) return
    if (i >= frames.length - 1) {
      setDone(true)
      return
    }
    // An open sheet — stack or hero — pauses playback rather than racing it.
    if (peek || heroPeek || paused) return
    // A spell banner has to survive 2× speed, so it holds the frame for at
    // least ~600ms of real time (§1.2). Everything else follows the speed knob.
    const ms = frames[i]?.cast ? Math.max(SPELL_MIN_MS, BASE_MS / store.speed) : BASE_MS / store.speed
    timer.current = window.setTimeout(() => setI((n) => n + 1), ms)
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [i, frames, done, store.speed, peek, heroPeek, paused])

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
  const mySide: Side = playerIsA ? 'a' : 'b'
  const foeSide: Side = playerIsA ? 'b' : 'a'
  // Pips count the casts this battle actually contains — the replay can only
  // promise what the log proves, and a wiped side never gets its last cast.
  const totals = frames[frames.length - 1].spent

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
        {beams.map((b) => (
          <span
            key={b.key}
            className="cast-beam"
            style={
              {
                '--x1': `${b.x1}px`,
                '--y1': `${b.y1}px`,
                '--len': `${b.len}px`,
                '--rot': `${b.rot}deg`,
                '--fc': (frame.cast?.side === mySide ? FACTION_BY_ID.get(p.factionId) : foeFaction)?.colors.accent,
                '--ms': `${Math.round(420 / store.speed)}ms`,
              } as React.CSSProperties
            }
            aria-hidden="true"
          />
        ))}
        {frame.banner && (
          <div className="spell-banner" style={{ whiteSpace: 'pre-line' }} key={`${i}-banner`}>
            {frame.banner}
          </div>
        )}
        {foe && (
          <HeroPlaque
            warlord={foe}
            side={foeSide}
            casts={totals[foeSide]}
            spent={frame.spent[foeSide]}
            flare={frame.cast?.side === foeSide}
            pulse={frame.pulse?.side === foeSide ? frame.pulse.text : null}
            onTap={() => setHeroPeek(foe)}
          />
        )}
        <SnapBoard snaps={theirs} fx={frame.fx} saved={frame.saved} onPeek={setPeek} />
        <div className="center dim tiny">— — —</div>
        <SnapBoard snaps={mine} fx={frame.fx} saved={frame.saved} mine onPeek={setPeek} />
        <HeroPlaque
          warlord={p}
          side={mySide}
          mine
          casts={totals[mySide]}
          spent={frame.spent[mySide]}
          flare={frame.cast?.side === mySide}
          pulse={frame.pulse?.side === mySide ? frame.pulse.text : null}
          onTap={() => setHeroPeek(p)}
        />
      </div>

      <div className="log center small">{peek || heroPeek ? 'Paused — close to resume.' : frame.line}</div>

      <div className="row" style={{ gap: 8 }}>
        <button className="btn btn-sm grow" onClick={() => setPaused((v) => !v)} disabled={done}>
          {paused ? '▶ Resume' : '❚❚ Pause'}
        </button>
        <button className="btn btn-sm grow" onClick={() => store.setSpeed(store.speed === 1 ? 2 : 1)}>
          {store.speed}× speed
        </button>
        <button className="btn btn-sm grow" onClick={() => setI(frames.length - 1)} disabled={done}>
          Skip
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

      {heroPeek && <HeroSheet warlord={heroPeek} round={run.round} onClose={() => setHeroPeek(null)} />}
    </div>
  )
}

/**
 * A hero on the battlefield: portrait, name, and one pip per cast this battle
 * holds — spent pips hollow out as the fight runs (§1.1). Tapping it pauses the
 * replay and opens their sheet (§1.3), which is also the screen's pause button.
 */
function HeroPlaque({
  warlord,
  side,
  mine,
  casts,
  spent,
  flare,
  pulse,
  onTap,
}: {
  warlord: Warlord
  side: Side
  /** yours sits bottom-left under your board; the enemy's top-right over theirs */
  mine?: boolean
  casts: number
  spent: number
  flare?: boolean
  pulse?: string | null
  onTap: () => void
}) {
  const hero = HERO_BY_ID.get(warlord.heroId)
  const faction = FACTION_BY_ID.get(warlord.factionId)
  return (
    <div className="plaque-row" data-mine={mine ? 'true' : undefined} style={{ ['--fc' as string]: faction?.colors.accent }}>
      <button className="hero-plaque" data-plaque={side} data-flare={flare ? 'true' : undefined} onClick={onTap}>
        <span className="plaque-art">
          <Plate src={HERO_ART[warlord.heroId]} eager fallback={<Sigil id={hero?.sigil ?? 'shield'} size={16} />} />
        </span>
        <span className="plaque-body">
          <span className="plaque-name">{hero?.name ?? warlord.name}</span>
          <span className="plaque-pips" aria-label={`${Math.max(0, casts - spent)} of ${casts} casts left`}>
            {Array.from({ length: casts }, (_, k) => (
              <i key={k} data-spent={k < spent ? 'true' : undefined} />
            ))}
          </span>
        </span>
      </button>
      {pulse && <span className="plaque-pulse">{pulse}</span>}
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
