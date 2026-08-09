import { useEffect, useRef, useState } from 'react'
import type { Outcome } from '../state/store'
import { useGame } from '../state/store'
import { FeedbackSheet, Stars } from './Feedback'

/** How long the verdict holds before the game moves itself on. */
const HOLD_MS = 2200

/**
 * The verdict, stamped over the board that produced it, and then the game
 * carries on by itself (playtest: "it feels like an unnecessary page").
 *
 * A round of Bannerfell is about forty seconds. A full screen between every
 * one of them — that you always dismiss, and that repeats numbers the battle
 * just showed you — is a page in the way. So the result screen is gone from
 * the flow, and what it was actually for survives in three places: the
 * headline is this flash, the rating is the row at the bottom of it (the
 * moment a run is freshest is still the moment to ask), and the detail is one
 * tap away for the people who want it.
 *
 * Nothing here blocks. The timer advances the round on its own; a tap
 * advances immediately; touching the stars or opening the detail cancels the
 * timer, because at that point the player has said they are not finished.
 */
export function OutcomeFlash({ outcome, onDetails }: { outcome: Outcome; onDetails: () => void }) {
  const store = useGame()
  const [held, setHeld] = useState(false)
  const [rateAt, setRateAt] = useState<number | null>(null)
  const timer = useRef<number | null>(null)
  const advance = useRef(store.nextRound)
  advance.current = store.nextRound

  useEffect(() => {
    if (held) return
    timer.current = window.setTimeout(() => advance.current(), HOLD_MS)
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    }
  }, [held])

  const hold = () => setHeld(true)
  const word = outcome.verdict === 'win' ? 'Victory' : outcome.verdict === 'tie' ? 'Standstill' : 'Defeat'

  return (
    <div className="outcome" data-verdict={outcome.verdict} onClick={() => advance.current()} role="status">
      <div className="outcome-card" onClick={(e) => e.stopPropagation()}>
        <div className="outcome-word" data-verdict={outcome.verdict}>
          {word}
        </div>
        <div className="outcome-figures">
          <span>
            <b>{outcome.hp}</b> HP
          </span>
          <span className="outcome-dot" aria-hidden="true" />
          <span>
            {outcome.damage > 0 ? (
              <>
                <b>−{outcome.damage}</b> taken
              </>
            ) : (
              <>
                <b>0</b> taken
              </>
            )}
          </span>
          <span className="outcome-dot" aria-hidden="true" />
          <span>
            <b>{outcome.survivors}</b> left standing
          </span>
        </div>

        {/* One tap, on the beat the round ends. Touching it stops the clock. */}
        <div className="outcome-rate" onPointerDown={hold}>
          <Stars value={rateAt ?? 0} size={26} onPick={(n) => setRateAt(n)} />
        </div>

        <button
          className="btn btn-sm btn-ghost outcome-more"
          onClick={() => {
            hold()
            onDetails()
          }}
        >
          What happened?
        </button>

        {/* Always rendered, never conditional. Revealing it on hold made the
            card grow under the finger that was reaching for a star, which on a
            phone means the tap lands somewhere else — and it doubles as the
            obvious way out for anyone who does not know the backdrop is one. */}
        <button className="btn btn-primary outcome-go" onClick={() => advance.current()}>
          {outcome.verdict === 'loss' && outcome.hp <= 0 ? 'See final standing' : `Muster for round ${outcome.round + 1}`}
        </button>
      </div>
      {!held && <span className="outcome-bar" aria-hidden="true" />}
      {rateAt !== null && (
        <div onClick={(e) => e.stopPropagation()}>
          <FeedbackSheet initialRating={rateAt} onClose={() => setRateAt(null)} />
        </div>
      )}
    </div>
  )
}
