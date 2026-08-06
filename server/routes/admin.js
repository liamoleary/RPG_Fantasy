/**
 * Getting the data out (Launch Plan §5) — the Liam ⇄ designer loop.
 *
 * Two endpoints behind one key: a full JSON (or CSV) export to take away, and a
 * summary page small enough to read on a phone. §5 is explicit that a wrong key
 * 404s rather than 403s, so the endpoints are indistinguishable from typos to
 * anyone poking at the host.
 */
import { Router } from 'express'
import { query } from '../db.js'
import { secretEquals } from '../lib/ids.js'
import { byIp, createLimiter } from '../lib/ratelimit.js'

/* Guessing a long random key is hopeless, but an unthrottled endpoint is still
   free load. This is the only limiter keyed by IP rather than account, because
   an unauthenticated caller has no account. */
const adminLimiter = createLimiter({ limit: 60, windowMs: 60 * 60 * 1000, key: byIp, name: 'admin' })

/** §5: 404 on a wrong key. Also 404 when no key is configured at all, so a
 *  deploy that forgot ADMIN_KEY is closed rather than open. */
function keyOk(req) {
  const expected = process.env.ADMIN_KEY
  if (!expected || expected.length < 16) return false
  return secretEquals(req.query?.key, expected)
}

function notFound(res) {
  return res.status(404).json({ error: 'not_found' })
}

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

/** Minimal RFC-4180 quoting: everything quoted, embedded quotes doubled. */
function toCsv(rows) {
  if (rows.length === 0) return ''
  const cols = Object.keys(rows[0])
  const cell = (v) => `"${String(v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : v).replace(/"/g, '""')}"`
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n')
}

