/**
 * Process entry point.
 *
 * The app itself lives in app.js so tests can mount the real routes; this file
 * only owns the things a test must not do — binding a port and touching the
 * process's database pool.
 */
import { createApp } from './app.js'
import { initDb } from './db.js'
import { runMigrations } from './migrate.js'

const PORT = Number(process.env.PORT) || 8080

const app = createApp()

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Bannerfell listening on :${PORT}`)
})

// Boot the database alongside the server rather than before it: the SPA should
// start serving immediately, and a slow or missing Postgres must not delay it.
initDb()
runMigrations()
  .then((r) => console.log(r.skipped ? '[db] no database — migrations skipped' : `[db] migrations ok (${r.applied.join(', ')})`))
  .catch((err) => console.error('[db] migrations failed — continuing without persistence:', err.message))
