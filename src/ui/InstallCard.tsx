import { useEffect, useState } from 'react'

/**
 * "Install Bannerfell" (Design Notes 04 §4).
 *
 * The manifest and the service worker already exist — what was missing is the
 * invitation. Chrome hands us a deferred `beforeinstallprompt` we can fire on a
 * tap; iOS Safari has no such thing, so the same card opens the two-step
 * Share → Add to Home Screen sheet instead. Never on first load: the card only
 * appears once a run has been finished, because a prompt you have not earned
 * is an interruption (and Chrome requires the engagement anyway).
 */

interface InstallEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISSED = 'bannerfell.install.dismissed'

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS reports installed mode on navigator, not through the media query.
    (navigator as { standalone?: boolean }).standalone === true
  )
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent)
}

/**
 * Desktop Chrome and Edge will happily install this as a windowed app, and
 * `beforeinstallprompt` fires there too — but Bannerfell is a phone game, and
 * "Install" on a machine with a browser window already open buys nothing and
 * costs a row of the home screen. Coarse pointer is the honest test for "this
 * is the device the install is for".
 */
function isTouchPrimary(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(pointer: coarse)').matches === true
}

export function InstallCard({ runsFinished }: { runsFinished: number }) {
  const [deferred, setDeferred] = useState<InstallEvent | null>(null)
  const [sheet, setSheet] = useState(false)
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISSED) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    const onPrompt = (e: Event) => {
      // Holding the event is the whole trick: fire it later, on a real tap.
      e.preventDefault()
      setDeferred(e as InstallEvent)
    }
    const onInstalled = () => setDeferred(null)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const ios = isIos()
  // Earn it first: nothing until a run has been played through.
  if (runsFinished < 1 || dismissed || isStandalone() || !isTouchPrimary()) return null
  if (!deferred && !ios) return null

  const close = () => {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISSED, '1')
    } catch {
      /* private mode — the card simply comes back next session */
    }
  }

  return (
    <>
      <div className="install-card">
        <span className="install-mark" aria-hidden="true">
          ⚑
        </span>
        <div className="grow" style={{ minWidth: 0 }}>
          <strong>Install Bannerfell</strong>
          <div className="tiny dim install-why">Full screen and offline.</div>
        </div>
        <button
          className="btn btn-sm btn-gold"
          onClick={async () => {
            if (ios) {
              setSheet(true)
              return
            }
            const e = deferred
            setDeferred(null)
            await e?.prompt()
            const choice = await e?.userChoice
            if (choice?.outcome === 'accepted') close()
          }}
        >
          Install
        </button>
        <button className="btn btn-sm btn-ghost" onClick={close} aria-label="Not now">
          ✕
        </button>
      </div>

      {sheet && (
        <div className="scrim" onClick={() => setSheet(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2>Add to Home Screen</h2>
            <div className="small dim">Safari installs by hand — two taps.</div>
            <div className="panel install-step">
              <span className="install-step-n">1</span>
              <div>
                Tap <strong>Share</strong> in Safari&apos;s toolbar.
                <div className="install-glyph" aria-hidden="true">
                  ⬆
                </div>
              </div>
            </div>
            <div className="panel install-step">
              <span className="install-step-n">2</span>
              <div>
                Choose <strong>Add to Home Screen</strong>.
                <div className="install-glyph" aria-hidden="true">
                  ⊞
                </div>
              </div>
            </div>
            <button className="btn btn-primary" onClick={() => setSheet(false)}>
              Done
            </button>
          </div>
        </div>
      )}
    </>
  )
}
