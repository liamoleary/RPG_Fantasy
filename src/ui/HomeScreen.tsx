import { useState } from 'react'
import { AccountSheet, NamePrompt } from './AccountSheet'
import { FeedbackSheet } from './Feedback'
import { HERO_ART_2X } from '../data/art'
import { InstallCard } from './InstallCard'
import { FACTIONS, HEROES } from '../data/index'
import type { FactionId } from '../data/types'
import type { Difficulty } from '../engine/rivals'
import { useGame } from '../state/store'
import { GlossarySheet } from './Glossary'
import { Plate } from './Plate'
import { Sigil } from './Sigil'

const DIFFICULTIES: { id: Difficulty; name: string; text: string }[] = [
  { id: 'skirmish', name: 'Skirmish', text: 'Rivals make loose calls. A gentle lobby.' },
  { id: 'standard', name: 'Standard', text: 'Rivals draft and position competently.' },
  { id: 'warlord', name: 'Warlord', text: 'Rivals play tight. Every mistake costs.' },
]

export function HomeScreen() {
  const { save, start, resume } = useGame()
  const [factionId, setFactionId] = useState<FactionId>('vanguard')
  const [heroId, setHeroId] = useState('h_berrik')
  const [difficulty, setDifficulty] = useState<Difficulty>(save.settings.difficulty)
  const [showSettings, setShowSettings] = useState(false)
  const [showKeywords, setShowKeywords] = useState(false)
  const [showAccount, setShowAccount] = useState(false)
  const [showFeedback, setShowFeedback] = useState(false)

  const heroes = HEROES.filter((h) => h.faction === factionId)
  const heroUnlocked = (renown: number) => renown === 0 || save.renown >= renown
  const activeHero = heroes.find((h) => h.id === heroId) ?? heroes[0]
  const canStart = heroUnlocked(activeHero.unlockRenown)

  const pickFaction = (id: FactionId) => {
    setFactionId(id)
    const first = HEROES.find((h) => h.faction === id)
    if (first) setHeroId(first.id)
  }

  const faction = FACTIONS.find((f) => f.id === factionId)!

  return (
    <div className="screen">
      <div className="screen-body">
        <div className="title">BANNERFELL</div>

        <NamePrompt onOpen={() => setShowAccount(true)} />

        <InstallCard runsFinished={save.stats.runs} />

        <div className="row spread panel" style={{ padding: '6px 10px' }}>
          <div>
            <div className="eyebrow">Renown</div>
            <div className="gold" style={{ fontSize: 17 }}>
              {save.renown}
            </div>
          </div>
          <div className="center">
            <div className="eyebrow">Runs</div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>{save.stats.runs}</div>
          </div>
          <div className="center">
            <div className="eyebrow">Victories</div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>{save.stats.wins}</div>
          </div>
          <button className="btn btn-sm btn-ghost" onClick={() => setShowFeedback(true)} aria-label="Send feedback">
            ✒
          </button>
          <button className="btn btn-sm btn-ghost" onClick={() => setShowAccount(true)} aria-label="Your banner">
            ☰
          </button>
          <button className="btn btn-sm btn-ghost" onClick={() => setShowSettings(true)} aria-label="Settings">
            ⚙
          </button>
        </div>

        {save.activeRun && !save.activeRun.finished && (
          <button className="btn btn-gold" onClick={resume}>
            Resume run — round {save.activeRun.round}
          </button>
        )}

        <div className="eyebrow">Banner</div>
        <div className="pick-row">
          {FACTIONS.map((f) => (
            <button
              key={f.id}
              className="pick-tile"
              style={{ ['--fc' as string]: f.colors.primary }}
              data-on={f.id === factionId}
              onClick={() => pickFaction(f.id)}
            >
              <span className="faction-icon">
                <Sigil id={f.id === 'vanguard' ? 'shield' : f.id === 'verdant' ? 'leaf' : 'fang'} size={18} />
              </span>
              <span className="pick-name">{f.name.replace(/^The /, '')}</span>
            </button>
          ))}
        </div>
        <div className="tiny faction-line" style={{ color: faction.colors.accent }}>
          <strong>{faction.mechanic}</strong> — {faction.mechanicText}
        </div>

        {/* Two portraits side by side: the choice IS the layout. The picked
            hero wears the gold ring, the other waits at half-light. */}
        <div className="eyebrow">Hero</div>
        <div className="hero-duo" style={{ ['--fc' as string]: faction.colors.primary }}>
          {heroes.map((h) => {
            const locked = !heroUnlocked(h.unlockRenown)
            const chosen = h.id === heroId
            return (
              <button
                key={h.id}
                className="hero-choice"
                data-on={chosen}
                data-locked={locked}
                onClick={() => !locked && setHeroId(h.id)}
                aria-label={locked ? `${h.name} — ${h.unlockRenown} Renown to unlock` : h.name}
              >
                <Plate src={HERO_ART_2X[h.id]} eager priority fallback={<Sigil id={h.sigil} size={34} />} />
                <span className="choice-scrim" aria-hidden="true" />
                <span className="choice-name">{h.name}</span>
                {locked && <span className="choice-lock">🔒 {h.unlockRenown}</span>}
                {chosen && !locked && (
                  <span className="choice-check" aria-hidden="true">
                    ✓
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <div className="faq">
          <span>No sign-up — you're already playing.</span>
          <span>☰ moves your account to another phone.</span>
          <span>✒ tells us what you think. Please do.</span>
        </div>

        <div className="hero-kit">
          <span className="tiny dim blurb-flavour">Passive · {activeHero.passive.text}</span>
          <span className="tiny" style={{ color: 'var(--fx-secondary)' }}>
            {activeHero.spell.name} · {activeHero.spell.text}
          </span>
          {!canStart && <span className="tiny gold">{activeHero.unlockRenown} Renown to unlock</span>}
        </div>
      </div>

      <div className="action-bar">
        <button className="btn btn-primary" disabled={!canStart} onClick={() => start(factionId, activeHero.id, difficulty)}>
          New Run
        </button>
      </div>

      {showSettings && (
        <div className="scrim" onClick={() => setShowSettings(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2>Settings</h2>
            <div className="eyebrow">Difficulty</div>
            {DIFFICULTIES.map((d) => (
              <button
                key={d.id}
                className="boon"
                style={{ ['--bc' as string]: 'var(--fx-primary)' }}
                data-on={d.id === difficulty}
                onClick={() => {
                  setDifficulty(d.id)
                  // Save it now — otherwise the choice is lost unless a run starts.
                  useGame.getState().setDifficulty(d.id)
                }}
              >
                <span className="boon-branch">{d.id === difficulty ? '● selected' : 'select'}</span>
                <strong>{d.name}</strong>
                <span className="small dim">{d.text}</span>
              </button>
            ))}
            <label className="row spread">
              <span>Reduce motion</span>
              <input
                type="checkbox"
                checked={save.settings.reducedMotion}
                onChange={(e) => useGame.getState().setReducedMotion(e.target.checked)}
              />
            </label>
            <label className="row spread">
              <span>Default battle speed 2×</span>
              <input
                type="checkbox"
                checked={save.settings.speedDefault === 2}
                onChange={(e) => useGame.getState().setSpeed(e.target.checked ? 2 : 1)}
              />
            </label>
            <div className="eyebrow">Help</div>
            <button className="btn" onClick={() => setShowKeywords(true)}>
              Symbols &amp; keywords — what everything on a card means
            </button>
            <button className="btn btn-primary" onClick={() => setShowSettings(false)}>
              Done
            </button>
          </div>
        </div>
      )}

      {showKeywords && <GlossarySheet onClose={() => setShowKeywords(false)} />}

      {/* §11.7 / §8 step 7: the three lines a tester needs, and no more.
          Sits under the hero kit so it is read once and then ignored. */}
      {showAccount && <AccountSheet onClose={() => setShowAccount(false)} />}
      {showFeedback && <FeedbackSheet onClose={() => setShowFeedback(false)} />}
    </div>
  )
}
