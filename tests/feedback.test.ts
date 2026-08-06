/**
 * Commit 4 coverage: §10.7's "feedback validation caps", §3's auto-context, and
 * §10.4's "every widget submission creates one feedback row with full context".
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
// @ts-expect-error — server/ is plain ESM JavaScript, outside the TS build.
import { closeDb, initDb, query } from '../server/db.js'
// @ts-expect-error — as above.
import { runMigrations } from '../server/migrate.js'
// @ts-expect-error — as above.
import { CATEGORIES, CONTEXT_MAX_BYTES, MESSAGE_MAX } from '../server/routes/feedback.js'
// @ts-expect-error — as above.
import { createAccountLimiter } from '../server/routes/account.js'
// @ts-expect-error — as above.
import { __testing as feedbackTesting } from '../server/routes/feedback.js'
import { FEEDBACK_CATEGORIES } from '../src/net/feedback'
import { buildContext, compactEvent, compactLog } from '../src/net/feedbackContext'
import { isolatedSchema, itDb, TEST_DB_URL, truncateAll } from './helpers/db'
import { startTestServer, type TestServer } from './helpers/server'

/** This file's private schema, so parallel test files cannot truncate each other. */
const SCHEMA = 't_feedback'

describe('the client and server agree on the categories', () => {
  it('offers exactly the six chips §3 lists', () => {
    expect([...FEEDBACK_CATEGORIES]).toEqual(['Fun', 'Confusing', 'Too hard', 'Too easy', 'Bug', 'Idea'])
  })
  it('and the server accepts the same set', () => {
    expect([...CATEGORIES].sort()).toEqual([...FEEDBACK_CATEGORIES].sort())
  })
})

describe('auto-context (§3)', () => {
  const account = { accountId: 'acc_1', displayName: 'Liam' }

  it('works with no run at all — feedback from the Home screen', () => {
    const ctx = buildContext({ run: null, screen: 'home', playerBattle: null, account, includeBattleLog: false })
    expect(ctx.accountId).toBe('acc_1')
    expect(ctx.displayName).toBe('Liam')
    expect(ctx.screen).toBe('home')
    expect(ctx.heroId).toBeNull()
    expect(ctx.board).toEqual([])
  })

  it('captures the state §3 names when a run is in progress', () => {
    const run = {
      seed: 4242,
      round: 6,
      phase: 'muster',
      difficulty: 'standard',
      playerId: 'w0',
      warlords: [
        {
          id: 'w0',
          isPlayer: true,
          heroId: 'h_sylvaen',
          factionId: 'verdant',
          gold: 7,
          hp: 22,
          placement: null,
          boonsTaken: ['b_focus'],
          board: [{ unitId: 'vd_dryad', count: 4, slot: 3, rank: 1 }],
        },
      ],
    }
    const ctx = buildContext({ run: run as never, screen: 'muster', playerBattle: null, account, includeBattleLog: false })
    expect(ctx).toMatchObject({
      phase: 'muster',
      round: 6,
      heroId: 'h_sylvaen',
      factionId: 'verdant',
      difficulty: 'standard',
      boonsTaken: ['b_focus'],
      gold: 7,
      hp: 22,
      placement: null,
      seed: 4242,
    })
    expect(ctx.board).toEqual([{ unitId: 'vd_dryad', count: 4, slot: 3, rank: 1 }])
  })

  it('never throws on a malformed run — a widget must not crash while reporting a crash', () => {
    expect(() =>
      buildContext({ run: { warlords: [] } as never, screen: 'muster', playerBattle: null, account, includeBattleLog: true }),
    ).not.toThrow()
  })

  it('stamps a build id on everything (§6)', () => {
    const ctx = buildContext({ run: null, screen: 'home', playerBattle: null, account: null, includeBattleLog: false })
    expect(typeof ctx.buildId).toBe('string')
    expect(ctx.buildId.length).toBeGreaterThan(0)
  })

  it('sheds the snapshots, which are the bulk of an event', () => {
    const event = {
      t: 'attack',
      src: 'vg_militia@0',
      dst: 'st_raider@4',
      damage: 6,
      retaliation: false,
      snap: Array.from({ length: 20 }, (_, i) => ({ uid: `u${i}`, count: 9, atk: 3, hp: 4, bulwark: 1 })),
    }
    const line = compactEvent(event as never)
    expect(line).toContain('attack')
    expect(line).toContain('damage=6')
    expect(line).not.toContain('snap')
    expect(line.length).toBeLessThan(120)
  })

  it('attaches the last 50 events only for a Bug report (§3)', () => {
    const events = Array.from({ length: 200 }, (_, i) => ({ t: 'attack', damage: i, snap: [{ uid: 'x' }] }))
    const battle = { events } as never

    const bug = buildContext({ run: null, screen: 'result', playerBattle: battle, account, includeBattleLog: true })
    expect(bug.battleLog).toHaveLength(50)
    expect(bug.battleLog?.[49]).toContain('damage=199') // the *last* 50

    const notBug = buildContext({ run: null, screen: 'result', playerBattle: battle, account, includeBattleLog: false })
    expect(notBug.battleLog).toBeUndefined()
  })

  it('compacts a 200-event battle into a payload that fits the budget', () => {
    const events = Array.from({ length: 200 }, () => ({
      t: 'attack',
      src: 'vg_militia@0',
      dst: 'st_raider@4',
      damage: 6,
      snap: Array.from({ length: 20 }, (_, i) => ({ uid: `u${i}`, count: 9, atk: 3, hp: 4 })),
    }))
    const raw = JSON.stringify(events)
    const compacted = JSON.stringify(compactLog({ events } as never))
    expect(compacted.length).toBeLessThan(raw.length / 10)
    expect(Buffer.byteLength(compacted)).toBeLessThan(CONTEXT_MAX_BYTES)
  })

  it('copes with no battle to log', () => {
    expect(compactLog(null)).toEqual([])
    expect(compactLog({ events: [] } as never)).toEqual([])
  })
})

