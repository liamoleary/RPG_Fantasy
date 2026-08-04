import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { HERO_ART_2X } from '../data/art'
import { FACTION_BY_ID, HERO_BY_ID, unit } from '../data/index'
import type { CastFx, FactionId, Projectile } from '../data/types'
import type { BattleResult, Side, StackSnap } from '../engine/battle'
import { player, type RunState, type Warlord } from '../engine/run'
import { useGame } from '../state/store'
import { HeroSheet } from './HeroSheet'
import { InspectSheet, RankProgress } from './InspectSheet'
import { Plate } from './Plate'
import { Sigil } from './Sigil'
import { describe, HEAVY_HIT_FRACTION, poolOf, spellSummary } from './battleLog'
import { castFxOfFaction, projectileOf, SnapCard } from './StackCard'

/** Volley is a unit property, so the log does not need to repeat it. */
function isVolley(unitId: string | undefined): boolean {
  if (!unitId) return false
  return unit(unitId).keywords.some((k) => k.k === 'volley')
}

const BASE_MS = 620
/** A spell banner must be readable even at 2× (DN03 §1.2). */
const SPELL_MIN_MS = 600

/**
 * The renderer is a projector over `result.events` — it never computes an
 * outcome (§12.3 rule 2). Each event carries the resulting snapshot of the
 * stacks it touched, so replaying is just "apply snap, show a flourish".
 */

interface Frame {
  boards: Record<string, StackSnap>
  /**
   * Transient per-stack effects for this frame. `weight` is the share of the
   * victim's pool the blow took (§7): it scales the number, the knockback and
   * whether the screen shakes at all. `bloom` is the receiving end of a spell
   * in its caster's flavour (§10).
   */
  fx: Record<
    string,
    {
      state?: 'hit' | 'act' | 'dead'
      float?: { text: string; kind: 'dmg' | 'heal' | 'buff' | 'soak'; weight?: number }
      weight?: number
      bloom?: CastFx
      /** this stack is the one casting — it glows in its own flavour (§10) */
      glow?: CastFx
    }
  >
  banner: string | null
  line: string
  /** a shot to draw arcing over the front line, from one card to another */
  arc: { from: string; to: string; covered: boolean; shot: Projectile } | null
  /** the back-row stack a coverer just saved — it glows rather than dies */
  saved: string | null
  /** a hero spell resolving this frame: flares the plaque and beams the targets */
  cast: { side: Side; targets: string[] } | null
  /** a battle-start passive announcing itself off its hero's plaque */
  pulse: { side: Side; text: string } | null
  /** casts each hero has spent by this frame, for the plaque pips */
  spent: Record<Side, number>
  /** a blow big enough to be an event with an author (§2.2) */
  heavy: { uid: string; frac: number } | null
  /** a line-top form unleashing its ultimate: beams from the card (DN04 §3) */
  apex: { uid: string; targets: string[] } | null
  /** a unit ability reaching its targets from the stack that cast it (§10) */
  ability: { src: string; targets: string[]; fx: CastFx } | null
}

/**
 * Armour that decays silently is why "unkillable" flips to "one-shot" with no
 * warning (§2.1) — but the full equation wraps to three lines on a phone card.
 * Glyph and number carry it: "◈2 −1" is two soaked, one through. The complete
 * arithmetic stays in the result screen's battle log.
 */
function hitFloat(dmg: number, absorbed: number, weight = 0): Frame['fx'][string]['float'] {
  if (absorbed > 0 && dmg > 0) return { text: `◈${absorbed} −${dmg}`, kind: 'dmg', weight }
  if (absorbed > 0) return { text: `◈${absorbed}`, kind: 'soak' }
  if (dmg > 0) return { text: `−${dmg}`, kind: 'dmg', weight }
  return undefined
}

/** The flavour a stack's own side casts in — heals and buffs land in it (§10). */
function bloomOf(s: StackSnap | undefined, sides: Record<Side, FactionId>): CastFx | undefined {
  if (!s) return undefined
  const own = unit(s.unitId)
  // A mercenary fighting for the Verdant Court is healed by Verdant magic, so
  // the side's colours win unless the unit declares its own.
  return own.castFx ?? castFxOfFaction(sides[s.side])
}

