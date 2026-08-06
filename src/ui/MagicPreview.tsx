/**
 * What a Magic node actually does to *your* spell, right now (DN05 §4:
 * "Magic nodes show the spell's before → after"). Lives in its own module so
 * both the level-up columns and the War Council screen can show it without one
 * importing the other.
 */
import type { FactionId, HeroDef, HeroMods } from '../data/types'
import type { TalentNode } from '../data/talents/index'
import { addMods } from '../data/types'
import { spellCadence, spellCasts, spellPower, spellTargets, type HeroState } from '../engine/battle'
import { heroLevel } from '../engine/talents'

const SPELL_VERB: Record<string, string> = {
  shieldLowest: 'shields',
  rallyAtk: 'grants',
  healMostWounded: 'heals',
  root: 'roots for',
  chainLightning: 'deals',
  extraAttack: 'strikes',
}

export function MagicPreview({ hero, mods, round, boon }: { hero: HeroDef; mods: HeroMods; round: number; boon: TalentNode }) {
  const base: HeroState = { heroId: hero.id, name: hero.name, factionId: hero.faction as FactionId, level: heroLevel(round), mods }
  const next: HeroState = { ...base, mods: addMods(mods, boon.mods) }
  const bits: string[] = []
  const pair = <T,>(a: T, b: T, text: (a: T, b: T) => string) => {
    if (a !== b) bits.push(text(a, b))
  }
  pair(spellPower(hero, base), spellPower(hero, next), (a, b) => `${SPELL_VERB[hero.spell.id] ?? 'is'} ${a} \u2192 ${b}`)
  pair(spellCasts(hero, base), spellCasts(hero, next), (a, b) => `casts ${a}\u00d7 \u2192 ${b}\u00d7`)
  pair(spellCadence(hero, base), spellCadence(hero, next), (a, b) => `every ${a} \u2192 ${b} exchanges`)
  pair(spellTargets(hero, base), spellTargets(hero, next), (a, b) => `${a} \u2192 ${b} targets`)
  if (bits.length === 0) return null
  return (
    <span className="boon-preview">
      {hero.spell.name}: {bits.join(', ')}
    </span>
  )
}
