/**
 * Who you are, and the three things you can do about it.
 *
 * The account is created silently on first load, which is right (§10.1: no
 * signup step) but left a tester with no way to know they had one, or what they
 * were called. This shows the name permanently and, when there is no account at
 * all — an offline first load, or a rate-limited one — offers to make one.
 *
 * It asks; it never blocks. §10.1's ten-seconds-to-faction-select still holds
 * whether or not anyone taps this.
 */
import { useEffect, useState } from 'react'
import { ensureAccount, onAccountChanged, readAccount, type DeviceAccount } from '../net/account'
import { UiIcon } from './UiIcons'

export function IdentityBar({
  onAccount,
  onFeedback,
  onSettings,
}: {
  onAccount: () => void
  onFeedback: () => void
  onSettings: () => void
}) {
  // Subscribed rather than read once: the account arrives from a background
  // request after first paint.
  const [account, setAccount] = useState<DeviceAccount | null>(() => readAccount())
  const [creating, setCreating] = useState(false)
  useEffect(() => onAccountChanged(setAccount), [])

  const create = async () => {
    setCreating(true)
    const made = await ensureAccount()
    setCreating(false)
    // Straight into the sheet on success, so the first thing they do is name
    // themselves rather than wonder what just happened.
    if (made) onAccount()
  }

  return (
    <div className="identity">
      {account ? (
        <button className="identity-who" onClick={onAccount} aria-label={`Signed in as ${account.displayName}. Change name or link a device.`}>
          <span className="identity-mark" aria-hidden="true">
            <UiIcon id="account" size={15} />
          </span>
          <span className="identity-name">{account.displayName}</span>
        </button>
      ) : (
        <button className="identity-who identity-signin" onClick={create} disabled={creating}>
          <span className="identity-mark" aria-hidden="true">
            <UiIcon id="account" size={15} />
          </span>
          <span className="identity-name">{creating ? 'Creating…' : 'Create your banner'}</span>
        </button>
      )}

      <div className="identity-actions">
        {/* Labelled and gold, not a third anonymous square: feedback is the one
            thing this playtest actually needs testers to find. */}
        <button className="icon-btn icon-btn-label fb-cta" onClick={onFeedback}>
          <UiIcon id="feedback" size={16} />
          <span>Feedback</span>
        </button>
        <button className="icon-btn" onClick={onSettings} aria-label="Settings">
          <UiIcon id="settings" />
        </button>
      </div>
    </div>
  )
}
