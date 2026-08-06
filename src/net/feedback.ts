/**
 * Submitting feedback (Launch Plan §3).
 *
 * Fire-and-forget like everything else in net/: the widget closes the moment the
 * player taps Send and never shows a spinner or an error. A submission that
 * fails is lost, which is the right trade — §2's rule is that nothing blocks
 * play, and a modal apologising for a dropped rating would be worse than the
 * dropped rating.
 */
import { ensureAccount } from './account'
import { api } from './client'

export const FEEDBACK_CATEGORIES = ['Fun', 'Confusing', 'Too hard', 'Too easy', 'Bug', 'Idea'] as const
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number]

/** §3's free-text box. Capped well under the 64KB body limit. */
export const MESSAGE_MAX = 2000

export interface FeedbackSubmission {
  rating: number | null
  categories: FeedbackCategory[]
  message: string
  context: unknown
}

export async function submitFeedback(submission: FeedbackSubmission): Promise<boolean> {
  // ensureAccount, not readAccount: a device whose first visit was offline (or
  // rate-limited) has no token yet, and without this it could never send
  // feedback again for the whole session — the one case where a tester tries to
  // tell us something and we silently can't hear it.
  const account = await ensureAccount()
  if (!account) return false
  const res = await api<{ ok: true }>('POST', '/api/feedback', {
    token: account.token,
    body: {
      rating: submission.rating,
      categories: submission.categories,
      message: submission.message.slice(0, MESSAGE_MAX),
      context: submission.context,
    },
  })
  return res.ok
}
