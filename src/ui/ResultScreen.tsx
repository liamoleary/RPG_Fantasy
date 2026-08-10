import { HERO_ART_2X } from '../data/art'
import { FACTION_BY_ID, HERO_BY_ID, unit } from '../data/index'
import { useState } from 'react'
import type { BattleEvent, Side, SpellOutcome } from '../engine/battle'
import { RENOWN_BY_PLACEMENT, ordinal, player, type BattleReport, type RunState, type Warlord } from '../engine/run'
import { useGame } from '../state/store'
import { Ladder } from './Ladder'
import { Plate } from './Plate'
import { Sigil } from './Sigil'
import { describe as describeEvent, keyMoments } from './battleLog'
import { StackCard } from './StackCard'
import { FeedbackPrompt } from './Feedback'
import { MAX_WAR_TIER, clampTier, tierDef } from '../data/tiers'

/** How a spell's tally reads on the receipt (Design Notes 03 §2.6). */
const OUTCOME_WORD: Record<SpellOutcome, string> = {
  heal: 'healing',
  damage: 'damage',
  shield: 'Bulwark granted',
  atk: 'ATK granted',
  root: 'exchanges rooted',
  strikes: 'extra strikes',
}

/**
 * "Your spells: 42 healing, 2 casts" — the Magic branch was the one investment
 * a run could never audit, because its whole effect happened inside a battle.
 */
function spellReceipt(events: BattleEvent[], side: Side): string | null {
  let casts = 0
  const totals = new Map<SpellOutcome, number>()
  for (const e of events) {
    if (e.t !== 'spellCast' || e.side !== side) continue
    casts += 1
    totals.set(e.kind, (totals.get(e.kind) ?? 0) + e.amount)
  }
  if (casts === 0) return null
  const bits = [...totals].filter(([, n]) => n > 0).map(([k, n]) => `${n} ${OUTCOME_WORD[k]}`)
  bits.push(`${casts} cast${casts === 1 ? '' : 's'}`)
  return bits.join(', ')
}