describe('feedback API', () => {
  let server: TestServer
  let token = ''

  beforeAll(async () => {
    if (!TEST_DB_URL) return
    initDb(await isolatedSchema(SCHEMA))
    await runMigrations()
    server = await startTestServer()
  })

  afterAll(async () => {
    if (!TEST_DB_URL) return
    await server.close()
    await closeDb()
  })

  beforeEach(async () => {
    if (!TEST_DB_URL) return
    await truncateAll(query)
    createAccountLimiter.reset()
    feedbackTesting.feedbackLimiter.reset()
    token = (await server.api('POST', '/api/account', { body: {} })).body.token
  })

  itDb('stores one row per submission, with the context (§10.4)', async () => {
    const context = { buildId: 'abc123', heroId: 'h_sylvaen', round: 6, board: [{ unitId: 'vd_dryad', count: 4 }] }
    const res = await server.api('POST', '/api/feedback', {
      token,
      body: { rating: 4, categories: ['Fun', 'Idea'], message: 'the dryad line looks great', context },
    })
    expect(res.status).toBe(201)

    const { rows } = await query('SELECT * FROM feedback')
    expect(rows).toHaveLength(1)
    expect(rows[0].rating).toBe(4)
    expect(rows[0].categories.sort()).toEqual(['Fun', 'Idea'])
    expect(rows[0].message).toBe('the dryad line looks great')
    expect(rows[0].context.heroId).toBe('h_sylvaen')
    expect(rows[0].build_id).toBe('abc123') // §6: tagged with the build
  })

  itDb('accepts a bare star rating — two taps, nothing mandatory (§3)', async () => {
    const res = await server.api('POST', '/api/feedback', { token, body: { rating: 5, context: {} } })
    expect(res.status).toBe(201)
  })

  itDb('accepts a message with no rating', async () => {
    const res = await server.api('POST', '/api/feedback', { token, body: { message: 'the cleric did nothing???' } })
    expect(res.status).toBe(201)
  })

  itDb('rejects an entirely empty submission — that is a stray tap', async () => {
    const res = await server.api('POST', '/api/feedback', { token, body: { context: {} } })
    expect(res.status).toBe(400)
  })

  itDb('requires an account, so §5 can group by tester', async () => {
    expect((await server.api('POST', '/api/feedback', { body: { rating: 5 } })).status).toBe(401)
  })

  // ── validation caps (§10.7) ──────────────────────────────────────────────
  itDb('clamps a rating outside 1..5 instead of storing nonsense', async () => {
    await server.api('POST', '/api/feedback', { token, body: { rating: 99, message: 'x' } })
    await server.api('POST', '/api/feedback', { token, body: { rating: -3, message: 'x' } })
    const { rows } = await query('SELECT rating FROM feedback ORDER BY id')
    expect(rows.map((r: { rating: number }) => r.rating)).toEqual([5, 1])
  })

  itDb('drops categories it does not recognise', async () => {
    await server.api('POST', '/api/feedback', {
      token,
      body: { rating: 3, categories: ['Fun', 'Nonsense', '<script>', 'Bug', 'Fun'] },
    })
    const { rows } = await query('SELECT categories FROM feedback')
    expect(rows[0].categories.sort()).toEqual(['Bug', 'Fun']) // deduped, filtered
  })

  itDb('truncates an over-long message rather than rejecting it', async () => {
    await server.api('POST', '/api/feedback', { token, body: { rating: 3, message: 'x'.repeat(MESSAGE_MAX + 5000) } })
    const { rows } = await query('SELECT message FROM feedback')
    expect(rows[0].message.length).toBe(MESSAGE_MAX)
  })

  itDb('refuses a context over the byte budget', async () => {
    const huge = { blob: 'x'.repeat(CONTEXT_MAX_BYTES + 1000) }
    const res = await server.api('POST', '/api/feedback', { token, body: { rating: 3, context: huge } })
    expect(res.status).toBe(400)
  })

  itDb('refuses a body over the 64KB limit before it reaches the route', async () => {
    const res = await server.api('POST', '/api/feedback', {
      raw: JSON.stringify({ rating: 3, context: { blob: 'x'.repeat(70_000) } }),
      token,
    })
    expect(res.status).toBe(413)
  })

  itDb('strips control characters from the message', async () => {
    const dirty = `line one${String.fromCharCode(0)}${String.fromCharCode(7)} tail`
    await server.api('POST', '/api/feedback', { token, body: { rating: 3, message: dirty } })
    const { rows } = await query('SELECT message FROM feedback')
    expect(rows[0].message).toBe('line one tail')
  })

  itDb('rate-limits to 10/hour/account (§3)', async () => {
    const statuses: number[] = []
    for (let i = 0; i < 11; i++) {
      statuses.push((await server.api('POST', '/api/feedback', { token, body: { rating: 3 } })).status)
    }
    expect(statuses.filter((s) => s === 201)).toHaveLength(10)
    expect(statuses[10]).toBe(429)
  })

  itDb('counts the limit per account, not globally', async () => {
    const other = (await server.api('POST', '/api/account', { body: {} })).body.token
    for (let i = 0; i < 10; i++) await server.api('POST', '/api/feedback', { token, body: { rating: 3 } })
    expect((await server.api('POST', '/api/feedback', { token, body: { rating: 3 } })).status).toBe(429)
    expect((await server.api('POST', '/api/feedback', { token: other, body: { rating: 3 } })).status).toBe(201)
  })

  itDb('survives the account being deleted by hand (§9)', async () => {
    await server.api('POST', '/api/feedback', { token, body: { rating: 5, message: 'keep me' } })
    await query('DELETE FROM accounts')
    const { rows } = await query('SELECT account_id, message FROM feedback')
    expect(rows).toHaveLength(1)
    expect(rows[0].account_id).toBeNull()
    expect(rows[0].message).toBe('keep me')
  })
})
