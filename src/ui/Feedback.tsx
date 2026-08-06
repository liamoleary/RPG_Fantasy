/**
 * The feedback widget (Launch Plan §3).
 *
 * Two shapes, one sheet behind them:
 *   - a quill button on the Muster screen, out of the way
 *   - a star row on the Result screen, where the run is fresh
 *
 * Tapping a star on the Result screen opens the sheet with that rating already
 * set, so the whole thing really is two taps: star, Send. Nothing is mandatory,
 * nothing interrupts — this never opens itself.
 *
 * Deliberately almost wordless, per the house rule: stars, six chips, one box.
 */
import { useState } from 'react'
import { readAccount } from '../net/account'
import { FEEDBACK_CATEGORIES, MESSAGE_MAX, submitFeedback, type FeedbackCategory } from '../net/feedback'
import { buildContext } from '../net/feedbackContext'
import { useGame } from '../state/store'

function Stars({ value, onPick, size = 30 }: { value: number; onPick: (n: number) => void; size?: number }) {
  return (
    <div className="stars" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          className="star"
          role="radio"
          aria-checked={n === value}
          aria-label={`${n} of 5`}
          data-on={n <= value}
          style={{ fontSize: size }}
          onClick={() => onPick(n)}
        >
          ★
        </button>
      ))}
    </div>
  )
}

export function FeedbackSheet({ initialRating = 0, onClose }: { initialRating?: number; onClose: () => void }) {
  const [rating, setRating] = useState(initialRating)
  const [categories, setCategories] = useState<FeedbackCategory[]>([])
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)

  const toggle = (c: FeedbackCategory) =>
    setCategories((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]))

  const canSend = rating > 0 || categories.length > 0 || message.trim().length > 0

  const send = () => {
    const state = useGame.getState()
    const context = buildContext({
      run: state.run,
      screen: state.screen,
      playerBattle: state.playerBattle,
      account: readAccount(),
      // §3: a Bug report carries the battle log; everything else doesn't need it.
      includeBattleLog: categories.includes('Bug'),
    })
    // Not awaited: the sheet closes now and the request finishes on its own.
    void submitFeedback({ rating: rating > 0 ? rating : null, categories, message: message.trim(), context })
    setSent(true)
    setTimeout(onClose, 700)
  }

  return (
    <div className="scrim scrim-solid" onClick={onClose}>
      <div className="sheet feedback-sheet" onClick={(e) => e.stopPropagation()}>
        {sent ? (
          <div className="feedback-thanks">
            <div className="feedback-tick">✓</div>
            <strong>Thanks</strong>
          </div>
        ) : (
          <>
            <Stars value={rating} onPick={setRating} />

            <div className="chip-row">
              {FEEDBACK_CATEGORIES.map((c) => (
                <button key={c} className="fb-chip" data-on={categories.includes(c)} onClick={() => toggle(c)}>
                  {c}
                </button>
              ))}
            </div>

            <textarea
              className="fb-text"
              rows={3}
              maxLength={MESSAGE_MAX}
              placeholder="Anything else?"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />

            <div className="sheet-foot">
              <div className="sheet-actions row">
                <button className="btn btn-ghost" onClick={onClose}>
                  Close
                </button>
                <button className="btn btn-primary" disabled={!canSend} onClick={send}>
                  Send
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/** The quill button — Muster screen (§3: "small banner-and-quill button"). */
export function FeedbackButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="btn btn-sm btn-ghost fb-quill" onClick={() => setOpen(true)} aria-label="Send feedback">
        ✒
      </button>
      {open && <FeedbackSheet onClose={() => setOpen(false)} />}
    </>
  )
}

/** The prominent form — Result screen (§3: "How was that run?"). */
export function FeedbackPrompt() {
  const [openAt, setOpenAt] = useState<number | null>(null)
  return (
    <>
      <div className="fb-prompt">
        <span className="eyebrow">How was that run?</span>
        <Stars value={0} size={26} onPick={(n) => setOpenAt(n)} />
      </div>
      {openAt !== null && <FeedbackSheet initialRating={openAt} onClose={() => setOpenAt(null)} />}
    </>
  )
}
