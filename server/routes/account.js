/**
 * Accounts and link codes (Launch Plan §1).
 *
 * The whole point of this file is that a tester reaches the tavern in seconds:
 * one unauthenticated POST creates an identity, and that identity is a random
 * string on their device. No email, no password, no recovery question — and so
 * nothing to breach beyond a display name.
 */
import { Router } from 'express'
import { dbEnabled, query, withTransaction } from '../db.js'
import { requireAccount } from '../lib/auth.js'
import { hashToken, newAccountId, newLinkCode, newToken, normaliseLinkCode } from '../lib/ids.js'
import { suggestName, validateDisplayName } from '../lib/names.js'
import { byIp, createLimiter } from '../lib/ratelimit.js'
import { badRequest, str } from '../lib/validate.js'

/** §1: single-use, 15-minute expiry. */
const LINK_CODE_TTL_MS = 15 * 60 * 1000

/* §1 caps account creation at 5/hour/IP so the endpoint can't be farmed. The
   link limiter is not in the spec but follows from it: a code is ~1.5M
   combinations and lives 15 minutes, which is only out of reach if guessing is
   slow. Ten attempts an hour makes it so. */
export const createAccountLimiter = createLimiter({ limit: 5, windowMs: 60 * 60 * 1000, key: byIp, name: 'account creation' })
export const linkAttemptLimiter = createLimiter({ limit: 10, windowMs: 60 * 60 * 1000, key: byIp, name: 'link' })

/** Uniform answer when the service is up but has no database (§2). */
function noDatabase(res) {
  return res.status(503).json({ error: 'no_database', message: 'persistence is unavailable; play continues locally' })
}

