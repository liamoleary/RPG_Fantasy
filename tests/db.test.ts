/**
 * Commit 1 coverage: the database layer is optional, its SSL guess matches
 * Railway's two network shapes, and the migrations really are idempotent.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
// @ts-expect-error — server/ is plain ESM JavaScript, not part of the TS build.
import { closeDb, DbUnavailable, dbEnabled, dbHealth, initDb, query, sslFor } from '../server/db.js'
// @ts-expect-error — as above.
import { runMigrations } from '../server/migrate.js'
import { itDb, TEST_DB_URL, truncateAll } from './helpers/db'

describe('db module without a database', () => {
  it('reports itself disabled when DATABASE_URL is absent', () => {
    expect(dbEnabled()).toBe(false)
  })

  it('health is honest rather than throwing', async () => {
    await expect(dbHealth()).resolves.toEqual({ enabled: false, ok: false, reason: 'DATABASE_URL not set' })
  })

  it('queries raise DbUnavailable, so routes can answer softly', async () => {
    await expect(query('select 1')).rejects.toBeInstanceOf(DbUnavailable)
  })

  it('skips migrations instead of failing the boot', async () => {
    await expect(runMigrations()).resolves.toEqual({ skipped: true, applied: [] })
  })
})

describe('sslFor', () => {
  it('disables TLS on Railway private networking, which refuses the handshake', () => {
    expect(sslFor('postgres://u:p@postgres.railway.internal:5432/railway')).toBe(false)
  })

  it('disables TLS for local development', () => {
    expect(sslFor('postgres://u@localhost:5432/bannerfell')).toBe(false)
    expect(sslFor('postgres://u@127.0.0.1:5432/bannerfell')).toBe(false)
  })

  it('enables TLS for any public host', () => {
    expect(sslFor('postgres://u:p@containers-us-west-1.railway.app:7431/railway')).toEqual({ rejectUnauthorized: false })
  })

  it('honours the PGSSL override in both directions', () => {
    process.env.PGSSL = 'disable'
    expect(sslFor('postgres://u@public.example.com/db')).toBe(false)
    process.env.PGSSL = 'require'
    expect(sslFor('postgres://u@localhost/db')).toEqual({ rejectUnauthorized: false })
    delete process.env.PGSSL
  })

  it('does not throw on a malformed connection string', () => {
    expect(sslFor('not a url')).toBe(false)
  })
})

describe('migrations against a real database', () => {
  beforeAll(async () => {
    if (!TEST_DB_URL) return
    initDb(TEST_DB_URL)
    await runMigrations()
  })
  afterAll(async () => {
    if (TEST_DB_URL) await closeDb()
  })

  itDb('creates exactly the five tables §7 names', async () => {
    const { rows } = await query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name`,
    )
    expect(rows.map((r: { table_name: string }) => r.table_name)).toEqual([
      'accounts',
      'feedback',
      'link_codes',
      'runs',
      'saves',
    ])
  })

  itDb('replays cleanly — the runner reapplies every file on every boot', async () => {
    await expect(runMigrations()).resolves.toMatchObject({ skipped: false })
    await expect(runMigrations()).resolves.toMatchObject({ skipped: false, applied: ['001_init.sql'] })
  })

  itDb('keeps data across a replay, so a redeploy is not a wipe', async () => {
    await truncateAll(query)
    await query('INSERT INTO accounts (id, display_name) VALUES ($1, $2)', ['acc_survivor', 'Test Warden'])
    await runMigrations()
    const { rows } = await query('SELECT display_name FROM accounts WHERE id = $1', ['acc_survivor'])
    expect(rows).toHaveLength(1)
    expect(rows[0].display_name).toBe('Test Warden')
  })

  itDb('reports healthy once connected', async () => {
    const health = await dbHealth()
    expect(health).toMatchObject({ enabled: true, ok: true })
  })

  itDb('cascades a deleted account to its save but spares its feedback', async () => {
    await truncateAll(query)
    await query('INSERT INTO accounts (id, display_name) VALUES ($1, $2)', ['acc_x', 'Doomed'])
    await query('INSERT INTO saves (account_id, save_version, renown, data) VALUES ($1, 1, 5, $2)', [
      'acc_x',
      JSON.stringify({ renown: 5 }),
    ])
    await query('INSERT INTO feedback (account_id, rating, message) VALUES ($1, 4, $2)', ['acc_x', 'the cleric did nothing'])
    await query('DELETE FROM accounts WHERE id = $1', ['acc_x'])

    const saves = await query('SELECT 1 FROM saves WHERE account_id = $1', ['acc_x'])
    const feedback = await query('SELECT account_id, message FROM feedback')
    expect(saves.rows).toHaveLength(0)
    expect(feedback.rows).toHaveLength(1)
    expect(feedback.rows[0].account_id).toBeNull()
  })
})
