import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HERO_ART, HERO_ART_2X, UNIT_ART } from '../src/data/art'
import { ALL_UNITS, HEROES } from '../src/data/index'

/**
 * Art and data must never drift. A unit added later without a plate should
 * fail here, loudly, rather than render a blank card in someone's run.
 */
const PUBLIC = join(import.meta.dirname, '..', 'public')

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

  it('points every entry at a file that actually shipped', () => {
    const all = [...Object.values(UNIT_ART), ...Object.values(HERO_ART), ...Object.values(HERO_ART_2X)]
    const absent = all.filter((url) => !existsSync(join(PUBLIC, url)))
    expect(absent, `manifest paths with no file: ${absent.join(', ')}`).toEqual([])
  })
})
