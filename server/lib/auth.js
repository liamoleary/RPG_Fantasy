/**
 * Bearer auth (Launch Plan §1).
 *
 * The client holds a 128-bit token; we hold only its SHA-256. Every
 * authenticated call is one indexed lookup against `accounts.token_hashes`.
 * There is no session, no refresh, and nothing to expire — the token is the
 * account until the device loses it.
 */
import { dbEnabled, query } from '../db.js'
import { hashToken } from './ids.js'

/** How stale `last_seen` may get before we spend a write on it (§1). */
const LAST_SEEN_INTERVAL_MS = 5 * 60 * 1000

export function bearerFrom(req) {
  const header = req.get?.('authorization') ?? req.headers?.authorization ?? ''
  const match = /^Bearer\s+([A-Za-z0-9._-]{8,256})$/.exec(String(header).trim())
  return match ? match[1] : ''
}

/**
 * Resolves the account behind a request, or null. Never throws — a database
 * outage reads as "not signed in", which the client already handles as offline
 * (§2), rather than as a 500 that would surface as a broken game.
 */
export async function resolveAccount(req) {
  if (!dbEnabled()) return null
  const token = bearerFrom(req)
  if (!token) return null
  try {
    const { rows } = await query(
      'SELECT id, display_name, last_seen FROM accounts WHERE $1 = ANY (token_hashes) LIMIT 1',
      [hashToken(token)],
    )
    if (rows.length === 0) return null
    const account = { id: rows[0].id, displayName: rows[0].display_name }
    // Fire-and-forget, and only when it has actually gone stale: a `last_seen`
    // write on every request would double the write load for a pruning field.
    const lastSeen = rows[0].last_seen instanceof Date ? rows[0].last_seen.getTime() : 0
    if (Date.now() - lastSeen > LAST_SEEN_INTERVAL_MS) {
      query('UPDATE accounts SET last_seen = now() WHERE id = $1', [account.id]).catch(() => {})
    }
    return account
  } catch {
    return null
  }
}

/** Attaches `req.account` when there is one, and always continues. Use for
 *  endpoints that work signed-out, and to key per-account rate limits. */
export async function attachAccount(req, _res, next) {
  req.account = await resolveAccount(req)
  next()
}

/** Hard gate for endpoints that need an identity. */
export async function requireAccount(req, res, next) {
  req.account = req.account ?? (await resolveAccount(req))
  if (!req.account) {
    // 401 rather than 403: the client's response is to re-create an account,
    // not to give up.
    return res.status(401).json({ error: 'unauthorized', message: 'valid bearer token required' })
  }
  return next()
}
