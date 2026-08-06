/**
 * The account screen (Launch Plan §1).
 *
 * §11 never gave this a commit, but §8's rollout checklist needs it twice —
 * "name picked" and "enter code, confirm same renown" — so here it is.
 *
 * What it is not: a signup. The account already exists by the time anyone sees
 * this; it was created silently on first load with a name from the bank. This
 * screen only lets a player change that name and move their account to a second
 * device. Nobody is ever stopped at it.
 */
import { useEffect, useState } from 'react'
import { NAME_MAX } from '../data/nameRules'
import { onAccountChanged, readAccount, redeemLinkCode, renameAccount, requestLinkCode, type DeviceAccount } from '../net/account'
import { useGame } from '../state/store'

type Mode = 'idle' | 'saving' | 'saved' | 'failed'

export function AccountSheet({ onClose }: { onClose: () => void }) {
  const account = readAccount()
  const [name, setName] = useState(account?.displayName ?? '')
  const [mode, setMode] = useState<Mode>('idle')

  const [code, setCode] = useState<string | null>(null)
  const [codeBusy, setCodeBusy] = useState(false)

  const [entry, setEntry] = useState('')
  const [linkState, setLinkState] = useState<'idle' | 'working' | 'bad' | 'done'>('idle')

  // Nothing here blocks: if the account never got created (offline first load),
  // the sheet still opens and simply has nothing to show.
  const offline = !account

  const save = async () => {
    const trimmed = name.trim()
    if (!trimmed || trimmed === account?.displayName) return onClose()
    setMode('saving')
    setMode((await renameAccount(trimmed)) ? 'saved' : 'failed')
  }

  const getCode = async () => {
    setCodeBusy(true)
    const res = await requestLinkCode()
    setCode(res?.linkCode ?? null)
    setCodeBusy(false)
  }

  const redeem = async () => {
    setLinkState('working')
    const linked = await redeemLinkCode(entry)
    if (!linked) return setLinkState('bad')
    setLinkState('done')
    // The device now belongs to another account; reload so the store, the save
    // and the sync layer all restart against it rather than half-swapping.
    setTimeout(() => window.location.reload(), 900)
  }

  useEffect(() => {
    if (mode === 'saved') {
      const t = setTimeout(onClose, 600)
      return () => clearTimeout(t)
    }
  }, [mode, onClose])

  return (
    <div className="scrim scrim-solid" onClick={onClose}>
      <div className="sheet account-sheet" onClick={(e) => e.stopPropagation()}>
        <h2>Your banner</h2>

        {offline ? (
          <p className="tiny dim">Offline — your progress is saved on this device and will sync when you reconnect.</p>
        ) : (
          <>
            <div className="eyebrow">Name</div>
            <input
              className="fb-text acct-input"
              value={name}
              maxLength={NAME_MAX}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              aria-label="Display name"
            />
            {mode === 'failed' && <span className="tiny" style={{ color: 'var(--danger)' }}>Try another name</span>}

            {/* §1: the link code is the only account credential a player ever
                sees. The token behind it never leaves localStorage. */}
            <div className="eyebrow">Play on another device</div>
            {code ? (
              <div className="link-code" aria-label="Your link code">
                {code}
              </div>
            ) : (
              <button className="btn btn-sm" disabled={codeBusy} onClick={getCode}>
                {codeBusy ? '…' : 'Get a code'}
              </button>
            )}
            {code && <span className="tiny dim">Type this on the other device. Good for 15 minutes, once.</span>}

            <div className="eyebrow">Have a code?</div>
            <div className="row" style={{ gap: 6 }}>
              <input
                className="fb-text acct-input"
                value={entry}
                maxLength={32}
                placeholder="BRAVE-STAG-41"
                aria-label="Enter a link code"
                onChange={(e) => setEntry(e.target.value)}
              />
              <button className="btn btn-sm" disabled={!entry.trim() || linkState === 'working'} onClick={redeem}>
                Use
              </button>
            </div>
            {linkState === 'bad' && <span className="tiny" style={{ color: 'var(--danger)' }}>That code is not valid</span>}
            {linkState === 'done' && <span className="tiny gold">Linked — reloading…</span>}
          </>
        )}

        <div className="sheet-foot">
          <div className="sheet-actions row">
            <button className="btn btn-ghost" onClick={onClose}>
              Close
            </button>
            <button className="btn btn-primary" onClick={save}>
              {mode === 'saved' ? '✓' : 'Done'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Shown once, under the title, until the player has named themselves. This is
 * the closest thing to a signup step and it is skippable by ignoring it — §10.1
 * requires reaching faction select in under ten seconds with no signup.
 */
export function NamePrompt({ onOpen }: { onOpen: () => void }) {
  // Subscribed, not read once: the account is created by a background request
  // after first paint, so a plain read here would always come back empty.
  const [account, setAccount] = useState<DeviceAccount | null>(() => readAccount())
  useEffect(() => onAccountChanged(setAccount), [])

  const named = useGame((s) => s.save.stats.runs) > 0
  if (!account || named) return null
  return (
    <button className="name-prompt" onClick={onOpen}>
      <span className="tiny dim">Playing as</span>
      <strong>{account.displayName}</strong>
      <span className="tiny gold">change</span>
    </button>
  )
}