/** The flavour a named caster works in — its own, else its army's. */
function castOf(s: StackSnap | undefined, sides: Record<Side, FactionId>): CastFx {
  if (!s) return 'arcane'
  return unit(s.unitId).castFx ?? castFxOfFaction(sides[s.side])
}

function buildFrames(result: BattleResult, playerIsA: boolean, sides: Record<Side, FactionId>): Frame[] {
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
    let apex: Frame['apex'] = null
    let ability: Frame['ability'] = null

    // The heavy-hit threshold is a share of what the victim had BEFORE the
    // blow, so read the board one step ahead of applying the snapshot.
    const victimBefore = e.t === 'attack' || e.t === 'cleave' ? boards[e.dst] : undefined
    let heavy: Frame['heavy'] = null

    if (e.t === 'battleStart') {
      for (const s of [...e.a, ...e.b]) boards[s.uid] = s
    } else if ('snap' in e) {
      for (const s of e.snap) boards[s.uid] = s
    }

    switch (e.t) {
      case 'attack': {
        fx[e.src] = { state: 'act' }
        // A volley must read as a shot, not a shove (§3.1).
        if (!e.retaliation && isVolley(boards[e.src]?.unitId)) {
          arc = { from: e.src, to: e.dst, covered: false, shot: projectileOf(unit(boards[e.src].unitId)) }
        }
        const pool = victimBefore ? poolOf(victimBefore) : 0
        const weight = pool > 0 ? Math.min(1, e.dmg / pool) : 0
        fx[e.dst] = { state: 'hit', float: hitFloat(e.dmg, e.absorbed, weight), weight }
        if (pool > 0 && weight >= HEAVY_HIT_FRACTION) {
          heavy = { uid: e.dst, frac: weight }
          // A one-shot should feel authored: name the stack that threw it.
          banner = `${unit(boards[e.src]?.unitId ?? e.src).name} — ${e.dmg} damage!`
        }
        break
      }
      case 'cleave':
        fx[e.dst] = { state: 'hit', float: { text: `-${e.dmg}`, kind: 'dmg' } }
        break
      case 'heal': {
        // A heal blooms on the recipient in the CASTER's flavour (§10) — gold
        // light from the Vanguard's Cleric, green from a Verdant grove — and
        // the light travels, so you can see whose power it was.
        const flavour: CastFx | undefined = e.src ? castOf(boards[e.src], sides) : bloomOf(boards[e.uid], sides)
        fx[e.uid] = { float: { text: `+${e.amount}`, kind: 'heal' }, bloom: flavour }
        if (e.src && flavour) {
          fx[e.src] = { ...fx[e.src], glow: flavour }
          ability = { src: e.src, targets: [e.uid], fx: flavour }
        }
        break
      }
      case 'frenzy':
        fx[e.uid] = { float: { text: `+${e.atk} ATK`, kind: 'buff' } }
        break
      case 'venom':
        fx[e.uid] = { state: 'hit', float: { text: 'venom', kind: 'dmg' } }
        break
      case 'cover':
        // The save is the whole point of the feature — make it unmissable.
        fx[e.by] = { float: { text: 'Covered!', kind: 'soak' } }
        arc = { from: e.src, to: e.by, covered: true, shot: projectileOf(unit(boards[e.src].unitId)) }
        saved = e.saved
        break
      case 'buff': {
        const flavour = e.src ? castOf(boards[e.src], sides) : undefined
        for (const uid of e.uids) {
          fx[uid] = { float: { text: e.text, kind: 'buff' }, bloom: flavour ?? bloomOf(boards[uid], sides) }
        }
        if (e.src && flavour) {
          fx[e.src] = { ...fx[e.src], glow: flavour }
          const reach = e.uids.filter((uid) => uid !== e.src)
          if (reach.length > 0) ability = { src: e.src, targets: reach, fx: flavour }
        }
        break
      }
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
      case 'apex':
        // Same grammar as a hero spell (§3): the card flares, beams reach the
        // targets, and the banner is the receipt.
        apex = { uid: e.uid, targets: e.targets }
        banner = `⚔ ${spellSummary(e.name, e.amount, e.kind, e.targets.length)}`
        break
      default:
        break
    }

    // Hearthstone rule: numbers and art carry the routine blows — the damage
    // float already says what the ticker used to. Words are reserved for the
    // beats that change how you read the fight.
    const speaks =
      e.t === 'spellCast' ||
      e.t === 'apex' ||
      e.t === 'cover' ||
      e.t === 'lastStand' ||
      e.t === 'passive' ||
      e.t === 'battleStart' ||
      e.t === 'battleEnd' ||
      heavy !== null
    frames.push({
      boards: { ...boards },
      fx,
      banner,
      line: speaks ? describe(e, playerIsA) : '',
      arc,
      saved,
      cast,
      pulse,
      spent: { ...spent },
      heavy,
      apex,
      ability,
    })
  }
  return frames
}