export function accountRoutes() {
  const router = Router()

  /**
   * POST /api/account — create a device account.
   * Returns the token exactly once; we keep only its hash and cannot reissue it.
   */
  router.post('/account', createAccountLimiter, async (req, res) => {
    if (!dbEnabled()) return noDatabase(res)

    // The client may send the name the player already picked, or nothing at all
    // and let the name-bank fill it in (§1).
    const requested = req.body?.displayName
    let displayName
    if (requested === undefined || requested === null || str(requested, 64) === '') {
      displayName = suggestName()
    } else {
      const check = validateDisplayName(requested)
      if (!check.ok) return badRequest(res, check.reason)
      displayName = check.name
    }

    const accountId = newAccountId()
    const token = newToken()
    const buildId = str(req.body?.buildId, 64) || null

    try {
      await query(
        'INSERT INTO accounts (id, display_name, token_hashes, build_id) VALUES ($1, $2, ARRAY[$3], $4)',
        [accountId, displayName, hashToken(token), buildId],
      )
      const linkCode = await issueLinkCode(accountId)
      return res.status(201).json({ accountId, token, displayName, linkCode: linkCode.code, linkCodeExpiresAt: linkCode.expiresAt })
    } catch (err) {
      console.error('[account] create failed:', err.message)
      return res.status(503).json({ error: 'create_failed', message: 'could not create account' })
    }
  })

  /** GET /api/account — who am I, and what have I got. */
  router.get('/account', requireAccount, async (req, res) => {
    try {
      const { rows } = await query(
        `SELECT a.id, a.display_name, a.created_at,
                COALESCE(array_length(a.token_hashes, 1), 0) AS devices,
                COALESCE(s.renown, 0) AS renown
           FROM accounts a
           LEFT JOIN saves s ON s.account_id = a.id
          WHERE a.id = $1`,
        [req.account.id],
      )
      if (rows.length === 0) return res.status(404).json({ error: 'not_found' })
      return res.json({
        accountId: rows[0].id,
        displayName: rows[0].display_name,
        devices: Number(rows[0].devices),
        renown: Number(rows[0].renown),
        createdAt: rows[0].created_at,
      })
    } catch (err) {
      console.error('[account] read failed:', err.message)
      return noDatabase(res)
    }
  })

  /** PATCH /api/account — rename. The player picks their name after the account
   *  already exists (§1), so this is the endpoint that actually sets it. */
  router.patch('/account', requireAccount, async (req, res) => {
    const check = validateDisplayName(req.body?.displayName)
    if (!check.ok) return badRequest(res, check.reason)
    try {
      await query('UPDATE accounts SET display_name = $2 WHERE id = $1', [req.account.id, check.name])
      return res.json({ accountId: req.account.id, displayName: check.name })
    } catch (err) {
      console.error('[account] rename failed:', err.message)
      return noDatabase(res)
    }
  })

  /**
   * POST /api/account/code — mint a fresh link code (§1: regenerable).
   * Any unused code for this account is retired, so the screen only ever shows
   * one live code and an old screenshot stops working.
   */
  router.post('/account/code', requireAccount, async (req, res) => {
    try {
      const { code, expiresAt } = await issueLinkCode(req.account.id)
      return res.status(201).json({ linkCode: code, expiresAt })
    } catch (err) {
      console.error('[account] code failed:', err.message)
      return noDatabase(res)
    }
  })

  /**
   * POST /api/account/link — redeem a code on a second device.
   *
   * Grants that device its *own* token rather than moving the existing one: §1
   * describes losing "every linked device" as what loses the account, so a phone
   * and a laptop must be able to hold the account at the same time. The tokens
   * are per-device, which also means one can later be revoked without the other.
   */
  router.post('/account/link', linkAttemptLimiter, async (req, res) => {
    if (!dbEnabled()) return noDatabase(res)
    const code = normaliseLinkCode(req.body?.linkCode)
    if (!code) return badRequest(res, 'link code should look like BRAVE-STAG-41')

    const token = newToken()
    try {
      const account = await withTransaction(async (q) => {
        // Lock the row so two devices racing the same code can't both win.
        const { rows } = await q(
          `SELECT account_id, expires_at, used_at FROM link_codes WHERE code = $1 FOR UPDATE`,
          [code],
        )
        if (rows.length === 0) return { error: 'unknown' }
        if (rows[0].used_at !== null) return { error: 'used' }
        if (new Date(rows[0].expires_at).getTime() <= Date.now()) return { error: 'expired' }

        const accountId = rows[0].account_id
        await q('UPDATE link_codes SET used_at = now() WHERE code = $1', [code])
        await q('UPDATE accounts SET token_hashes = array_append(token_hashes, $2), last_seen = now() WHERE id = $1', [
          accountId,
          hashToken(token),
        ])
        const named = await q('SELECT display_name FROM accounts WHERE id = $1', [accountId])
        return { accountId, displayName: named.rows[0]?.display_name ?? '' }
      })

      if (account.error) {
        // One message for all three failures: a code that is wrong, spent or
        // stale should be indistinguishable to someone guessing.
        return res.status(404).json({ error: 'invalid_code', message: 'that code is not valid — generate a new one' })
      }
      return res.json({ accountId: account.accountId, token, displayName: account.displayName })
    } catch (err) {
      console.error('[account] link failed:', err.message)
      return noDatabase(res)
    }
  })

  return router
}

/** Retire this account's live codes and mint one more. */
async function issueLinkCode(accountId) {
  const code = newLinkCode()
  const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS)
  await query('UPDATE link_codes SET used_at = now() WHERE account_id = $1 AND used_at IS NULL', [accountId])
  await query(
    `INSERT INTO link_codes (code, account_id, expires_at) VALUES ($1, $2, $3)
       ON CONFLICT (code) DO UPDATE SET account_id = EXCLUDED.account_id,
                                        expires_at = EXCLUDED.expires_at,
                                        used_at = NULL`,
    [code, accountId, expiresAt],
  )
  return { code, expiresAt: expiresAt.toISOString() }
}

export const __testing = { LINK_CODE_TTL_MS, issueLinkCode }