/** One duellist on the result screen: portrait, name, remaining banner HP. */
function DuelPortrait({ warlord, you, win, dim }: { warlord: Warlord; you?: boolean; win?: boolean; dim?: boolean }) {
  const hero = HERO_BY_ID.get(warlord.heroId)
  const faction = FACTION_BY_ID.get(warlord.factionId)
  return (
    <div
      className="duel-portrait"
      data-win={win ? 'true' : undefined}
      data-dim={dim ? 'true' : undefined}
      style={{ ['--fc' as string]: faction?.colors.accent }}
    >
      <Plate src={HERO_ART_2X[warlord.heroId]} eager fallback={<Sigil id={hero?.sigil ?? 'shield'} size={26} />} />
      <span className="duel-scrim" aria-hidden="true" />
      {/* The lobby log names warlords, so the loser's card does too. */}
      <span className="duel-name">{you ? 'You' : warlord.name}</span>
      <span className="duel-hp">{Math.max(0, warlord.hp)}</span>
      {win && (
        <span className="duel-crown" aria-hidden="true">
          ♛
        </span>
      )}
    </div>
  )
}

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

  const mine = report ? spellReceipt(report.result.events, playerIsA ? 'a' : 'b') : null
  const theirs = report ? spellReceipt(report.result.events, playerIsA ? 'b' : 'a') : null

  const [showLog, setShowLog] = useState(false)
  const eliminated = !p.alive
  const headline = tie ? 'Standstill' : won ? 'Victory' : 'Defeat'

  return (
    <div className="screen">
      <div className="screen-body">
      <Ladder run={run} onInspect={(id) => store.inspect(id)} />

      {/* The duel, not a headline: winner lit and ringed, loser in grey. */}
      <div className="duel result-head">
        <DuelPortrait warlord={p} you win={won} dim={!won && !tie} />
        <div className="duel-mid">
          <div className="eyebrow">Round {run.round}</div>
          <div className="duel-word" data-tone={won ? 'win' : tie ? 'tie' : 'loss'}>
            {headline}
          </div>
        </div>
        {foe && <DuelPortrait warlord={foe} win={!won && !tie} dim={won} />}
      </div>

      <div className="panel row spread">
        <div>
          <div className="eyebrow">Your banner</div>
          <div className="result-figures" style={{ fontSize: 26, fontWeight: 800, color: p.hp <= 8 ? 'var(--danger)' : undefined }}>
            {Math.max(0, p.hp)} HP
          </div>
        </div>
        <div className="center">
          <div className="eyebrow">Damage taken</div>
          <div className="result-figures" style={{ fontSize: 26, fontWeight: 800 }}>{won ? '0' : `−${damage}`}</div>
        </div>
        <div className="center">
          <div className="eyebrow">Survivors</div>
          <div className="result-figures" style={{ fontSize: 26, fontWeight: 800 }}>
            {mySurvivors.reduce((n, s) => n + s.count, 0)}
          </div>
        </div>
      </div>

      {winnersSurvivors.length > 0 && (
        <div>
          <div className="eyebrow" style={{ marginBottom: 5 }}>
            {won ? 'Your warband, still standing' : tie ? 'Left on the field' : `What ${foe?.name ?? 'they'} had left`}
          </div>
          {/* The parade uses the shared card, not a bespoke thumbnail (DN07
              §2): what survived the battle should look like what stood on the
              board, because it is the same stack. */}
          <div className="survivor-strip" data-hscroll>
            {winnersSurvivors.map((sv) => {
              const def = unit(sv.unitId)
              return (
                <span key={sv.uid} className="survivor">
                  <StackCard unitId={sv.unitId} count={sv.count} atk={def.atk} hp={def.hp} eager />
                </span>
              )
            })}
          </div>
        </div>
      )}

      {won && (
        <div className="small dim center result-tip">
          Hero damage is <strong>⌈round ÷ 2⌉ + the tiers of your surviving stacks</strong> — the bigger your board
          finishes, the harder they fall.
        </div>
      )}

      {report && (mine || theirs) && (
        <div className="panel tiny" style={{ display: 'grid', gap: 2 }}>
          <div className="eyebrow">Spells</div>
          {mine && <div>Yours: {mine}</div>}
          {theirs && <div className="dim">{foe?.name ?? 'Theirs'}: {theirs}</div>}
        </div>
      )}

      {report && (
        <HowItWent report={report} playerIsA={playerIsA} showLog={showLog} onToggleLog={() => setShowLog((v) => !v)} />
      )}

      {/* §3: the moment the run is freshest. One line, five stars. */}
      <FeedbackPrompt />

      {/* One flexible region, two things it can hold. The full battle log
          REPLACES the lobby round-up rather than being added below it — that
          is what keeps Continue on screen when you go looking for detail. */}
      <div className="panel result-log">
        <div className="eyebrow" style={{ marginBottom: 4 }}>
          {showLog ? 'Full battle log' : 'This round across the lobby'}
        </div>
        {showLog && report
          ? report.result.events.map((e, i) => (
              <div key={i} className="tiny dim">
                {describeEvent(e, playerIsA)}
              </div>
            ))
          : run.log
              .filter((l) => l.startsWith(`R${run.round}:`))
              .map((l, i) => (
                <div key={i} className="tiny dim">
                  {l.replace(`R${run.round}: `, '')}
                </div>
              ))}
      </div>

      </div>

      <div className="action-bar">
        <button className="btn btn-primary" onClick={store.nextRound}>
          {run.finished || eliminated ? 'See final standing' : `Muster for round ${run.round + 1}`}
        </button>
      </div>
    </div>
  )
}

/**
 * "How it went" (Design Notes 04 §2.3) — three auto-picked moments, then the
 * whole log on demand. This is the screen that permanently answers "what
 * killed me?" without a designer on call.
 */
