/**
 * Migration runner (Launch Plan §7): plain SQL files, replayed on every boot.
 *
 * There is no `schema_migrations` bookkeeping table on purpose. Every statement
 * in server/migrations is written to be idempotent, so "run them all, every
 * time" is both the simplest thing that works and self-healing if a deploy dies
 * halfway. The cost is a few milliseconds of no-op DDL per boot.
 *
 * Failure here is logged, never fatal: a server that can't migrate can still
 * serve the game (§2).
 */
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { dbEnabled, execScript } from './db.js'

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations')

export async function runMigrations() {
  if (!dbEnabled()) return { skipped: true, applied: [] }
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort()
  const applied = []
  for (const file of files) {
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8')
    await execScript(sql)
    applied.push(file)
  }
  return { skipped: false, applied }
}