export function adminRoutes() {
  const router = Router()

  /** GET /api/admin/export?key=…[&format=csv] — the whole dataset (§5). */
  router.get('/admin/export', adminLimiter, async (req, res) => {
    if (!keyOk(req)) return notFound(res)
    try {
      const accounts = await query(
        `SELECT a.id, a.display_name, a.created_at, a.last_seen,
                COALESCE(s.renown, 0) AS renown,
                (SELECT count(*) FROM runs r WHERE r.account_id = a.id) AS runs
           FROM accounts a LEFT JOIN saves s ON s.account_id = a.id
          ORDER BY a.created_at`,
      )
      const runs = await query(
        `SELECT id, account_id, hero_id, faction_id, placement, rounds, duration_ms, build_id, details, created_at
           FROM runs ORDER BY created_at`,
      )
      const feedback = await query(
        `SELECT id, account_id, rating, categories, message, build_id, context, created_at
           FROM feedback ORDER BY created_at`,
      )

      if (req.query.format === 'csv') {
        // Three CSVs in one text response, each under a banner line. §5 asks for
        // a zip; a single file needs no archiver dependency and drops straight
        // into a spreadsheet, which is what the loop actually does with it.
        res.setHeader('content-type', 'text/plain; charset=utf-8')
        res.setHeader('content-disposition', 'attachment; filename="bannerfell-export.csv"')
        return res.send(
          [
            '### accounts', toCsv(accounts.rows),
            '', '### runs', toCsv(runs.rows),
            '', '### feedback', toCsv(feedback.rows),
          ].join('\n'),
        )
      }

      return res.json({
        exportedAt: new Date().toISOString(),
        counts: { accounts: accounts.rows.length, runs: runs.rows.length, feedback: feedback.rows.length },
        accounts: accounts.rows,
        runs: runs.rows,
        feedback: feedback.rows,
      })
    } catch (err) {
      console.error('[admin] export failed:', err.message)
      return res.status(503).json({ error: 'unavailable' })
    }
  })

  /** GET /api/admin/summary?key=… — the phone-sized pulse check (§5). */
  router.get('/admin/summary', adminLimiter, async (req, res) => {
    if (!keyOk(req)) return notFound(res)
    try {
      const [testers, runsToday, byHero, byFaction, stars, comments] = await Promise.all([
        query('SELECT count(*)::int AS n FROM accounts'),
        query("SELECT count(*)::int AS n FROM runs WHERE created_at > now() - interval '1 day'"),
        query(
          `SELECT hero_id, count(*)::int AS runs, round(avg(placement)::numeric, 2) AS avg_placement
             FROM runs WHERE placement IS NOT NULL GROUP BY hero_id ORDER BY avg_placement`,
        ),
        query(
          `SELECT faction_id, count(*)::int AS runs, round(avg(placement)::numeric, 2) AS avg_placement
             FROM runs WHERE placement IS NOT NULL GROUP BY faction_id ORDER BY avg_placement`,
        ),
        query('SELECT rating, count(*)::int AS n FROM feedback WHERE rating IS NOT NULL GROUP BY rating ORDER BY rating'),
        query(
          `SELECT f.rating, f.categories, f.message, f.build_id, f.created_at, a.display_name
             FROM feedback f LEFT JOIN accounts a ON a.id = f.account_id
            WHERE f.message <> '' ORDER BY f.created_at DESC LIMIT 20`,
        ),
      ])

      const starRows = Object.fromEntries(stars.rows.map((r) => [r.rating, r.n]))
      const maxStars = Math.max(1, ...Object.values(starRows))
      const table = (title, rows, keyCol) => `
        <h2>${escapeHtml(title)}</h2>
        <table><tr><th>${escapeHtml(keyCol)}</th><th>runs</th><th>avg place</th></tr>
        ${rows.map((r) => `<tr><td>${escapeHtml(r[keyCol])}</td><td>${r.runs}</td><td>${escapeHtml(r.avg_placement)}</td></tr>`).join('')}
        </table>`

      res.setHeader('content-type', 'text/html; charset=utf-8')
      return res.send(`<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bannerfell — playtest</title>
<style>
  :root { color-scheme: dark }
  body { font: 15px/1.45 system-ui, sans-serif; background: #0d1320; color: #e8eef8; margin: 0; padding: 16px; }
  h1 { font-size: 20px; margin: 0 0 4px }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .08em; color: #8fa4c4; margin: 20px 0 6px }
  table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums }
  th, td { text-align: left; padding: 5px 6px; border-bottom: 1px solid #ffffff14 }
  th { color: #8fa4c4; font-size: 12px; font-weight: 600 }
  .big { font-size: 30px; font-weight: 800 }
  .row { display: flex; gap: 20px; margin-bottom: 4px }
  .bar { height: 9px; background: #d8b45a; border-radius: 5px; min-width: 2px }
  .cmt { border-bottom: 1px solid #ffffff14; padding: 8px 0 }
  .meta { color: #8fa4c4; font-size: 12px }
  .msg { white-space: pre-wrap; word-break: break-word }
  a { color: #d8b45a }
</style>
<h1>Bannerfell playtest</h1>
<div class="row">
  <div><div class="meta">testers</div><div class="big">${testers.rows[0].n}</div></div>
  <div><div class="meta">runs today</div><div class="big">${runsToday.rows[0].n}</div></div>
  <div><div class="meta">comments</div><div class="big">${comments.rows.length}</div></div>
</div>
${table('Placement by hero', byHero.rows, 'hero_id')}
${table('Placement by faction', byFaction.rows, 'faction_id')}
<h2>Ratings</h2>
<table>${[5, 4, 3, 2, 1]
        .map((n) => `<tr><td>${n}★</td><td style="width:100%"><div class="bar" style="width:${((starRows[n] ?? 0) / maxStars) * 100}%"></div></td><td>${starRows[n] ?? 0}</td></tr>`)
        .join('')}</table>
<h2>Latest comments</h2>
${comments.rows
        .map(
          (c) => `<div class="cmt">
    <div class="meta">${escapeHtml(c.display_name ?? 'deleted')} · ${c.rating ? `${c.rating}★ · ` : ''}${escapeHtml((c.categories ?? []).join(', '))} · ${escapeHtml(String(c.created_at).slice(0, 16))} · ${escapeHtml(c.build_id ?? '?')}</div>
    <div class="msg">${escapeHtml(c.message)}</div>
  </div>`,
        )
        .join('') || '<div class="meta">nothing yet</div>'}
<h2>Export</h2>
<p><a href="/api/admin/export?key=${encodeURIComponent(String(req.query.key))}">JSON</a> ·
   <a href="/api/admin/export?format=csv&key=${encodeURIComponent(String(req.query.key))}">CSV</a></p>`)
    } catch (err) {
      console.error('[admin] summary failed:', err.message)
      return res.status(503).send('unavailable')
    }
  })

  return router
}

export const __testing = { adminLimiter, toCsv, escapeHtml }
