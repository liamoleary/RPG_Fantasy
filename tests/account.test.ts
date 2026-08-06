/**
 * Commit 2 coverage, per §10.7: "account create/link (incl. expiry +
 * single-use)". Plus the guarantees §1 and §7 make about hashing, rate limits
 * and the absence of anything resembling a password.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
// @ts-expect-error — server/ is plain ESM JavaScript, outside the TS build.
import { closeDb, initDb, query } from '../server/db.js'
// @ts-expect-error — as above.
import { runMigrations } from '../server/migrate.js'
// @ts-expect-error — as above.
import { hashToken, newLinkCode, newToken, normaliseLinkCode, secretEquals } from '../server/lib/ids.js'
// @ts-expect-error — as above.
import { isClean, NAME_MAX, suggestName, validateDisplayName } from '../server/lib/names.js'
// @ts-expect-error — as above.
import { createLimiter } from '../server/lib/ratelimit.js'
// @ts-expect-error — as above.
import { bearerFrom } from '../server/lib/auth.js'
// @ts-expect-error — as above.
import { createAccountLimiter, linkAttemptLimiter } from '../server/routes/account.js'
import { isolatedSchema, itDb, TEST_DB_URL, truncateAll } from './helpers/db'
import { startTestServer, type TestServer } from './helpers/server'

/** This file's private schema, so parallel test files cannot truncate each other. */
const SCHEMA = 't_account'

describe('tokens and codes', () => {
  it('mints 128-bit tokens, not JWTs', () => {
    const token = newToken()
    expect(token).toMatch(/^[0-9a-f]{32}$/)
    expect(token).not.toContain('.')
    expect(new Set(Array.from({ length: 200 }, () => newToken())).size).toBe(200)
  })

  it('stores only a SHA-256 digest, and the same token always hashes alike', () => {
    const token = newToken()
    const digest = hashToken(token)
    expect(digest).toMatch(/^[0-9a-f]{64}$/)
    expect(digest).not.toContain(token)
    expect(hashToken(token)).toBe(digest)
  })

  it('generates codes in the BRAVE-STAG-41 shape §1 specifies', () => {
    for (let i = 0; i < 50; i++) expect(newLinkCode()).toMatch(/^[A-Z]{2,12}-[A-Z]{2,12}-\d{2}$/)
  })

  it('accepts the mess of retyping a code off another screen', () => {
    expect(normaliseLinkCode('brave-stag-41')).toBe('BRAVE-STAG-41')
    expect(normaliseLinkCode('  Brave Stag 41 ')).toBe('BRAVE-STAG-41')
    expect(normaliseLinkCode('BRAVE_STAG_41')).toBe('BRAVE-STAG-41')
    expect(normaliseLinkCode('BRAVE--STAG--41')).toBe('BRAVE-STAG-41')
  })

  it('rejects anything that is not a code', () => {
    for (const bad of ['', 'BRAVE-STAG', 'BRAVE-STAG-4', 'BRAVE-STAG-411', '1-2-34', null, 42, {}]) {
      expect(normaliseLinkCode(bad as never)).toBe('')
    }
  })

  it('compares secrets without leaking length by timing', () => {
    expect(secretEquals('abc', 'abc')).toBe(true)
    expect(secretEquals('abc', 'abd')).toBe(false)
    expect(secretEquals('abc', 'abcd')).toBe(false)
    expect(secretEquals(undefined, 'abc')).toBe(false)
  })
})

