import { describe, expect, it } from 'vitest'
import { FACTIONS, HEROES, heroesOfFaction } from '../src/data/index'
import { WAR_BANKS } from '../src/engine/run'

/**
 * Hero and faction parity.
 *
 * These are shape checks, not win rates — `npm run balance` measures those and
 * takes minutes. What is pinned here is the structure that made the numbers
 * diverge in the first place, because every one of these failed silently:
 *
 *   - a hero on a slower cadence lands fewer spells in a battle that is over
 *     in six exchanges, and no amount of magnitude tuning shows that up
 *   - a passive with no number in it cannot be balanced against five that have
 *     one, so Yseult's Last Stand sat untunable for the whole of DN09
 *   - a faction with no war bank while the others have one falls off a cliff;
 *     Verdant went from the strongest banner to nearly the weakest that way
 */

describe('every hero gets the same number of casts', () => {
  it('shares one spell cadence, so nobody silently loses a cast', () => {
    // Median battle is 6 exchanges. At everyN 3 the schedule is 0/3/6 and all
    // three land; at 7 it is 0/7/14 and only the first does. That difference
    // is worth about a third of a hero's kit and is invisible in the data.
    const cadences = new Set(HEROES.map((h) => h.spell.everyN))
    expect([...cadences], `heroes are on different cadences: ${[...cadences].join(', ')}`).toHaveLength(1)
    const only = [...cadences][0]
    expect(only, 'a cadence above 4 loses casts to a median-length battle').toBeLessThanOrEqual(4)
    expect(only).toBeGreaterThanOrEqual(2)
  })
})

describe('every passive has a number to tune', () => {
  it('gives each hero a knob, so none of them is stuck', () => {
    for (const h of HEROES) {
      // `survivorGrowsCount` is deliberately exempt: +1 count per surviving
      // stack has no sensible fractional form, and its strength is tuned
      // through Maravel's spell instead.
      if (h.passive.id === 'survivorGrowsCount') continue
      expect(h.passive.x, `${h.name}'s passive has no x`).toBeGreaterThan(0)
    }
  })

  it('says out loud what the number is', () => {
    // The passive text is rendered verbatim on Home and in the hero sheet, so
    // a number changed in the data and not in the prose is a lie to the player.
    for (const h of HEROES) {
      if (h.passive.x === undefined) continue
      expect(
        h.passive.text.includes(String(h.passive.x)) || h.passive.text.includes(numberWord(h.passive.x)),
        `${h.name}'s passive says "${h.passive.text}" but x is ${h.passive.x}`,
      ).toBe(true)
    }
  })
})

describe('no banner is left out of the war banks', () => {
  it('gives every faction one', () => {
    for (const f of FACTIONS) {
      expect(WAR_BANKS[f.id], `${f.id} has no war bank`).toBeDefined()
    }
  })

  it('puts them all on the same trigger, so none is a worse deal by shape', () => {
    // `held` paid only on front-row survivors — the row whose job is to absorb
    // damage and die — so it rewarded already winning. Measured at 32% of the
    // board per battle against `stood`'s 44%.
    const triggers = new Set(FACTIONS.map((f) => WAR_BANKS[f.id].trigger))
    expect([...triggers]).toHaveLength(1)
  })

  it('keeps their totals within a hair of each other', () => {
    // Identity lives in the atk/hp split, never in the size of the grant.
    const worth = FACTIONS.map((f) => WAR_BANKS[f.id].atk * 2 + WAR_BANKS[f.id].hp)
    expect(Math.max(...worth) - Math.min(...worth), `war bank totals differ: ${worth.join(', ')}`).toBeLessThanOrEqual(2)
  })
})

describe('renown buys variety, never strength', () => {
  it('gives every faction exactly one free hero and one paid', () => {
    for (const f of FACTIONS) {
      const hs = heroesOfFaction(f.id)
      expect(hs.filter((h) => h.unlockRenown === 0), `${f.id} free heroes`).toHaveLength(1)
      expect(hs.filter((h) => h.unlockRenown > 0), `${f.id} paid heroes`).toHaveLength(1)
    }
  })

  it('never lets a paid hero be a bigger spell than a free one by construction', () => {
    // Not a win-rate claim — that is the harness's job. This catches the crude
    // version: a paid hero handed strictly more of everything than its free
    // counterpart on the same spell.
    for (const f of FACTIONS) {
      const [free] = heroesOfFaction(f.id).filter((h) => h.unlockRenown === 0)
      const [paid] = heroesOfFaction(f.id).filter((h) => h.unlockRenown > 0)
      if (free.spell.id !== paid.spell.id) continue
      const strictlyBigger = paid.spell.base > free.spell.base && paid.spell.perLevel > free.spell.perLevel
      expect(strictlyBigger, `${paid.name} is a strictly bigger ${paid.spell.id} than ${free.name}`).toBe(false)
    }
  })
})

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six']
const numberWord = (n: number): string => WORDS[n] ?? String(n)
