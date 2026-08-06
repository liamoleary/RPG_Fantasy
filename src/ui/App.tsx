import { useEffect, useState } from 'react'
import { FACTION_BY_ID } from '../data/index'
import { player } from '../engine/run'
import { useGame } from '../state/store'
import { BattleScreen } from './BattleScreen'
import { HomeScreen } from './HomeScreen'
import { MusterScreen } from './MusterScreen'
import { ResultScreen, RunOverScreen } from './ResultScreen'
import './styles.css'
import { applyUpdate, onUpdateAvailable } from '../net/version'

export function App() {
  const { run, screen, save, playerBattle } = useGame()
  const [updateReady, setUpdateReady] = useState(false)

  // §6: one toast, dismissible, never a modal. A tester mid-run should not be
  // interrupted to take a deploy.
  useEffect(() => {
    onUpdateAvailable(() => setUpdateReady(true))
    return () => onUpdateAvailable(null)
  }, [])

  // Faction theming is systemic: one set of custom properties reskins
  // camp, cards, spell banners and buttons (§11.2).
  useEffect(() => {
    const root = document.documentElement
    const f = run ? FACTION_BY_ID.get(player(run).factionId) : null
    if (f) {
      root.style.setProperty('--fx-primary', f.colors.primary)
      root.style.setProperty('--fx-secondary', f.colors.secondary)
      root.style.setProperty('--fx-accent', f.colors.accent)
      root.style.setProperty('--fx-radius', f.shape)
    } else {
      root.style.removeProperty('--fx-primary')
      root.style.removeProperty('--fx-secondary')
      root.style.removeProperty('--fx-accent')
      root.style.removeProperty('--fx-radius')
    }
  }, [run, screen])

  useEffect(() => {
    document.body.classList.toggle('reduced-motion', save.settings.reducedMotion)
  }, [save.settings.reducedMotion])

  return (
    <div className="app">
      {screen === 'home' || !run ? (
        <HomeScreen />
      ) : screen === 'muster' ? (
        <MusterScreen run={run} />
      ) : screen === 'battle' ? (
        <BattleScreen run={run} result={playerBattle} />
      ) : screen === 'result' ? (
        <ResultScreen run={run} />
      ) : (
        <RunOverScreen run={run} />
      )}

      {updateReady && (
        <button className="update-toast" onClick={() => void applyUpdate()}>
          New version — tap to update
        </button>
      )}
    </div>
  )
}
