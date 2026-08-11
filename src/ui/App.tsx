import { useEffect, useState } from 'react'
import { FACTION_BY_ID } from '../data/index'
import { player } from '../engine/run'
import { useGame } from '../state/store'
import { BattleScreen } from './BattleScreen'
import { HomeScreen } from './HomeScreen'
import { MusterScreen } from './MusterScreen'
import { RunOverScreen } from './ResultScreen'
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

  /**
   * Let a plain mouse wheel drive the horizontal strips — the hand, the ladder,
   * the survivor row.
   *
   * These were built as swipeable rows and on touch they are exactly right. On
   * a desktop with a mouse they were unreachable: the scrollbar is hidden by
   * design, there is no swipe, and a vertical wheel over an `overflow-x` row
   * does nothing in Chrome once `scroll-snap-type` is on. That left the War
   * Camp with recruits a player could not scroll to.
   *
   * One delegated listener rather than a hook per strip, so a row added later
   * only has to opt in with `data-hscroll`. Non-passive because it must be able
   * to take the event — but only when the row can actually move in that
   * direction, so a wheel at either end still scrolls the page behind it.
   */
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const target = e.target as Element | null
      const strip = target?.closest?.('[data-hscroll]') as HTMLElement | null
      if (!strip) return
      // A trackpad's horizontal gesture already works; don't fight it.
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      const max = strip.scrollWidth - strip.clientWidth
      if (max <= 0) return
      const next = Math.max(0, Math.min(max, strip.scrollLeft + e.deltaY))
      if (next === strip.scrollLeft) return
      e.preventDefault()
      strip.scrollLeft = next
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [])

  // Camp is plum-dark, the battlefield is night (DN07 §4). The ground is
  // painted on <body>, so the shift has to live there too — and putting it on
  // a data attribute rather than a class means the theme redefines a handful
  // of tokens and every descendant follows, with no per-component branching.
  useEffect(() => {
    document.body.dataset.ground = screen === 'battle' ? 'dusk' : 'dawn'
  }, [screen])

  return (
    <div className="app">
      {screen === 'home' || !run ? (
        <HomeScreen />
      ) : screen === 'muster' ? (
        <MusterScreen run={run} />
      ) : screen === 'battle' ? (
        <BattleScreen run={run} result={playerBattle} />
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
