/**
 * The save payload schema (Launch Plan §2, §7: "save payloads schema-checked
 * against SAVE_VERSION").
 *
 * This mirrors the meta slice of src/state/persist.ts. It is duplicated rather
 * than imported because server/ is plain JavaScript that runs unbuilt on
 * Railway while src/ is TypeScript compiled by Vite — a shared module would
 * drag a build step into the server image. The two must move together; the
 * version number is the tripwire that says so.
 */
import { int, isPlainObject } from './validate.js'

/** Must match SAVE_VERSION in src/state/persist.ts. */
export const SAVE_VERSION = 1

/* Caps exist so one malformed client can't push an unbounded blob into jsonb.
   All are far above anything real play produces. */
const MAX_UNLOCKS = 200
const MAX_FEATS = 200
const MAX_HEROES = 100
const MAX_ID_LENGTH = 64
const MAX_RENOWN = 1_000_000
const MAX_RUNS = 100_000

/** Ids are engine identifiers, not free text: conservative charset, hard cap. */
function cleanId(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_ID_LENGTH) return null
  return /^[A-Za-z0-9_.:-]+$/.test(trimmed) ? trimmed : null
}

/**
 * Returns `{ ok: true, meta }` with a value built field by field from scratch,
 * so nothing the client sent survives except what is named here — that is §7's
 * "unknown fields dropped", enforced by construction rather than by deletion.
 */
export function validateMeta(raw) {
  if (!isPlainObject(raw)) return { ok: false, reason: 'data must be an object' }

  const renown = int(raw.renown, 0, MAX_RENOWN, null)
  if (renown === null) return { ok: false, reason: 'renown must be a non-negative integer' }

  if (raw.unlocks !== undefined && !Array.isArray(raw.unlocks)) return { ok: false, reason: 'unlocks must be an array' }
  const unlocks = []
  for (const entry of raw.unlocks ?? []) {
    const id = cleanId(entry)
    if (id && !unlocks.includes(id)) unlocks.push(id)
    if (unlocks.length >= MAX_UNLOCKS) break
  }

  if (raw.feats !== undefined && !isPlainObject(raw.feats)) return { ok: false, reason: 'feats must be an object' }
  const feats = {}
  for (const key of Object.keys(raw.feats ?? {})) {
    const id = cleanId(key)
    // The client's shape is Record<string, true>; anything falsy is "not earned"
    // and simply isn't stored.
    if (id && raw.feats[key]) feats[id] = true
    if (Object.keys(feats).length >= MAX_FEATS) break
  }

  const rawStats = isPlainObject(raw.stats) ? raw.stats : {}
  const best = {}
  const rawBest = isPlainObject(rawStats.bestPlacementByHero) ? rawStats.bestPlacementByHero : {}
  for (const key of Object.keys(rawBest)) {
    const heroId = cleanId(key)
    const placement = int(rawBest[key], 1, 99, null)
    if (heroId && placement !== null) best[heroId] = placement
    if (Object.keys(best).length >= MAX_HEROES) break
  }

  const stats = {
    runs: int(rawStats.runs, 0, MAX_RUNS, 0),
    wins: int(rawStats.wins, 0, MAX_RUNS, 0),
    bestPlacementByHero: best,
  }
  // Self-reported (§7 accepts that), but internally consistent: more wins than
  // runs is a bug or a clumsy edit, and storing it would poison §5's summary.
  if (stats.wins > stats.runs) stats.wins = stats.runs

  return { ok: true, meta: { renown, unlocks, feats, stats } }
}
