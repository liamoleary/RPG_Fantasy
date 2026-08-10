/**
 * Run telemetry (Launch Plan §4). One row per finished run.
 *
 * Self-reported, like the saves — §7 accepts that a motivated friend can lie to
 * this endpoint, and says not to build anti-cheat. What it does do is bound
 * every field, so a bad client can distort a number but never the schema.
 */
import { Router } from 'express'
import { query } from '../db.js'
import { requireAccount } from '../lib/auth.js'
import { byAccount, createLimiter } from '../lib/ratelimit.js'
import { badRequest, int, jsonWithin, str } from '../lib/validate.js'

/** A run is ~20 minutes, so 60/hour is far above honest play and still bounds a loop. */
const runsLimiter = createLimiter({ limit: 60, windowMs: 60 * 60 * 1000, key: byAccount, name: 'run report' })

export const DETAILS_MAX_BYTES = 32 * 1024
const MAX_ROUNDS = 200
const MAX_HOURS_MS = 12 * 60 * 60 * 1000

export function runRoutes() {
  const router = Router()

  router.post('/runs', requireAccount, runsLimiter, async (req, res) => {
    const heroId = str(req.body?.heroId, 64)
    const factionId = str(req.body?.factionId, 64)
    if (!heroId || !factionId) return badRequest(res, 'heroId and factionId are required')

    const placement = int(req.body?.placement, 1, 99, null)
    const rounds = int(req.body?.rounds, 0, MAX_ROUNDS, 0)
    const durationMs = int(req.body?.durationMs, 0, MAX_HOURS_MS, null)
    const buildId = str(req.body?.buildId, 64) || null
    // Bounded like every other field: a bad client can lie about its tier, but
    // it cannot put anything outside the ladder into the column (DN09 §7.4).
    const tier = int(req.body?.tier, 1, 10, 1)

    const details = jsonWithin(req.body?.details, DETAILS_MAX_BYTES)
    if (details === null) return badRequest(res, `details must serialise to under ${DETAILS_MAX_BYTES} bytes`)

    try {
      const { rows } = await query(
        `INSERT INTO runs (account_id, hero_id, faction_id, placement, rounds, duration_ms, build_id, tier, details)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [req.account.id, heroId, factionId, placement, rounds, durationMs, buildId, tier, JSON.stringify(details)],
      )
      return res.status(201).json({ ok: true, id: Number(rows[0].id) })
    } catch (err) {
      console.error('[runs] write failed:', err.message)
      return res.status(503).json({ error: 'unavailable' })
    }
  })

  return router
}

export const __testing = { runsLimiter }
