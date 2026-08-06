/**
 * Shared harness for the server tests (§10.7).
 *
 * The API tests need a real Postgres — the whole point is that the SQL, the
 * constraints and the transaction boundaries behave, which a mock cannot tell
 * you. Point TEST_DATABASE_URL (or DATABASE_URL) at a throwaway database and
 * they run; leave it unset and they skip, so `npm test` stays green on a laptop
 * with no Postgres. The pure-logic tests never need either.
 *
 *   createdb bannerfell_test
 *   TEST_DATABASE_URL=postgres://localhost/bannerfell_test npm test
 *
 * Vitest runs test files in parallel, so every file that touches the database
 * gets its **own schema** rather than sharing `public`. Without that, one
 * file's TRUNCATE deletes rows another file is mid-assertion on — which is not
 * a flake but a guaranteed failure the moment two DB files run at once.
 */
import pg from 'pg'
import { it } from 'vitest'

export const TEST_DB_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? ''
export const hasTestDb = TEST_DB_URL.length > 0

/** `it` that turns into `it.skip` when no database is configured. */
export const itDb = hasTestDb ? it : it.skip

/**
 * Drops and recreates `schema`, and returns a connection string pinned to it
 * via libpq's `options`. Call once per test file, before initDb.
 */
export async function isolatedSchema(schema: string): Promise<string> {
  if (!/^[a-z][a-z0-9_]{0,40}$/.test(schema)) throw new Error(`unsafe schema name: ${schema}`)
  const admin = new pg.Pool({ connectionString: TEST_DB_URL })
  try {
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
    await admin.query(`CREATE SCHEMA ${schema}`)
  } finally {
    await admin.end()
  }
  const url = new URL(TEST_DB_URL)
  url.searchParams.set('options', `-c search_path=${schema}`)
  return url.toString()
}

/** Wipe every table between tests, keeping the schema the migrations built. */
export async function truncateAll(query: (text: string) => Promise<unknown>): Promise<void> {
  await query('TRUNCATE runs, feedback, link_codes, saves, accounts RESTART IDENTITY CASCADE')
}
