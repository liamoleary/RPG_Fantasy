/**
 * Meta-progression sync (Launch Plan §2).
 *
 * The server owns your legend; the device owns your run. Only `renown`,
 * `unlocks`, `feats` and `stats` live here. `activeRun` and `settings` are
 * deliberately absent — §2 rules them out, and a mid-run snapshot every phase
 * would hammer this endpoint for a handoff nobody asked for.
 */
import { Router } from 'express'
import { query } from '../db.js'
import { requireAccount } from '../lib/auth.js'
import { byAccount, createLimiter } from '../lib/ratelimit.js'
import { badRequest } from '../lib/validate.js'
import { SAVE_VERSION, validateMeta } from '../lib/save.js'

/* Generous: a run end, an unlock and a feat award can land in quick succession,
   and an offline device flushing its queue arrives in a burst. This exists to
   stop a loop hammering the database, not to ration honest play. */
const saveLimiter = createLimiter({ limit: 120, windowMs: 60 * 60 * 1000, key: byAccount, name: 'save' })

export function saveRoutes() {
  const router = Router()

  /** GET /api/save — the server's copy, or 404 when this account has none yet. */
  router.get('/save', requireAccount, async (req, res) => {
    try {
      const { rows } = await query('SELECT save_version, data, updated_at FROM saves WHERE account_id = $1', [
        req.account.id,
      ])
      if (rows.length === 0) return res.status(404).json({ error: 'no_save' })
      return res.json({ saveVersion: rows[0].save_version, data: rows[0].data, updatedAt: rows[0].updated_at })
    } catch (err) {
      console.error('[save] read failed:', err.message)
      return res.status(503).json({ error: 'unavailable' })
    }
  })

  /**
   * PUT /api/save — last-write-wins, with one guard (§2).
   *
   * A PUT whose renown is *lower* than what we hold is refused unless it is
   * flagged `runDelta`, i.e. it came from an actual run end. That single rule
   * stops a stale device — a tab left open since yesterday, a phone that just
   * came back online — from silently wiping progress, without building real
   * merge machinery. The 409 carries the stored save so the client can reapply
   * its delta without a second round trip.
   */
  router.put('/save', requireAccount, saveLimiter, async (req, res) => {
    const saveVersion = req.body?.saveVersion
    if (saveVersion !== SAVE_VERSION) {
      return badRequest(res, `saveVersion must be ${SAVE_VERSION}, got ${JSON.stringify(saveVersion)}`)
    }

    const checked = validateMeta(req.body?.data)
    if (!checked.ok) return badRequest(res, checked.reason)
    const meta = checked.meta
    const runDelta = req.body?.runDelta === true

    try {
      const existing = await query('SELECT renown, data FROM saves WHERE account_id = $1', [req.account.id])

      if (existing.rows.length > 0 && !runDelta && meta.renown < existing.rows[0].renown) {
        return res.status(409).json({
          error: 'stale_write',
          message: 'stored renown is higher; refetch and reapply your delta',
          saveVersion: SAVE_VERSION,
          data: existing.rows[0].data,
        })
      }

      const { rows } = await query(
        `INSERT INTO saves (account_id, save_version, renown, data, updated_at)
              VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (account_id) DO UPDATE
                SET save_version = EXCLUDED.save_version,
                    renown       = EXCLUDED.renown,
                    data         = EXCLUDED.data,
                    updated_at   = now()
           RETURNING updated_at`,
        [req.account.id, SAVE_VERSION, meta.renown, JSON.stringify(meta)],
      )
      return res.json({ ok: true, saveVersion: SAVE_VERSION, updatedAt: rows[0].updated_at })
    } catch (err) {
      console.error('[save] write failed:', err.message)
      return res.status(503).json({ error: 'unavailable' })
    }
  })

  return router
}

export const __testing = { saveLimiter }
