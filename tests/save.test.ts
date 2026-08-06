/**
 * Commit 3 coverage, per §10.7: "save PUT/GET round-trip, the stale-write
 * rejection rule". Plus §2's split (meta synced, run and settings not), the
 * merge that reapplies a delta after a 409, and the migration clause.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
// @ts-expect-error — server/ is plain ESM JavaScript, outside the TS build.
import { closeDb, initDb, query } from '../server/db.js'
// @ts-expect-error — as above.
import { runMigrations } from '../server/migrate.js'
// @ts-expect-error — as above.
import { SAVE_VERSION as SERVER_SAVE_VERSION, validateMeta } from '../server/lib/save.js'
// @ts-expect-error — as above.
import { createAccountLimiter } from '../server/routes/account.js'
import { mergeMeta, metaEquals, metaOf, withMeta, type MetaSave } from '../src/state/meta'
import { DEFAULT_SAVE, SAVE_VERSION, type SaveData } from '../src/state/persist'
import { isolatedSchema, itDb, TEST_DB_URL, truncateAll } from './helpers/db'
import { startTestServer, type TestServer } from './helpers/server'

/** This file's private schema, so parallel test files cannot truncate each other. */
const SCHEMA = 't_save'

const meta = (over: Partial<MetaSave> = {}): MetaSave => ({
  renown: 0,
  unlocks: [],
  feats: {},
  stats: { runs: 0, wins: 0, bestPlacementByHero: {} },
  ...over,
})

describe('the client and server agree on the save version', () => {
  it('server SAVE_VERSION matches the client constant', () => {
    // The two schemas are duplicated across the TS/JS boundary on purpose
    // (see server/lib/save.js); this is the tripwire that they drifted.
    expect(SERVER_SAVE_VERSION).toBe(SAVE_VERSION)
  })
})

describe('meta slice (§2 split)', () => {
  it('extracts exactly the four server-owned fields', () => {
    const save: SaveData = {
      ...DEFAULT_SAVE,
      renown: 12,
      unlocks: ['h_yseult'],
      feats: { first_win: true },
      stats: { runs: 3, wins: 1, bestPlacementByHero: { h_berrik: 2 } },
      settings: { speedDefault: 2, reducedMotion: true, difficulty: 'warlord' },
      activeRun: { seed: 1 } as never,
    }
    expect(Object.keys(metaOf(save)).sort()).toEqual(['feats', 'renown', 'stats', 'unlocks'])
  })

  it('never carries the run or the settings — the device owns those', () => {
    const save: SaveData = { ...DEFAULT_SAVE, activeRun: { seed: 99 } as never }
    const slice = JSON.stringify(metaOf(save))
    expect(slice).not.toContain('activeRun')
    expect(slice).not.toContain('difficulty')
    expect(slice).not.toContain('reducedMotion')
  })

  it('grafts a slice back without disturbing the run in progress', () => {
    const save: SaveData = { ...DEFAULT_SAVE, activeRun: { seed: 99 } as never, renown: 1 }
    const next = withMeta(save, meta({ renown: 50 }))
    expect(next.renown).toBe(50)
    expect(next.activeRun).toEqual({ seed: 99 })
    expect(next.settings).toEqual(save.settings)
  })

  it('is copied, not aliased — mutating the slice cannot corrupt the save', () => {
    const save = { ...DEFAULT_SAVE, unlocks: ['a'] }
    const slice = metaOf(save)
    slice.unlocks.push('b')
    expect(save.unlocks).toEqual(['a'])
  })
})

describe('metaEquals', () => {
  it('ignores key and element ordering', () => {
    expect(metaEquals(meta({ unlocks: ['a', 'b'] }), meta({ unlocks: ['b', 'a'] }))).toBe(true)
  })
  it('notices a real change', () => {
    expect(metaEquals(meta({ renown: 1 }), meta({ renown: 2 }))).toBe(false)
    expect(metaEquals(meta({ feats: { x: true } }), meta())).toBe(false)
  })
})

describe('mergeMeta — reapplying a delta (§2)', () => {
  it('takes the higher renown', () => {
    expect(mergeMeta(meta({ renown: 40 }), meta({ renown: 12 })).renown).toBe(40)
  })

  it('unions unlocks and feats, so neither side loses progress', () => {
    const merged = mergeMeta(
      meta({ unlocks: ['a'], feats: { one: true } }),
      meta({ unlocks: ['b'], feats: { two: true } }),
    )
    expect(merged.unlocks.sort()).toEqual(['a', 'b'])
    expect(Object.keys(merged.feats).sort()).toEqual(['one', 'two'])
  })

  it('keeps the best (lowest) placement per hero', () => {
    const merged = mergeMeta(
      meta({ stats: { runs: 5, wins: 1, bestPlacementByHero: { h_berrik: 3, h_zhala: 1 } } }),
      meta({ stats: { runs: 4, wins: 2, bestPlacementByHero: { h_berrik: 2 } } }),
    )
    expect(merged.stats.bestPlacementByHero).toEqual({ h_berrik: 2, h_zhala: 1 })
  })

  it('never lets wins exceed runs after taking each from a different side', () => {
    const merged = mergeMeta(
      meta({ stats: { runs: 2, wins: 2, bestPlacementByHero: {} } }),
      meta({ stats: { runs: 9, wins: 0, bestPlacementByHero: {} } }),
    )
    expect(merged.stats.runs).toBe(9)
    expect(merged.stats.wins).toBeLessThanOrEqual(merged.stats.runs)
  })

  it('is commutative for the fields that matter', () => {
    const a = meta({ renown: 10, unlocks: ['x'], stats: { runs: 3, wins: 2, bestPlacementByHero: { h: 4 } } })
    const b = meta({ renown: 7, unlocks: ['y'], stats: { runs: 8, wins: 1, bestPlacementByHero: { h: 2 } } })
    expect(metaEquals(mergeMeta(a, b), mergeMeta(b, a))).toBe(true)
  })
})