export function BattleScreen({ run, result }: { run: RunState; result: BattleResult | null }) {
  const store = useGame()
  const p = player(run)
  const report = run.reports.find((r) => r.aId === p.id || r.bId === p.id)
  const playerIsA = report ? report.aId === p.id : true
  const foeWarlord = report ? run.warlords.find((w) => w.id === (playerIsA ? report.bId : report.aId)) : null
  const sideFactions = useMemo<Record<Side, FactionId>>(
    () => ({
      a: (playerIsA ? p.factionId : foeWarlord?.factionId) ?? p.factionId,
      b: (playerIsA ? foeWarlord?.factionId : p.factionId) ?? p.factionId,
    }),
    [playerIsA, p.factionId, foeWarlord?.factionId],
  )
  const frames = useMemo(
    () => (result ? buildFrames(result, playerIsA, sideFactions) : []),
    [result, playerIsA, sideFactions],
  )
  const [i, setI] = useState(0)
  const [done, setDone] = useState(false)
  /** the snapshot the player tapped; inspecting holds the replay (§2.1) */
  const [peek, setPeek] = useState<StackSnap | null>(null)
  /** the hero whose plaque was tapped — pauses the replay and shows their kit */
  const [heroPeek, setHeroPeek] = useState<Warlord | null>(null)
  const [paused, setPaused] = useState(false)
  const timer = useRef<number | null>(null)
  const fieldRef = useRef<HTMLDivElement | null>(null)
  const [shot, setShot] = useState<{
    x1: number
    y1: number
    x2: number
    y2: number
    covered: boolean
    kind: Projectile
    key: number
  } | null>(null)
  const [beams, setBeams] = useState<{ x1: number; y1: number; len: number; rot: number; fx: CastFx | null; key: number }[]>([])
  /** a heavy hit shakes the field, at most once a second (§7) */
  const [shake, setShake] = useState(0)
  const lastShake = useRef(0)
  const [spark, setSpark] = useState<{ x: number; y: number; key: number } | null>(null)

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
      setShot({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, covered: arc.covered, kind: arc.shot, key: i })
    } else {
      setShot(null)
    }

    // The beam is the attribution — it leaves the plaque of the hero who paid
    // for the cast, or the card of the stack that spent its meter, so measure
    // the real element rather than assuming a corner.
    const origin = frame.cast
      ? field.querySelector(`[data-plaque="${frame.cast.side}"]`)
      : frame.apex
        ? card(frame.apex.uid)
        : frame.ability
          ? card(frame.ability.src)
          : null
    const rays = frame.cast?.targets ?? frame.apex?.targets ?? frame.ability?.targets
    const rayFx = frame.ability?.fx ?? null
    if (origin && rays) {
      const o = centre(origin)
      setBeams(
        rays
          .map((uid) => card(uid))
          .filter((el): el is Element => Boolean(el))
          .map((el, n) => {
            const t = centre(el)
            const dx = t.x - o.x
            const dy = t.y - o.y
            return {
              x1: o.x,
              y1: o.y,
              len: Math.hypot(dx, dy),
              rot: (Math.atan2(dy, dx) * 180) / Math.PI,
              fx: rayFx,
              key: i * 100 + n,
            }
          }),
      )
    } else {
      setBeams([])
    }

    // A heavy blow marks the contact point and jolts the field — but no more
    // than once a second, so a flurry of big hits shares one jolt (§7).
    const hv = frame.heavy && card(frame.heavy.uid)
    if (frame.heavy && hv) {
      const c = centre(hv)
      setSpark({ x: c.x, y: c.y, key: i })
      const now = performance.now()
      if (now - lastShake.current > 1000) {
        lastShake.current = now
        setShake(i)
      }
    } else {
      setSpark(null)
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
    const casting = frames[i]?.cast || frames[i]?.apex || frames[i]?.ability
    const ms = casting ? Math.max(SPELL_MIN_MS, BASE_MS / store.speed) : BASE_MS / store.speed
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
  const foe = foeWarlord
  const foeFaction = foe ? FACTION_BY_ID.get(foe.factionId) : null
  const mySide: Side = playerIsA ? 'a' : 'b'
  const foeSide: Side = playerIsA ? 'b' : 'a'
  // A beam is tinted by whoever fired it — a hero by its side, an Apex by the
  // side of the stack that spent its meter.
  const beamSide: Side | null = frame.cast
    ? frame.cast.side
    : frame.apex
      ? (frame.boards[frame.apex.uid]?.side ?? null)
      : null
  // Pips count the casts this battle actually contains — the replay can only
  // promise what the log proves, and a wiped side never gets its last cast.
  const totals = frames[frames.length - 1].spent

  return (
    <div className="screen">
      <div className="center dim tiny" style={{ height: 20 }}>
        Round {run.round}
      </div>

      <div className="battlefield" data-shake={shake === i ? 'true' : undefined} style={{ position: 'relative' }} ref={fieldRef}>
        {spark && !peek && (
          <span
            key={`spark${spark.key}`}
            className="impact-spark"
            style={{ ['--x' as string]: `${spark.x}px`, ['--y' as string]: `${spark.y}px` }}
            aria-hidden="true"
          />
        )}
        {shot && !peek && (
          <span
            key={shot.key}
            className="volley-arc"
            data-shot={shot.kind}
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
            data-fx={b.fx ?? undefined}
            style={
              {
                '--x1': `${b.x1}px`,
                '--y1': `${b.y1}px`,
                '--len': `${b.len}px`,
                '--rot': `${b.rot}deg`,
                '--fc': (beamSide === mySide ? FACTION_BY_ID.get(p.factionId) : foeFaction)?.colors.accent,
                // An ability beam is slower than a hero's: it has to be
                // followed to the stack it healed, not just noticed (§10).
                '--ms': `${Math.round((b.fx ? 560 : 420) / store.speed)}ms`,
              } as React.CSSProperties
            }
            aria-hidden="true"
          />
        ))}
        {frame.banner && (
          <div
            className="spell-banner"
            data-heavy={frame.heavy ? 'true' : undefined}
            style={{ whiteSpace: 'pre-line' }}
            key={`${i}-banner`}
          >
            {frame.banner}
          </div>
        )}
        {foe && (
          <HeroStage
            warlord={foe}
            side={foeSide}
            hp={foe.hp}
            mirror
            casts={totals[foeSide]}
            spent={frame.spent[foeSide]}
            flare={frame.cast?.side === foeSide}
            pulse={frame.pulse?.side === foeSide ? frame.pulse.text : null}
            onTap={() => setHeroPeek(foe)}
          />
        )}
        <SnapBoard snaps={theirs} fx={frame.fx} saved={frame.saved} apexUid={frame.apex?.uid} onPeek={setPeek} />
        <div className="center dim tiny">— — —</div>
        <SnapBoard snaps={mine} fx={frame.fx} saved={frame.saved} apexUid={frame.apex?.uid} mine onPeek={setPeek} />
        <HeroStage
          warlord={p}
          side={mySide}
          hp={p.hp}
          casts={totals[mySide]}
          spent={frame.spent[mySide]}
          flare={frame.cast?.side === mySide}
          pulse={frame.pulse?.side === mySide ? frame.pulse.text : null}
          onTap={() => setHeroPeek(p)}
        />
      </div>

      <div className="log center small">{peek || heroPeek ? 'Paused — close to resume.' : frame.line}</div>

      <div className="action-bar">
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
      </div>

      {peek && (
        <InspectSheet
          unitId={peek.unitId}
          context={{
            count: peek.count,
            bonusAtk: peek.atk - unit(peek.unitId).atk,
            bonusHp: peek.maxHp - unit(peek.unitId).hp,
            apexCharge: peek.apexCharge,
          }}
          extra={<RankProgress unitId={peek.unitId} count={peek.startCount} rank={peek.rank} />}
          onClose={() => setPeek(null)}
        />
      )}

      {heroPeek && <HeroSheet warlord={heroPeek} round={run.round} onClose={() => setHeroPeek(null)} />}
    </div>
  )
}

