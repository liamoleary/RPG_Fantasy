import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { startSync } from './net/bootstrap'
import { startVersionWatch } from './net/version'
import { App } from './ui/App'
import { warmArtCache } from './ui/preload'

const el = document.getElementById('root')
if (!el) throw new Error('#root missing')

createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// After the render call, never before it: the game is interactive off
// localStorage, and §2 forbids any of this from gating play.
startSync()
startVersionWatch()

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then(() => warmArtCache())
      .catch(() => {
        // Offline play is a bonus, never a requirement.
      })
  })
}