describe('server-side payload validation (§7)', () => {
  it('rejects a non-object and a missing renown', () => {
    expect(validateMeta(null).ok).toBe(false)
    expect(validateMeta([]).ok).toBe(false)
    expect(validateMeta({}).ok).toBe(false)
    expect(validateMeta({ renown: 'lots' }).ok).toBe(false)
  })

  it('builds the stored value from scratch, dropping unknown fields', () => {
    const out = validateMeta({ renown: 5, isAdmin: true, activeRun: { seed: 1 }, settings: { difficulty: 'x' } })
    expect(out.ok).toBe(true)
    expect(Object.keys(out.meta).sort()).toEqual(['feats', 'renown', 'stats', 'unlocks'])
  })

  it('caps list sizes rather than storing an unbounded blob', () => {
    const out = validateMeta({ renown: 0, unlocks: Array.from({ length: 5000 }, (_, i) => `u_${i}`) })
    expect(out.meta.unlocks.length).toBeLessThanOrEqual(200)
  })

  it('drops ids that are not engine identifiers', () => {
    const out = validateMeta({ renown: 0, unlocks: ['h_ok', 'a b', '<script>', 'x'.repeat(200), ''] })
    expect(out.meta.unlocks).toEqual(['h_ok'])
  })

  it('dedupes unlocks and ignores unearned feats', () => {
    const out = validateMeta({ renown: 0, unlocks: ['a', 'a', 'b'], feats: { earned: true, not_earned: false } })
    expect(out.meta.unlocks).toEqual(['a', 'b'])
    expect(out.meta.feats).toEqual({ earned: true })
  })

  it('clamps a self-reported stat set into internal consistency', () => {
    const out = validateMeta({ renown: -5, stats: { runs: 2, wins: 99, bestPlacementByHero: { h: 0 } } })
    expect(out.meta.renown).toBe(0)
    expect(out.meta.stats.wins).toBe(2)
    expect(out.meta.stats.bestPlacementByHero.h).toBe(1)
  })
})

