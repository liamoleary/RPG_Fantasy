/**
 * Commits 5 and 6: run telemetry (§4), the admin export and summary (§5), and
 * §10.7's "run validation caps" and "admin-key gating".
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
// @ts-expect-error — server/ is plain ESM JavaScript, outside the TS build.
import { closeDb, initDb, query } from '../server/db.js'
// @ts-expect-error — as above.
import { runMigrations } from '../server/migrate.js'
// @ts-expect-error — as above.
import { createAccountLimiter } from '../server/routes/account.js'
// @ts-expect-error — as above.
import { DETAILS_MAX_BYTES, __testing as runsTesting } from '../server/routes/runs.js'
// @ts-expect-error — as above.
import { __testing as adminTesting } from '../server/routes/admin.js'
import { buildRunReport, emptyTally, tallyBattle } from '../src/net/telemetry'
import { isolatedSchema, itDb, TEST_DB_URL, truncateAll } from './helpers/db'
import { startTestServer, type TestServer } from './helpers/server'

/** This file's private schema, so parallel test files cannot truncate each other. */
const SCHEMA = 't_admin'
const KEY = 'test-admin-key-long-enough-to-count'

describe('run tally (§4)', () => {
  it('counts only the player\'s own apex fires', () => {
    const result = {
      winner: 'a',
      damageToLoser: 9,
      damageToBoth: 0,
      events: [
        { t: 'apex', side: 'a' },
        { t: 'apex', side: 'b' },
        { t: 'apex', side: 'a' },
        { t: 'attack', side: 'a' },
      ],
    }
    expect(tallyBattle(emptyTally(), result as never, true).apexFires).toBe(2)
    expect(tallyBattle(emptyTally(), result as never, false).apexFires).toBe(1)
  })

  it('attributes damage to the right side of a win', () => {
    const win = { winner: 'a', damageToLoser: 12, damageToBoth: 0, events: [] }
    const asWinner = tallyBattle(emptyTally(), win as never, true)
    expect(asWinner.damageDealt).toBe(12)
    expect(asWinner.damageTaken).toBe(0)

    const asLoser = tallyBattle(emptyTally(), win as never, false)
    expect(asLoser.damageTaken).toBe(12)
    expect(asLoser.damageDealt).toBe(0)
  })

  it('accumulates across rounds and tolerates a missing battle', () => {
    let t = emptyTally()
    t = tallyBattle(t, { winner: 'a', damageToLoser: 5, damageToBoth: 0, events: [] } as never, true)
    t = tallyBattle(t, null, true)
    t = tallyBattle(t, { winner: 'a', damageToLoser: 7, damageToBoth: 0, events: [] } as never, true)
    expect(t.damageDealt).toBe(12)
  })
})

describe('buildRunReport (§4)', () => {
  const run = {
    seed: 99,
    round: 11,
    difficulty: 'standard',
    playerId: 'w0',
    warlords: [
      {
        id: 'w0', isPlayer: true, heroId: 'h_sylvaen', factionId: 'verdant',
        hp: 0, placement: 3, wins: 5, losses: 4, gold: 2,
        boonsTaken: [], camp: { tier: 4 },
        board: [{ unitId: 'vd_dryad', count: 4, slot: 3, rank: 2 }, { unitId: 'vd_sapling', count: 2, slot: 0, rank: 1 }],
      },
      { id: 'w1', isPlayer: false, heroId: 'h_berrik', factionId: 'vanguard', archetype: 'bulwark', placement: 1 },
    ],
  }

  it('reports everything §4 lists', () => {
    const tally = { ...emptyTally(), startedAt: 1000, tierCurve: [2, 3, 4], promotions: 3, apexFires: 2, damageDealt: 40, damageTaken: 30 }
    const report = buildRunReport(run as never, tally, 1000 + 20 * 60 * 1000)!
    expect(report).toMatchObject({ heroId: 'h_sylvaen', factionId: 'verdant', placement: 3, rounds: 11, seed: 99 })
    expect(report.durationMs).toBe(20 * 60 * 1000)
    expect(report.details).toMatchObject({
      campTier: 4, tierCurve: [2, 3, 4], promotions: 3, apexFires: 2, damageDealt: 40, damageTaken: 30, ranksEarned: 3,
    })
    expect(report.details.board).toHaveLength(2)
    expect(report.details.rivals).toEqual([{ heroId: 'h_berrik', factionId: 'vanguard', archetype: 'bulwark', placement: 1 }])
  })

  it('never throws on a malformed run', () => {
    expect(buildRunReport({ warlords: [] } as never, emptyTally())).toBeNull()
  })

  it('carries no device or personal information (§4 privacy note)', () => {
    const text = JSON.stringify(buildRunReport(run as never, emptyTally()))
    for (const forbidden of ['userAgent', 'navigator', 'ip', 'location', 'displayName', 'token']) {
      expect(text).not.toContain(forbidden)
    }
  })
})

