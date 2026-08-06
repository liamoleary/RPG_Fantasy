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
 */
import { it } from 'vitest'

export const TEST_DB_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? ''
export const hasTestDb = TEST_DB_URL.length > 0

/** `it` that turns into `it.skip` when no database is configured. */
export const itDb = hasTestDb ? it : it.skip

/** Wipe every table between tests, keeping the schema the migrations built. */
export async function truncateAll(query: (text: string) => Promise<unknown>): Promise<void> {
  await query('TRUNCATE runs, feedback, link_codes, saves, accounts RESTART IDENTITY CASCADE')
}
