import { useState } from 'react'
import { HERO_ART, HERO_ART_2X } from '../data/art'
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

  const heroes = HEROES.filter((h) => h.faction === factionId)
  const heroUnlocked = (renown: number) => renown === 0 || save.renown >= renown
  const activeHero = heroes.find((h) => h.id === heroId) ?? heroes[0]
  const canStart = heroUnlocked(activeHero.unlockRenown)

  const pickFaction = (id: FactionId) => {
    setFactionId(id)
    const first = HEROES.find((h) => h.faction === id)
    if (first) setHeroId(first.id)
  }

  return (
    <div className="screen" data-scroll="true">
      <div className="title">BANNERFELL</div>
      <div className="center small dim" style={{ marginTop: -8 }}>
        Draft a warband. Outlast seven rival warlords.
      </div>

      <InstallCard runsFinished={save.stats.runs} />

      <div className="row spread panel" style={{ padding: '8px 12px' }}>
        <div>
          <div className="eyebrow">Renown</div>
          <div className="gold" style={{ fontSize: 19 }}>
            {save.renown}
          </div>
        </div>
        <div className="center">
          <div className="eyebrow">Runs</div>
          <div style={{ fontSize: 19, fontWeight: 800 }}>{save.stats.runs}</div>
        </div>
        <div className="center">
          <div className="eyebrow">Victories</div>
          <div style={{ fontSize: 19, fontWeight: 800 }}>{save.stats.wins}</div>
        </div>
        <button className="btn btn-sm btn-ghost" onClick={() => setShowSettings(true)}>
          ⚙
        </button>
      </div>

      {save.activeRun && !save.activeRun.finished && (
        <button className="btn btn-gold" onClick={resume}>
          Resume run — round {save.activeRun.round}
        </button>
      )}

      <div className="eyebrow">Choose your banner</div>
      <div style={{ display: 'grid', gap: 8 }}>
        {FACTIONS.map((f) => (
          <button
            key={f.id}
            className="faction-card"
            style={{ ['--fc' as string]: f.colors.primary }}
            data-on={f.id === factionId}
            onClick={() => pickFaction(f.id)}
          >
            <span className="faction-icon">
              <Sigil id={f.id === 'vanguard' ? 'shield' : f.id === 'verdant' ? 'leaf' : 'fang'} size={22} />
            </span>
            <span className="grow">
              <span style={{ fontWeight: 800, display: 'block' }}>{f.name}</span>
              <span className="tiny dim">{f.blurb}</span>
              <span className="tiny" style={{ display: 'block', marginTop: 3, color: f.colors.accent }}>
                {f.mechanic} — {f.mechanicText}
              </span>
            </span>
          </button>
        ))}
      </div>

      <div className="eyebrow">Choose your hero</div>
      <div style={{ display: 'grid', gap: 8 }}>
        {heroes.map((h) => {
          const locked = !heroUnlocked(h.unlockRenown)
          const chosen = h.id === heroId
          return (
            <button
              key={h.id}
              className="faction-card hero-card"
              style={{ ['--fc' as string]: 'var(--fx-primary)' }}
              data-on={chosen}
              data-locked={locked}
              onClick={() => !locked && setHeroId(h.id)}
            >
              {/* The hero you have chosen gets the big plate; the rest stay
                  thumbnails. Locked heroes still show their art behind the
                  cost — seeing what you have not unlocked is the point. */}
              <span className="hero-art" data-big={chosen} data-locked={locked}>
                <Plate
                  src={chosen ? HERO_ART_2X[h.id] : HERO_ART[h.id]}
                  eager={chosen}
                  fallback={<Sigil id={h.sigil} size={chosen ? 40 : 22} />}
                />
                {locked && <span className="hero-lock gold tiny">🔒 {h.unlockRenown}</span>}
              </span>
              <span className="grow">
                <span style={{ fontWeight: 800, display: 'block' }}>
                  {h.name} {h.title}
                </span>
                <span className="tiny dim" style={{ display: 'block' }}>
                  Passive · {h.passive.text}
                </span>
                <span className="tiny" style={{ display: 'block', color: 'var(--fx-secondary)' }}>
                  {h.spell.name} · {h.spell.text}
                </span>
                {locked && <span className="tiny gold">{h.unlockRenown} Renown to unlock</span>}
              </span>
            </button>
          )
        })}
      </div>

      <button className="btn btn-primary" disabled={!canStart} onClick={() => start(factionId, activeHero.id, difficulty)}>
        New Run
      </button>
      <div className="center tiny dim" style={{ paddingBottom: 12 }}>
        8 warlords · 30 HP · ~20 minutes
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
    </div>
  )
}