describe('save API', () => {
  let server: TestServer
  let token = ''

  const newAccount = async () => {
    const res = await server.api('POST', '/api/account', { body: {} })
    return res.body.token as string
  }

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
    token = await newAccount()
  })

  itDb('404s before anything has been saved — the migration signal (§2)', async () => {
    const res = await server.api('GET', '/api/save', { token })
    expect(res.status).toBe(404)
    expect(res.body.error).toBe('no_save')
  })

  itDb('round-trips a save', async () => {
    const payload = meta({
      renown: 42,
      unlocks: ['h_yseult'],
      feats: { first_win: true },
      stats: { runs: 7, wins: 2, bestPlacementByHero: { h_berrik: 1 } },
    })
    const put = await server.api('PUT', '/api/save', { token, body: { saveVersion: SAVE_VERSION, data: payload } })
    expect(put.status).toBe(200)
    expect(put.body.ok).toBe(true)

    const get = await server.api('GET', '/api/save', { token })
    expect(get.status).toBe(200)
    expect(get.body.saveVersion).toBe(SAVE_VERSION)
    expect(get.body.data).toEqual(payload)
  })

  itDb('requires a token', async () => {
    expect((await server.api('GET', '/api/save')).status).toBe(401)
    expect((await server.api('PUT', '/api/save', { body: { saveVersion: SAVE_VERSION, data: meta() } })).status).toBe(401)
  })

  itDb('rejects a wrong saveVersion (§7)', async () => {
    for (const bad of [0, 2, '1', null, undefined]) {
      const res = await server.api('PUT', '/api/save', { token, body: { saveVersion: bad, data: meta() } })
      expect(res.status).toBe(400)
    }
  })

  itDb('keeps one row per account — a second PUT updates, not appends', async () => {
    await server.api('PUT', '/api/save', { token, body: { saveVersion: SAVE_VERSION, data: meta({ renown: 1 }) } })
    await server.api('PUT', '/api/save', { token, body: { saveVersion: SAVE_VERSION, data: meta({ renown: 2 }) } })
    const { rows } = await query('SELECT renown FROM saves')
    expect(rows).toHaveLength(1)
    expect(rows[0].renown).toBe(2)
  })

  itDb('never stores the run or the settings, even if a client sends them', async () => {
    await server.api('PUT', '/api/save', {
      token,
      body: {
        saveVersion: SAVE_VERSION,
        data: { ...meta({ renown: 3 }), activeRun: { seed: 5 }, settings: { difficulty: 'warlord' } },
      },
    })
    const { rows } = await query('SELECT data FROM saves')
    expect(Object.keys(rows[0].data).sort()).toEqual(['feats', 'renown', 'stats', 'unlocks'])
  })

  // ── the stale-write rejection rule (§2) ──────────────────────────────────
  itDb('refuses a write that would lower renown', async () => {
    await server.api('PUT', '/api/save', { token, body: { saveVersion: SAVE_VERSION, data: meta({ renown: 40 }) } })
    const stale = await server.api('PUT', '/api/save', {
      token,
      body: { saveVersion: SAVE_VERSION, data: meta({ renown: 12 }) },
    })
    expect(stale.status).toBe(409)
    expect(stale.body.error).toBe('stale_write')

    const after = await server.api('GET', '/api/save', { token })
    expect(after.body.data.renown).toBe(40) // untouched
  })

  itDb('returns the stored save with the 409, so the client can reapply in one trip', async () => {
    const stored = meta({ renown: 40, unlocks: ['h_yseult'] })
    await server.api('PUT', '/api/save', { token, body: { saveVersion: SAVE_VERSION, data: stored } })
    const stale = await server.api('PUT', '/api/save', {
      token,
      body: { saveVersion: SAVE_VERSION, data: meta({ renown: 12 }) },
    })
    expect(stale.body.data).toEqual(stored)
  })

  itDb('allows a lower renown when the write is flagged runDelta', async () => {
    await server.api('PUT', '/api/save', { token, body: { saveVersion: SAVE_VERSION, data: meta({ renown: 40 }) } })
    const res = await server.api('PUT', '/api/save', {
      token,
      body: { saveVersion: SAVE_VERSION, data: meta({ renown: 12 }), runDelta: true },
    })
    expect(res.status).toBe(200)
    expect((await server.api('GET', '/api/save', { token })).body.data.renown).toBe(12)
  })

  itDb('allows equal and higher renown without the flag', async () => {
    await server.api('PUT', '/api/save', { token, body: { saveVersion: SAVE_VERSION, data: meta({ renown: 40 }) } })
    for (const renown of [40, 41]) {
      const res = await server.api('PUT', '/api/save', { token, body: { saveVersion: SAVE_VERSION, data: meta({ renown }) } })
      expect(res.status).toBe(200)
    }
  })

  itDb('never applies the guard to a first write', async () => {
    const res = await server.api('PUT', '/api/save', { token, body: { saveVersion: SAVE_VERSION, data: meta({ renown: 0 }) } })
    expect(res.status).toBe(200)
  })

  itDb('the documented recovery from a 409 actually converges', async () => {
    // Device A banks 40 renown.
    await server.api('PUT', '/api/save', {
      token,
      body: { saveVersion: SAVE_VERSION, data: meta({ renown: 40, unlocks: ['from_a'] }) },
    })
    // Device B has been offline at 12, with an unlock A never saw.
    const localB = meta({ renown: 12, unlocks: ['from_b'] })
    const rejected = await server.api('PUT', '/api/save', { token, body: { saveVersion: SAVE_VERSION, data: localB } })
    expect(rejected.status).toBe(409)

    // §2's prescription: refetch and reapply the delta.
    const reconciled = mergeMeta(rejected.body.data, localB)
    const retry = await server.api('PUT', '/api/save', { token, body: { saveVersion: SAVE_VERSION, data: reconciled } })
    expect(retry.status).toBe(200)

    const final = await server.api('GET', '/api/save', { token })
    expect(final.body.data.renown).toBe(40)
    expect(final.body.data.unlocks.sort()).toEqual(['from_a', 'from_b']) // nobody lost anything
  })

  itDb('isolates accounts from each other', async () => {
    const other = await newAccount()
    await server.api('PUT', '/api/save', { token, body: { saveVersion: SAVE_VERSION, data: meta({ renown: 99 }) } })
    expect((await server.api('GET', '/api/save', { token: other })).status).toBe(404)
  })

  itDb('a linked device sees the same save (§8 step 5)', async () => {
    const created = await server.api('POST', '/api/account', { body: {} })
    await server.api('PUT', '/api/save', {
      token: created.body.token,
      body: { saveVersion: SAVE_VERSION, data: meta({ renown: 33 }) },
    })
    const linked = await server.api('POST', '/api/account/link', { body: { linkCode: created.body.linkCode } })
    const asSecondDevice = await server.api('GET', '/api/save', { token: linked.body.token })
    expect(asSecondDevice.status).toBe(200)
    expect(asSecondDevice.body.data.renown).toBe(33)
  })
})