function HowItWent({
  report,
  playerIsA,
  showLog,
  onToggleLog,
}: {
  report: BattleReport
  playerIsA: boolean
  showLog: boolean
  onToggleLog: () => void
}) {
  const moments = keyMoments(report.result, playerIsA)
  if (moments.length === 0) return null
  return (
    <div className="panel" style={{ display: 'grid', gap: 4 }}>
      <div className="eyebrow">How it went</div>
      {moments.map((m) => (
        <div key={m.label} className="small moment" data-mine={m.mine ? 'true' : undefined}>
          <span className="moment-label">{m.label}</span> {m.text}
        </div>
      ))}
      <button className="btn btn-sm btn-ghost" onClick={onToggleLog}>
        {showLog ? 'Back to the lobby round-up' : 'See full battle log'}
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
  const tier = clampTier(run.tier)
  const record = store.save.tiers.records[String(tier)] ?? { runs: 0, wins: 0 }
  // Winning at the tier you are climbing is what opens the next rung, and the
  // headline button offers it (§5). At the top of the ladder there is no next.
  const raise = won && tier === clampTier(store.save.tiers.highestWon) && tier < MAX_WAR_TIER

  return (
    <div className="screen" data-scroll="true">
      <div className="center" style={{ marginTop: 28 }}>
        <div className="hero-art hero-art-ceremony" style={{ ['--fc' as string]: f.colors.primary }} data-big="true">
          <Plate src={HERO_ART_2X[p.heroId]} eager fallback={<Sigil id={hero.sigil} size={56} />} />
        </div>
        {/* Altitude first on a defeat above Tier 1 (§5): an expedition report,
            not a failure screen. How high you got is the headline; where you
            placed is detail. */}
        {!won && tier > 1 ? (
          <>
            <div className="eyebrow">You fell at</div>
            <h1 style={{ color: 'var(--ink)' }}>War Tier {tier}</h1>
            <div className="small dim">
              Few banners fly this high — {ordinal(placement)} of eight, {hero.name} of {f.name}.
            </div>
            <div className="small dim">
              {record.wins > 0
                ? `Tier ${tier}: ${record.runs} attempt${record.runs === 1 ? '' : 's'}, ${record.wins} taken.`
                : `Tier ${tier}: ${record.runs} attempt${record.runs === 1 ? '' : 's'}, summit unclaimed.`}
            </div>
          </>
        ) : (
          <>
            <h1 style={{ color: won ? 'var(--gold)' : 'var(--ink)' }}>{won ? 'Last Banner Standing' : ordinal(placement)}</h1>
            <div className="small dim">
              {hero.name} {hero.title} · {f.name}
              {won && tier > 1 ? ` · War Tier ${tier}` : ''}
            </div>
          </>
        )}
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

      {/* The end of the whole run — the single best moment to ask, and the one
          screen that had no way to say anything at all. */}
      <FeedbackPrompt prominent />

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

      {/* The fork (§2/§5): raising the banner seeds the *next* run one tier
          higher. The climb happens across runs, so every attempt still
          contains a full draft arc — which is the part that is the game. */}
      {raise && (
        <button
          className="btn btn-gold raise-banner"
          onClick={() => store.start(p.factionId, p.heroId, store.save.settings.difficulty, tier + 1)}
        >
          <strong>Raise the Banner</strong>
          <span className="tiny">War Tier {tier + 1} — {tierDef(tier + 1).name}</span>
        </button>
      )}
      <div className="row" style={{ gap: 8 }}>
        <button className="btn grow" onClick={store.abandon}>
          Home
        </button>
        <button
          className="btn btn-primary grow"
          onClick={() => store.start(p.factionId, p.heroId, store.save.settings.difficulty, tier)}
        >
          {raise ? 'Claim Victory' : `Run Tier ${tier} again`}
        </button>
      </div>
    </div>
  )
}
