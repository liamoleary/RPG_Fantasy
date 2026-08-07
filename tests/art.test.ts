import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HERO_ART, HERO_ART_2X, UNIT_ART } from '../src/data/art'
import { ALL_UNITS, HEROES, unit } from '../src/data/index'
import { projectileOf } from '../src/ui/StackCard'

/**
 * Art and data must never drift, but the rule runs one way only:
 * **every unit must have art; art without a unit is fine.** Plates drawn ahead
 * of the game live in public/art/_unassigned as future content inventory
 * (PLAN_ART_AND_THEME §2b) and are exempt from every check here — they are
 * referenced by nothing, need no UnitDef, and never ship.
 *
 * A unit added later without a plate still fails here, loudly, rather than
 * rendering a blank card in someone's run.
 */
const PUBLIC = join(import.meta.dirname, '..', 'public')
const UNASSIGNED = join(PUBLIC, 'art', '_unassigned')

describe('card art manifest', () => {
  it('has a plate for every unit', () => {
    const missing = ALL_UNITS.filter((u) => !UNIT_ART[u.id]).map((u) => u.id)
    expect(missing, `units with no art: ${missing.join(', ')}`).toEqual([])
  })

  it('has a plate for every hero, at both sizes', () => {
    const missing = HEROES.filter((h) => !HERO_ART[h.id]).map((h) => h.id)
    const missing2x = HEROES.filter((h) => !HERO_ART_2X[h.id]).map((h) => h.id)
    expect(missing, `heroes with no art: ${missing.join(', ')}`).toEqual([])
    expect(missing2x, `heroes with no @2x art: ${missing2x.join(', ')}`).toEqual([])
  })

  it('carries no entries for ids the game does not have', () => {
    const unitIds = new Set(ALL_UNITS.map((u) => u.id))
    const heroIds = new Set(HEROES.map((h) => h.id))
    expect(Object.keys(UNIT_ART).filter((id) => !unitIds.has(id))).toEqual([])
    expect(Object.keys(HERO_ART).filter((id) => !heroIds.has(id))).toEqual([])
  })

  it('leaves _unassigned art alone — no unit needed, nothing shipped', () => {
    // The folder is optional; the exemption is what matters, not its contents.
    if (!existsSync(UNASSIGNED)) return
    const parked = readdirSync(UNASSIGNED).filter((f) => f.endsWith('.webp'))
    const manifest = new Set([
      ...Object.values(UNIT_ART),
      ...Object.values(HERO_ART),
      ...Object.values(HERO_ART_2X),
    ])
    // Referenced by nothing: that is what keeps them inert, and what lets the
    // build drop them instead of shipping ~1.5 MB of unused plates to a phone.
    const referenced = parked.filter((f) => manifest.has(`/art/_unassigned/${f}`))
    expect(referenced, `parked art must not be in the manifest: ${referenced.join(', ')}`).toEqual([])
  })

  it('points every entry at a file that actually shipped', () => {
    const all = [...Object.values(UNIT_ART), ...Object.values(HERO_ART), ...Object.values(HERO_ART_2X)]
    const absent = all.filter((url) => !existsSync(join(PUBLIC, url)))
    expect(absent, `manifest paths with no file: ${absent.join(', ')}`).toEqual([])
  })
})

/**
 * Volley flavour (Design Notes 03 §4): every Volley unit resolves a projectile,
 * and the faction defaults are the ones the brief names.
 */
describe('projectile flavour', () => {
  const volley = ALL_UNITS.filter((u) => u.keywords.some((k) => k.k === 'volley'))

  it('every Volley unit gets a flavour, and only Volley units declare one', () => {
    expect(volley.length).toBeGreaterThan(0)
    for (const u of volley) expect(['bolt', 'arrow', 'spark', 'harpoon']).toContain(projectileOf(u))
    for (const u of ALL_UNITS) {
      if (!u.projectile) continue
      expect(u.keywords.some((k) => k.k === 'volley'), `${u.id} declares a projectile but has no Volley`).toBe(true)
    }
  })

  it('falls back to the faction default, and data overrides it', () => {
    expect(projectileOf(unit('vg_crossbow'))).toBe('bolt')
    expect(projectileOf(unit('vd_dryad'))).toBe('arrow')
    expect(projectileOf(unit('st_slinger'))).toBe('spark')
    expect(projectileOf(unit('mc_bowman'))).toBe('arrow')
    expect(projectileOf(unit('st_harpooner'))).toBe('harpoon')
    expect(projectileOf(unit('st_stormspear'))).toBe('harpoon')
  })
})
