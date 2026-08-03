import { HERO_ART_2X, UNIT_ART } from '../data/art'
import { FACTION_BY_ID, HERO_BY_ID, unit } from '../data/index'
import { RENOWN_BY_PLACEMENT, ordinal, player, type RunState } from '../engine/run'
import { useGame } from '../state/store'
import { Ladder } from './Ladder'
import { Plate } from './Plate'
import { Sigil } from './Sigil'
import { unitColor } from './StackCard'

export function ResultScreen({ run }: { run: RunState }) {
  const store = useGame()
  const p = player(run)
  const report = run.reports.find((r) => r.aId === p.id || r.bId === p.id)
  const playerIsA = report ? report.aId === p.id : true
  const won = report ? (playerIsA ? report.winner === 'a' : report.winner === 'b') : false
  const tie = report?.winner === 'tie'
  const foeId = report ? (playerIsA ? report.bId : report.aId) : null
  const foe = foeId ? run.warlords.find((w) => w.id === foeId) : null
  const damage = tie ? (report?.result.damageToBoth ?? 0) : (report?.damage ?? 0)
  const mySurvivors = report ? (playerIsA ? report.result.survivorsA : report.result.survivorsB) : []
  // The brief asks for the winning board's plates: on a defeat that is the
  // board that just beat you, which is the more useful thing to look at.
  const winnersSurvivors = report
    ? report.winner === 'a'
      ? report.result.survivorsA
      : report.winner === 'b'
        ? report.result.survivorsB
        : mySurvivors
    : []

  const eliminated = !p.alive
  const headline = tie ? 'Standstill' : won ? 'Victory' : 'Defeat'

  return (
    <div className="screen">
      <Ladder run={run} onInspect={(id) => store.inspect(id)} />

      <div className="center" style={{ marginTop: 18 }}>
        <div className="eyebrow">Round {run.round}</div>
        <h1 style={{ color: won ? 'var(--good)' : tie ? 'var(--ink)' : 'var(--danger)' }}>{headline}</h1>
        {foe && <div className="small dim">against {foe.name}</div>}
      </div>

      <div className="panel row spread">
        <div>
          <div className="eyebrow">Your banner</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: p.hp <= 8 ? 'var(--danger)' : undefined }}>{Math.max(0, p.hp)} HP</div>
        </div>
        <div className="center">
          <div className="eyebrow">Damage taken</div>
          <div style={{ fontSize: 26, fontWeight: 800 }}>{won ? '0' : `−${damage}`}</div>
        </div>
        <div className="center">
          <div className="eyebrow">Survivors</div>
          <div style={{ fontSize: 26, fontWeight: 800 }}>{mySurvivors.reduce((n, s) => n + s.count, 0)}</div>
        </div>
      </div>

      {winnersSurvivors.length > 0 && (
        <div>
          <div className="eyebrow" style={{ marginBottom: 5 }}>
            {won ? 'Your warband, still standing' : tie ? 'Left on the field' : `What ${foe?.name ?? 'they'} had left`}
          </div>
          <div className="survivor-strip">
            {winnersSurvivors.map((sv) => (
              <span key={sv.uid} className="survivor" style={{ ['--sc' as string]: unitColor(unit(sv.unitId)) }}>
                <Plate src={UNIT_ART[sv.unitId]} eager fallback={<Sigil id={unit(sv.unitId).sigil} size={18} />} />
                <span className="survivor-count">{sv.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {won && (
        <div className="small dim center">
          Hero damage is <strong>⌈round ÷ 2⌉ + the tiers of your surviving stacks</strong> — the bigger your board
          finishes, the harder they fall.
        </div>
      )}

      <div className="panel" style={{ maxHeight: 150, overflowY: 'auto' }}>
        <div className="eyebrow" style={{ marginBottom: 4 }}>
          This round across the lobby
        </div>
        {run.log
          .filter((l) => l.startsWith(`R${run.round}:`))
          .map((l, i) => (
            <div key={i} className="tiny dim">
              {l.replace(`R${run.round}: `, '')}
            </div>
          ))}
      </div>

      <button className="btn btn-primary" onClick={store.nextRound} style={{ marginTop: 'auto' }}>
        {run.finished || eliminated ? 'See final standing' : `Muster for round ${run.round + 1}`}
      </button>
    </div>
  )
}

export function RunOverScreen({ run }: { run: RunState }) {
  const store = useGame()
  const p = player(run)
  const placement = p.placement ?? 1
  const won = placement === 1
  const f = FACTION_BY_ID.get(p.factionId)!
  const hero = HERO_BY_ID.get(p.heroId)!

  return (
    <div className="screen">
      <div className="center" style={{ marginTop: 28 }}>
        <div className="hero-art hero-art-ceremony" style={{ ['--fc' as string]: f.colors.primary }} data-big="true">
          <Plate src={HERO_ART_2X[p.heroId]} eager fallback={<Sigil id={hero.sigil} size={56} />} />
        </div>
        <h1 style={{ color: won ? 'var(--gold)' : 'var(--ink)' }}>{won ? 'Last Banner Standing' : ordinal(placement)}</h1>
        <div className="small dim">
          {hero.name} {hero.title} · {f.name}
        </div>
      </div>

      <div className="panel row spread">
        <div>
          <div className="eyebrow">Renown earned</div>
          <div className="gold" style={{ fontSize: 30 }}>
            +{store.renownEarned}
          </div>
        </div>
        <div className="center">
          <div className="eyebrow">Total</div>
          <div style={{ fontSize: 30, fontWeight: 800 }}>{store.save.renown}</div>
        </div>
        <div className="center">
          <div className="eyebrow">Record</div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>
            {p.wins}W · {p.losses}L
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="eyebrow" style={{ marginBottom: 6 }}>
          Renown by placement
        </div>
        <div className="row wrap tiny" style={{ gap: 6 }}>
          {Object.entries(RENOWN_BY_PLACEMENT).map(([place, renown]) => (
            <span key={place} className="kw" style={{ color: Number(place) === placement ? 'var(--gold)' : undefined }}>
              {ordinal(Number(place))} · {renown}
            </span>
          ))}
        </div>
      </div>

      <div className="panel" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <div className="eyebrow" style={{ marginBottom: 4 }}>
          Run log
        </div>
        {run.log.map((l, i) => (
          <div key={i} className="tiny dim">
            {l}
          </div>
        ))}
      </div>

      <div className="row" style={{ gap: 8 }}>
        <button className="btn grow" onClick={store.abandon}>
          Home
        </button>
        <button
          className="btn btn-primary grow"
          onClick={() => store.start(p.factionId, p.heroId, store.save.settings.difficulty)}
        >
          Run it back
        </button>
      </div>
    </div>
  )
}
