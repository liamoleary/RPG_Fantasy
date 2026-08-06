/**
 * Feedback capture (Launch Plan §3).
 *
 * One row per submission, with the auto-captured context as jsonb. Requires an
 * account so §5's export can group by tester, but is otherwise as permissive as
 * §3 asks: every field is optional except that *something* was said — a bare
 * star rating is a valid submission.
 */
import { Router } from 'express'
import { query } from '../db.js'
import { requireAccount } from '../lib/auth.js'
import { byAccount, createLimiter } from '../lib/ratelimit.js'
import { badRequest, enumArray, int, jsonWithin, str } from '../lib/validate.js'

/** §3: rate-limited 10/hour/account. */
const feedbackLimiter = createLimiter({ limit: 10, windowMs: 60 * 60 * 1000, key: byAccount, name: 'feedback' })

export const CATEGORIES = ['Fun', 'Confusing', 'Too hard', 'Too easy', 'Bug', 'Idea']
export const MESSAGE_MAX = 2000
/** The context is open-ended by design, so it gets a byte budget, not a schema.
 *  A Bug report carries 50 compacted battle events and lands far under this. */
export const CONTEXT_MAX_BYTES = 32 * 1024

export function feedbackRoutes() {
  const router = Router()

  router.post('/feedback', requireAccount, feedbackLimiter, async (req, res) => {
    const rating = int(req.body?.rating, 1, 5, null)
    const categories = enumArray(req.body?.categories, CATEGORIES, CATEGORIES.length)
    const message = str(req.body?.message, MESSAGE_MAX)

    // Something has to have been said. A submission with no stars, no chips and
    // no words is a stray tap, not feedback.
    if (rating === null && categories.length === 0 && message.length === 0) {
      return badRequest(res, 'feedback needs a rating, a category or a message')
    }

    const context = jsonWithin(req.body?.context, CONTEXT_MAX_BYTES)
    if (context === null) return badRequest(res, `context must serialise to under ${CONTEXT_MAX_BYTES} bytes`)

    // §6: tag every row with the build, so a complaint can be placed either side
    // of a fix. Trust the context's copy, which the client stamps at capture.
    const buildId = str(context?.buildId, 64) || str(req.body?.buildId, 64) || null

    try {
      const { rows } = await query(
        `INSERT INTO feedback (account_id, rating, categories, message, build_id, context)
              VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [req.account.id, rating, categories, message, buildId, JSON.stringify(context)],
      )
      return res.status(201).json({ ok: true, id: Number(rows[0].id) })
    } catch (err) {
      console.error('[feedback] write failed:', err.message)
      return res.status(503).json({ error: 'unavailable' })
    }
  })

  return router
}

export const __testing = { feedbackLimiter }
