/**
 * Postgres wiring (Launch Plan §7).
 *
 * The database is optional *by design*. Bannerfell has always run entirely in
 * the browser, and §2 is explicit that play must never block on the network. So
 * a missing or unreachable DATABASE_URL degrades this service to exactly what it
 * was before this branch — a static host for the SPA — instead of taking the
 * game down with it. Nothing in here throws during boot.
 *
 * Every data access goes through `query()`, which hands the text and the values
 * to pg separately. The single exception is `execScript()`, used only by the
 * migration runner for SQL that comes off disk, never from a request.
 */
import pg from 'pg'

const { Pool } = pg

let pool = null

/** Thrown when a route needs the database and there isn't one. Routes turn this
 *  into a soft "not synced" answer rather than a 500 — see §2. */
export class DbUnavailable extends Error {
  constructor() {
    super('database not configured')
    this.name = 'DbUnavailable'
  }
}

/**
 * Railway's private network (`*.railway.internal`) is unencrypted and refuses a
 * TLS handshake; its public proxy requires one. Guessing wrong breaks the deploy
 * in a way that looks like a credentials problem, so PGSSL can force either way.
 */
export function sslFor(connectionString) {
  const mode = process.env.PGSSL
  if (mode === 'disable') return false
  if (mode === 'require') return { rejectUnauthorized: false }
  let host = ''
  try {
    host = new URL(connectionString).hostname
  } catch {
    return false
  }
  if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.railway.internal')) return false
  // We don't pin Railway's proxy cert; encryption without verification still
  // beats plaintext across the public internet.
  return { rejectUnauthorized: false }
}

export function initDb(url = process.env.DATABASE_URL) {
  if (pool) return pool
  if (!url) {
    console.warn('[db] DATABASE_URL not set — serving the game without persistence')
    return null
  }
  pool = new Pool({
    connectionString: url,
    ssl: sslFor(url),
    max: Number(process.env.PGPOOL_MAX) || 8,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  })
  // An idle-client error must never reach the process's uncaught handler: a
  // database hiccup would otherwise kill a server that can still serve the game.
  pool.on('error', (err) => console.error('[db] idle client error:', err.message))
  return pool
}

export function dbEnabled() {
  return pool !== null
}

/** Parameterised query. `params` omitted means "no values", not "empty values". */
export async function query(text, params) {
  if (!pool) throw new DbUnavailable()
  return params === undefined ? pool.query(text) : pool.query(text, params)
}

/**
 * Multi-statement SQL, simple-query protocol. Only the migration runner calls
 * this, and only with files from server/migrations — never with request data.
 */
export async function execScript(sql) {
  if (!pool) throw new DbUnavailable()
  return pool.query(sql)
}

/** Run several statements as one unit — used by link-code redemption in §1. */
export async function withTransaction(fn) {
  if (!pool) throw new DbUnavailable()
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const out = await fn((text, params) => (params === undefined ? client.query(text) : client.query(text, params)))
    await client.query('COMMIT')
    return out
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

/** Shape consumed by /healthz (§8 step 3). Never throws. */
export async function dbHealth() {
  if (!pool) return { enabled: false, ok: false, reason: 'DATABASE_URL not set' }
  const started = Date.now()
  try {
    await pool.query('select 1')
    return { enabled: true, ok: true, latencyMs: Date.now() - started }
  } catch (err) {
    return { enabled: true, ok: false, reason: String(err.message).slice(0, 200) }
  }
}

/** Test/shutdown hook. */
export async function closeDb() {
  if (!pool) return
  const p = pool
  pool = null
  await p.end()
}