describe('admin helpers', () => {
  it('escapes HTML, so a display name cannot inject into the summary page', () => {
    expect(adminTesting.escapeHtml('<img src=x onerror=alert(1)>')).not.toContain('<img')
    expect(adminTesting.escapeHtml('a & b')).toBe('a &amp; b')
  })

  it('quotes CSV cells and doubles embedded quotes', () => {
    const csv = adminTesting.toCsv([{ a: 'he said "hi"', b: 'x,y', c: null }])
    expect(csv.split('\n')[0]).toBe('a,b,c')
    expect(csv).toContain('"he said ""hi"""')
    expect(csv).toContain('"x,y"')
  })

  it('returns empty for no rows rather than a stray header', () => {
    expect(adminTesting.toCsv([])).toBe('')
  })
})

describe('runs + admin API', () => {
  let server: TestServer
  let token = ''

  beforeAll(async () => {
    if (!TEST_DB_URL) return
    process.env.ADMIN_KEY = KEY
    initDb(await isolatedSchema(SCHEMA))
    await runMigrations()
    server = await startTestServer()
  })

  afterAll(async () => {
    if (!TEST_DB_URL) return
    delete process.env.ADMIN_KEY
    await server.close()
    await closeDb()
  })

  beforeEach(async () => {
    if (!TEST_DB_URL) return
    await truncateAll(query)
    createAccountLimiter.reset()
    runsTesting.runsLimiter.reset()
    adminTesting.adminLimiter.reset()
    token = (await server.api('POST', '/api/account', { body: {} })).body.token
  })

  const postRun = (over = {}) =>
    server.api('POST', '/api/runs', {
      token,
      body: { heroId: 'h_sylvaen', factionId: 'verdant', placement: 2, rounds: 11, durationMs: 900_000, buildId: 'abc-2026', details: { apexFires: 1 }, ...over },
    })

  itDb('creates one row per finished run (§10.4)', async () => {
    expect((await postRun()).status).toBe(201)
    const { rows } = await query('SELECT * FROM runs')
    expect(rows).toHaveLength(1)
    expect(rows[0].hero_id).toBe('h_sylvaen')
    expect(rows[0].placement).toBe(2)
    expect(rows[0].build_id).toBe('abc-2026')
    expect(rows[0].details.apexFires).toBe(1)
  })

  itDb('requires an account', async () => {
    expect((await server.api('POST', '/api/runs', { body: { heroId: 'h', factionId: 'f' } })).status).toBe(401)
  })

  // ── validation caps (§10.7) ──────────────────────────────────────────────
  itDb('requires hero and faction', async () => {
    expect((await postRun({ heroId: '' })).status).toBe(400)
    expect((await postRun({ factionId: undefined })).status).toBe(400)
  })

  itDb('clamps out-of-range numbers instead of storing them', async () => {
    await postRun({ placement: 999, rounds: 99999, durationMs: -5 })
    const { rows } = await query('SELECT placement, rounds, duration_ms FROM runs')
    expect(rows[0].placement).toBe(99)
    expect(rows[0].rounds).toBe(200)
    expect(rows[0].duration_ms).toBe(0)
  })

  itDb('refuses details over the byte budget', async () => {
    const res = await postRun({ details: { blob: 'x'.repeat(DETAILS_MAX_BYTES + 1000) } })
    expect(res.status).toBe(400)
  })

  // ── admin gating (§10.7, §5) ─────────────────────────────────────────────
  itDb('404s without a key, with a wrong key, and with an empty key', async () => {
    for (const q of ['', '?key=', '?key=wrong', `?key=${KEY}x`]) {
      expect((await server.api('GET', `/api/admin/export${q}`)).status).toBe(404)
      expect((await server.api('GET', `/api/admin/summary${q}`)).status).toBe(404)
    }
  })

  itDb('404s rather than 403s, so the endpoint is indistinguishable from a typo (§5)', async () => {
    const wrongKey = await server.api('GET', '/api/admin/export?key=wrong')
    const noSuchRoute = await server.api('GET', '/api/admin/nonsense')
    expect(wrongKey.status).toBe(noSuchRoute.status)
  })

  itDb('exports the complete dataset (§10.5)', async () => {
    await postRun()
    await server.api('POST', '/api/feedback', { token, body: { rating: 5, message: 'grand', categories: ['Fun'] } })

    const res = await server.api('GET', `/api/admin/export?key=${KEY}`)
    expect(res.status).toBe(200)
    expect(res.body.counts).toEqual({ accounts: 1, runs: 1, feedback: 1 })
    expect(res.body.accounts[0].display_name).toBeTruthy()
    expect(res.body.runs[0].hero_id).toBe('h_sylvaen')
    expect(res.body.feedback[0].message).toBe('grand')
  })

  itDb('exports CSV on request', async () => {
    await postRun()
    const res = await server.api('GET', `/api/admin/export?format=csv&key=${KEY}`)
    expect(res.status).toBe(200)
    expect(String(res.body)).toContain('### accounts')
    expect(String(res.body)).toContain('### runs')
    expect(String(res.body)).toContain('### feedback')
    expect(res.headers.get('content-disposition')).toContain('bannerfell-export.csv')
  })

  itDb('renders the summary page (§10.5)', async () => {
    await postRun()
    await server.api('POST', '/api/feedback', { token, body: { rating: 4, message: 'the cleric did nothing???' } })

    const res = await server.api('GET', `/api/admin/summary?key=${KEY}`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    const html = String(res.body)
    expect(html).toContain('Bannerfell playtest')
    expect(html).toContain('h_sylvaen')
    expect(html).toContain('the cleric did nothing???')
    expect(html).toContain('viewport') // renders on a phone
  })

  itDb('escapes a hostile display name in the summary', async () => {
    await server.api('PATCH', '/api/account', { token, body: { displayName: '<img src=x>' } })
    await server.api('POST', '/api/feedback', { token, body: { rating: 3, message: '<script>alert(1)</script>' } })
    const html = String((await server.api('GET', `/api/admin/summary?key=${KEY}`)).body)
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  itDb('closes the endpoint when ADMIN_KEY is unset, rather than opening it', async () => {
    const saved = process.env.ADMIN_KEY
    delete process.env.ADMIN_KEY
    expect((await server.api('GET', '/api/admin/export?key=')).status).toBe(404)
    expect((await server.api('GET', `/api/admin/export?key=${KEY}`)).status).toBe(404)
    process.env.ADMIN_KEY = saved
  })

  itDb('refuses a dangerously short ADMIN_KEY', async () => {
    const saved = process.env.ADMIN_KEY
    process.env.ADMIN_KEY = 'short'
    expect((await server.api('GET', '/api/admin/export?key=short')).status).toBe(404)
    process.env.ADMIN_KEY = saved
  })

  itDb('reports a version for the update check (§6)', async () => {
    const res = await server.api('GET', '/api/version')
    expect(res.status).toBe(200)
    expect(typeof res.body.buildId).toBe('string')
    expect(res.headers.get('cache-control')).toContain('no-store')
  })
})