describe('display names — the only human-entered field (§10.8)', () => {
  it('accepts an ordinary name and collapses whitespace', () => {
    expect(validateDisplayName('  Liam   the  Bold ')).toEqual({ ok: true, name: 'Liam the Bold' })
  })

  it('caps at 20 characters', () => {
    expect(validateDisplayName('x'.repeat(NAME_MAX))).toMatchObject({ ok: true })
    expect(validateDisplayName('x'.repeat(NAME_MAX + 1))).toMatchObject({ ok: false })
  })

  it('rejects empty, whitespace-only and non-string names', () => {
    for (const bad of ['', '   ', null, 7, {}]) expect(validateDisplayName(bad as never).ok).toBe(false)
  })

  it('strips control characters so a name cannot smuggle newlines into the admin page', () => {
    const sneaky = `Warden${String.fromCharCode(10)}${String.fromCharCode(0)}Bright`
    expect(validateDisplayName(sneaky)).toEqual({ ok: true, name: 'WardenBright' })
  })

  it('filters profanity through common substitutions', () => {
    expect(isClean('Bright Warden')).toBe(true)
    expect(isClean('sh1t lord')).toBe(false)
    expect(isClean('F.U.C.K')).toBe(false)
  })

  it('suggests a name from the bank so nobody has to type to play', () => {
    expect(validateDisplayName(suggestName()).ok).toBe(true)
  })
})

describe('bearer parsing', () => {
  it('reads a well-formed header', () => {
    expect(bearerFrom({ headers: { authorization: 'Bearer abcdef0123456789' } })).toBe('abcdef0123456789')
  })
  it('ignores junk rather than guessing', () => {
    for (const bad of ['', 'Basic abcdef0123', 'Bearer', 'Bearer short', 'Token abcdef0123456789']) {
      expect(bearerFrom({ headers: { authorization: bad } })).toBe('')
    }
  })
})

describe('rate limiter', () => {
  it('allows up to the limit then refuses within the window', () => {
    const limiter = createLimiter({ limit: 3, windowMs: 60_000, key: () => 'k' })
    expect([1, 2, 3].map(() => limiter.check('k').allowed)).toEqual([true, true, true])
    expect(limiter.check('k').allowed).toBe(false)
  })

  it('counts each key separately', () => {
    const limiter = createLimiter({ limit: 1, windowMs: 60_000, key: () => 'k' })
    expect(limiter.check('a').allowed).toBe(true)
    expect(limiter.check('b').allowed).toBe(true)
    expect(limiter.check('a').allowed).toBe(false)
  })

  it('reopens once the window passes', () => {
    const limiter = createLimiter({ limit: 1, windowMs: 1, key: () => 'k' })
    expect(limiter.check('k').allowed).toBe(true)
    return new Promise((resolve) => setTimeout(resolve, 5)).then(() => {
      expect(limiter.check('k').allowed).toBe(true)
    })
  })
})