/**
 * Your hero, centre stage (Design Notes 04 §9). The portrait is the largest
 * single element on the screen after the boards, gradient-masked into the dead
 * space the DN03 §3 orientation fix left below your back line, and casts
 * launch from it — the plaque version stays for the enemy, whose board matters
 * more than their face.
 */
function HeroStage({
  warlord,
  side,
  hp,
  mirror,
  casts,
  spent,
  flare,
  pulse,
  onTap,
}: {
  warlord: Warlord
  side: Side
  /** the hero's remaining banner HP, on screen for both duellists */
  hp: number
  /** the enemy's stage, flipped so the two portraits face each other */
  mirror?: boolean
  casts: number
  spent: number
  flare?: boolean
  pulse?: string | null
  onTap: () => void
}) {
  const hero = HERO_BY_ID.get(warlord.heroId)
  const faction = FACTION_BY_ID.get(warlord.factionId)
  return (
    <button
      className="hero-stage"
      data-plaque={side}
      data-mirror={mirror ? 'true' : undefined}
      data-flare={flare ? 'true' : undefined}
      style={{ ['--fc' as string]: faction?.colors.accent }}
      onClick={onTap}
      aria-label={`${hero?.name ?? warlord.name}, ${hp} HP — pause and inspect`}
    >
      <span className="stage-art">
        <Plate src={HERO_ART_2X[warlord.heroId]} eager fallback={<Sigil id={hero?.sigil ?? 'shield'} size={30} />} />
      </span>
      <span className="stage-body">
        <span className="stage-name">{hero?.name ?? warlord.name}</span>
        <span className="plaque-pips" aria-label={`${Math.max(0, casts - spent)} of ${casts} casts left`}>
          {Array.from({ length: casts }, (_, k) => (
            <i key={k} data-spent={k < spent ? 'true' : undefined} />
          ))}
        </span>
      </span>
      <span className="stage-hp">{hp}</span>
      {pulse && <span className="plaque-pulse">{pulse}</span>}
    </button>
  )
}

function SnapBoard({
  snaps,
  fx,
  mine,
  saved,
  apexUid,
  onPeek,
}: {
  snaps: StackSnap[]
  fx: Frame['fx']
  /** your own block — mirror it so your front line faces the enemy */
  mine?: boolean
  /** uid of a stack a coverer just saved this frame */
  saved?: string | null
  /** uid of the stack unleashing its Apex this frame */
  apexUid?: string | null
  onPeek: (s: StackSnap) => void
}) {
  const bySlot = new Map(snaps.map((s) => [s.slot, s]))
  const visible = (slot: number) => {
    const s = bySlot.get(slot)
    return s ? s.alive || Boolean(fx[s.uid]?.state) : false
  }
  const row = (slots: number[], name: 'front' | 'back') => {
    // Both rows render even when empty: dropping one reflows the whole
    // battlefield mid-fight, and everything above it jumps.
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
              weight={f?.weight ?? 0}
              bloom={f?.bloom ?? null}
              glow={f?.glow ?? null}
              savedByCover={saved === s.uid}
              apexFiring={apexUid === s.uid}
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
