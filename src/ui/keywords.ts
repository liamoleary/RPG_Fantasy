/**
 * Plain-language keyword copy — the single source for the Inspect sheet and the
 * settings glossary (Design Notes 01 §2.1/§2.4). Magnitudes are substituted so
 * the player never has to hold the arithmetic in their head.
 */
import type { Keyword, KeywordId } from '../data/types'

interface Entry {
  name: string
  /** with the unit's magnitude filled in */
  detail: (x: number) => string
  /** generic form for the glossary, where there is no unit to read X from */
  generic: string
}

const ENTRIES: Record<KeywordId, Entry> = {
  bulwark: {
    name: 'Bulwark',
    detail: (x) => `absorbs ${x} damage per unit from each attack, then weakens by 1`,
    generic:
      'Armour. Absorbs X damage per surviving unit from every incoming attack, then weakens by 1. It takes a slice off every blow and lasts all battle — where Deflect stops one blow completely and is then spent.',
  },
  raise: {
    name: 'Raise',
    detail: (x) =>
      `${x === 1 ? 'once' : `${x} times`} per battle, a friendly stack that is wiped out returns at 1 unit`,
    generic:
      'X times each battle, a friendly stack that has been wiped out is brought back onto the field at 1 unit. This is not Marshal Yseult’s Last Stand: hers keeps a stack from ever falling, this one answers after it already has. A warband can carry both, and they do not overlap.',
  },
  deflect: {
    name: 'Deflect',
    detail: (x) =>
      `the first ${x === 1 ? 'attack' : `${x} attacks`} against this stack each battle ${x === 1 ? 'is' : 'are'} stopped completely`,
    generic:
      'The first X attacks against this stack each battle are stopped completely — no damage, no Venom, no armour spent. This is not Bulwark: Bulwark shaves every hit for the whole battle, Deflect cancels one hit outright and is then gone. Siege ignores Bulwark but not Deflect. Venom already coursing through the stack is a condition, not an attack, and is not deflected.',
  },
  charge: {
    name: 'Charge',
    detail: () => 'acts first on the opening cycle, whatever its Initiative',
    generic: 'Acts first on the opening cycle of the battle, whatever its Initiative.',
  },
  volley: {
    name: 'Volley',
    detail: () => 'shoots any enemy stack in either row, and is never retaliated against — Cover units can intercept it',
    generic:
      'Ranged. Shoots any enemy stack in either row, even through a full front line, and never provokes retaliation. Volleys can strike any row — Cover units can intercept them.',
  },
  siege: {
    name: 'Siege',
    detail: () => 'ignores Bulwark entirely and hunts the best-armoured target',
    generic: 'Ignores Bulwark entirely and prefers the enemy stack with the most armour.',
  },
  cover: {
    name: 'Cover',
    detail: (x) =>
      `the first ${x} volley${x === 1 ? '' : 's'} each battle aimed at the back-row stacks behind this one hit this stack instead`,
    generic:
      'The first X volleys each battle aimed at a back-row stack this unit stands over are taken by this unit instead. Only front-row stacks can cover, and each covers the two back slots behind it. Siege and hero spells ignore Cover.',
  },
  guard: {
    name: 'Guard',
    detail: (x) => `gives the neighbouring stack Bulwark ${x} for the whole battle`,
    generic: 'Gives the neighbouring stack Bulwark X for the whole battle.',
  },
  cleave: {
    name: 'Cleave',
    detail: () => 'damage that overkills a stack spills into the stack beside it',
    generic: 'Damage left over after wiping a stack spills into an adjacent enemy stack.',
  },
  venom: {
    name: 'Venom',
    detail: (x) => `the struck stack loses ${x} unit${x === 1 ? '' : 's'} when it next acts`,
    generic: 'The stack it strikes loses X units when it next acts.',
  },
  lifesteal: {
    name: 'Lifesteal',
    detail: () => 'heals this stack for half the damage it deals',
    generic: 'Heals its own stack for half the damage it deals.',
  },
  deathcry: {
    name: 'Deathcry',
    detail: () => 'fires one last effect as the stack is wiped out',
    generic: 'Fires one last effect at the moment the stack is wiped out.',
  },
  growth: {
    name: 'Growth',
    detail: (x) => `permanently gains +${x} HP every Muster it survives, and +${x} ATK every other Muster`,
    generic: 'Permanently gains +X HP every Muster it survives, and +X ATK every other Muster.',
  },
  frenzy: {
    name: 'Frenzy',
    detail: (x) => `gains +${x} ATK each time it takes casualties and lives`,
    generic: 'Gains +X ATK each time it takes casualties and survives.',
  },
  summon: {
    name: 'Summon',
    detail: () => 'calls a fresh stack onto an open slot mid-battle',
    generic: 'Calls a fresh stack onto an open slot mid-battle.',
  },
}

export function keywordName(k: Keyword): string {
  const e = ENTRIES[k.k]
  return `${e ? e.name : k.k}${k.x ? ` ${k.x}` : ''}`
}

/** e.g. 'Bulwark 2 — absorbs 2 damage per unit from each attack, then weakens by 1' */
export function keywordText(k: Keyword): string {
  const e = ENTRIES[k.k]
  if (!e) return k.k
  return `${keywordName(k)} — ${e.detail(k.x ?? 1)}`
}

export const KEYWORD_GLOSSARY: { id: KeywordId; name: string; text: string }[] = (
  Object.keys(ENTRIES) as KeywordId[]
).map((id) => ({ id, name: ENTRIES[id].name, text: ENTRIES[id].generic }))