describe('account API', () => {
  let server: TestServer

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
    linkAttemptLimiter.reset()
  })

  itDb('creates an account with no input at all and returns a token once', async () => {
    const res = await server.api('POST', '/api/account', { body: {} })
    expect(res.status).toBe(201)
    expect(res.body.accountId).toMatch(/^acc_[0-9a-f]{24}$/)
    expect(res.body.token).toMatch(/^[0-9a-f]{32}$/)
    expect(res.body.displayName).toBeTruthy()
    expect(res.body.linkCode).toMatch(/^[A-Z]{2,12}-[A-Z]{2,12}-\d{2}$/)
  })

  itDb('never stores the raw token (§1: hashed at rest)', async () => {
    const { body } = await server.api('POST', '/api/account', { body: {} })
    const { rows } = await query('SELECT token_hashes FROM accounts WHERE id = $1', [body.accountId])
    expect(rows[0].token_hashes).toEqual([hashToken(body.token)])
    expect(rows[0].token_hashes).not.toContain(body.token)
  })

  itDb('honours a display name supplied at creation, and rejects a bad one', async () => {
    const good = await server.api('POST', '/api/account', { body: { displayName: 'Bright Warden' } })
    expect(good.body.displayName).toBe('Bright Warden')
    const bad = await server.api('POST', '/api/account', { body: { displayName: 'x'.repeat(40) } })
    expect(bad.status).toBe(400)
  })

  itDb('authenticates with the bearer token and refuses without it', async () => {
    const { body } = await server.api('POST', '/api/account', { body: {} })
    const me = await server.api('GET', '/api/account', { token: body.token })
    expect(me.status).toBe(200)
    expect(me.body.accountId).toBe(body.accountId)
    expect(me.body.devices).toBe(1)

    expect((await server.api('GET', '/api/account')).status).toBe(401)
    expect((await server.api('GET', '/api/account', { token: newToken() })).status).toBe(401)
  })

  itDb('renames, because the player picks their name after the account exists', async () => {
    const { body } = await server.api('POST', '/api/account', { body: {} })
    const renamed = await server.api('PATCH', '/api/account', { token: body.token, body: { displayName: 'Liam' } })
    expect(renamed.status).toBe(200)
    expect(renamed.body.displayName).toBe('Liam')
    const me = await server.api('GET', '/api/account', { token: body.token })
    expect(me.body.displayName).toBe('Liam')
  })

  itDb('links a second device, which then sees the same account', async () => {
    const first = await server.api('POST', '/api/account', { body: { displayName: 'Two Devices' } })
    const link = await server.api('POST', '/api/account/link', { body: { linkCode: first.body.linkCode } })

    expect(link.status).toBe(200)
    expect(link.body.accountId).toBe(first.body.accountId)
    expect(link.body.displayName).toBe('Two Devices')
    // A *different* token: the second device gets its own credential.
    expect(link.body.token).not.toBe(first.body.token)

    const asSecond = await server.api('GET', '/api/account', { token: link.body.token })
    expect(asSecond.body.accountId).toBe(first.body.accountId)
    expect(asSecond.body.devices).toBe(2)
  })

  itDb('leaves the first device working after a link (§1: "every linked device")', async () => {
    const first = await server.api('POST', '/api/account', { body: {} })
    await server.api('POST', '/api/account/link', { body: { linkCode: first.body.linkCode } })
    const stillMe = await server.api('GET', '/api/account', { token: first.body.token })
    expect(stillMe.status).toBe(200)
  })

  itDb('burns a code on use — single-use, per §1', async () => {
    const first = await server.api('POST', '/api/account', { body: {} })
    const once = await server.api('POST', '/api/account/link', { body: { linkCode: first.body.linkCode } })
    expect(once.status).toBe(200)
    const twice = await server.api('POST', '/api/account/link', { body: { linkCode: first.body.linkCode } })
    expect(twice.status).toBe(404)
    expect(twice.body.error).toBe('invalid_code')
  })

  itDb('issues codes with the 15-minute TTL §1 specifies', async () => {
    const first = await server.api('POST', '/api/account', { body: {} })
    const { rows } = await query('SELECT expires_at, created_at FROM link_codes WHERE account_id = $1', [
      first.body.accountId,
    ])
    const ttlMs = new Date(rows[0].expires_at).getTime() - new Date(rows[0].created_at).getTime()
    expect(ttlMs).toBeGreaterThan(14 * 60 * 1000)
    expect(ttlMs).toBeLessThanOrEqual(15 * 60 * 1000 + 1000)
  })

  itDb('refuses an expired code', async () => {
    const first = await server.api('POST', '/api/account', { body: {} })
    // Age the code past its TTL. The interval is a literal; only the id is data.
    await query("UPDATE link_codes SET expires_at = now() - interval '1 minute' WHERE account_id = $1", [
      first.body.accountId,
    ])
    const aged = await query('SELECT expires_at < now() AS expired FROM link_codes WHERE account_id = $1', [
      first.body.accountId,
    ])
    expect(aged.rows[0].expired).toBe(true) // the fixture really is stale

    const res = await server.api('POST', '/api/account/link', { body: { linkCode: first.body.linkCode } })
    expect(res.status).toBe(404)
    // And it stays unused, so it can't be redeemed later either.
    const after = await query('SELECT used_at FROM link_codes WHERE account_id = $1', [first.body.accountId])
    expect(after.rows[0].used_at).toBeNull()
  })

  itDb('regenerating a code retires the previous one', async () => {
    const first = await server.api('POST', '/api/account', { body: {} })
    const fresh = await server.api('POST', '/api/account/code', { token: first.body.token })
    expect(fresh.status).toBe(201)
    expect(fresh.body.linkCode).toMatch(/^[A-Z]{2,12}-[A-Z]{2,12}-\d{2}$/)

    const stale = await server.api('POST', '/api/account/link', { body: { linkCode: first.body.linkCode } })
    expect(stale.status).toBe(404)
    const live = await server.api('POST', '/api/account/link', { body: { linkCode: fresh.body.linkCode } })
    expect(live.status).toBe(200)
  })

  itDb('gives the same answer for wrong, spent and expired codes', async () => {
    const first = await server.api('POST', '/api/account', { body: {} })
    await server.api('POST', '/api/account/link', { body: { linkCode: first.body.linkCode } })
    const spent = await server.api('POST', '/api/account/link', { body: { linkCode: first.body.linkCode } })
    const wrong = await server.api('POST', '/api/account/link', { body: { linkCode: 'BRAVE-STAG-99' } })
    expect(spent.status).toBe(wrong.status)
    expect(spent.body).toEqual(wrong.body)
  })

  itDb('rejects a malformed code before it ever reaches the database', async () => {
    const res = await server.api('POST', '/api/account/link', { body: { linkCode: 'nope' } })
    expect(res.status).toBe(400)
  })

  itDb('caps account creation at 5/hour/IP (§1)', async () => {
    const codes: number[] = []
    for (let i = 0; i < 6; i++) codes.push((await server.api('POST', '/api/account', { body: {} })).status)
    expect(codes.slice(0, 5)).toEqual([201, 201, 201, 201, 201])
    expect(codes[5]).toBe(429)
  })

  itDb('caps link attempts, so a code cannot be guessed at speed', async () => {
    const statuses: number[] = []
    for (let i = 0; i < 11; i++) {
      statuses.push((await server.api('POST', '/api/account/link', { body: { linkCode: 'BRAVE-STAG-11' } })).status)
    }
    expect(statuses[10]).toBe(429)
  })

  itDb('drops unknown fields instead of storing them', async () => {
    const res = await server.api('POST', '/api/account', {
      body: { displayName: 'Bright Warden', isAdmin: true, renown: 9999 },
    })
    expect(res.status).toBe(201)
    const { rows } = await query('SELECT * FROM accounts WHERE id = $1', [res.body.accountId])
    expect(Object.keys(rows[0])).toEqual(['id', 'display_name', 'token_hashes', 'build_id', 'created_at', 'last_seen'])
  })

  itDb('sets helmet headers and no CORS (§7: same-origin only)', async () => {
    const res = await server.api('POST', '/api/account', { body: {} })
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })

  itDb('refuses a body over the 64KB limit (§7)', async () => {
    const res = await server.api('POST', '/api/account', { raw: JSON.stringify({ displayName: 'x'.repeat(70_000) }) })
    expect(res.status).toBe(413)
  })

  itDb('answers malformed JSON as a client error, not a crash', async () => {
    const res = await server.api('POST', '/api/account', { raw: '{not json' })
    expect(res.status).toBe(400)
  })

  itDb('404s unknown /api paths as JSON rather than serving the SPA', async () => {
    const res = await server.api('GET', '/api/nope')
    expect(res.status).toBe(404)
    expect(res.body.error).toBe('not_found')
  })

  itDb('stores no password field anywhere (§10.8)', async () => {
    await server.api('POST', '/api/account', { body: {} })
    const { rows } = await query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = $1`,
      [SCHEMA],
    )
    const columns = rows.map((r: { column_name: string }) => r.column_name.toLowerCase())
    for (const forbidden of ['password', 'password_hash', 'email', 'phone', 'address']) {
      expect(columns).not.toContain(forbidden)
    }
  })
})
