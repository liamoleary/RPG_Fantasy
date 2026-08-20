import { unit } from '../data/index'
import type { BattleEvent, BattleResult, Side, SpellOutcome, StackSnap } from '../engine/battle'

/**
 * Reading an event log in words. Shared by the battle screen's ticker and the
 * result screen's key moments (Design Notes 04 §2.3), so the two can never
 * describe the same blow differently.
 */

/** A hit this big is an event with an author, not a glitch (§2.2 / §7). */
export const HEAVY_HIT_FRACTION = 0.4

export function nameOf(snap: StackSnap | undefined, fallback: string): string {
  return snap ? unit(snap.unitId).name : fallback
}

/** Pooled HP a stack has left, the number the heavy-hit threshold is a share of. */
export function poolOf(s: StackSnap): number {
  return Math.max(0, s.count * s.maxHp - s.wound)
}

/**
 * The banner has to say what the spell *did*, not what it says on the tin
 * (DN03 §1.2) — the numbers are rolled in the engine and ride on the event.
 */
export function spellSummary(name: string, amount: number, kind: SpellOutcome, targets: number): string {
  if (targets === 0) return `${name} — no target`
  const across = targets > 1 ? ` across ${targets} stacks` : ''
  const stacks = `${targets} stack${targets === 1 ? '' : 's'}`
  switch (kind) {
    case 'heal':
      return `${name} — ${amount} healed${across}`
    case 'damage':
      return `${name} — ${amount} damage${across}`
    case 'shield':
      return `${name} — +${amount} Bulwark${across}`
    case 'atk':
      return `${name} — +${amount} ATK to ${stacks}`
    case 'root':
      return `${name} — ${stacks} rooted for ${amount} exchanges`
    case 'strikes':
      return `${name} — ${amount} extra strike${amount === 1 ? '' : 's'}`
  }
}

export function describe(e: BattleEvent, playerIsA: boolean): string {
  const side = (s: Side) => (s === 'a') === playerIsA
  switch (e.t) {
    case 'battleStart':
      return 'The warbands close.'
    case 'passive':
      return e.text
    case 'attack': {
      const name = (uid: string, fallback: string) => nameOf(e.snap.find((x) => x.uid === uid), fallback)
      const src = name(e.src, 'A stack')
      const dst = name(e.dst, 'the enemy')
      const verb = e.retaliation ? 'retaliates against' : 'strikes'
      if (e.dmg === 0 && e.absorbed > 0) return `${src} ${verb} ${dst} — ${e.absorbed} absorbed by Bulwark.`
      const soak = e.absorbed > 0 ? ` (${e.absorbed} soaked)` : ''
      return `${src} ${verb} ${dst} for ${e.dmg}${soak}${e.killed > 0 ? `, ${e.killed} slain` : ''}.`
    }
    case 'spellCast':
      return `${side(e.side) ? 'Your' : 'Enemy'} hero casts ${spellSummary(e.name, e.amount, e.kind, e.targets.length)}`
    case 'apex':
      return `${nameOf(e.snap.find((x) => x.uid === e.uid), 'A stack')} unleashes ${spellSummary(e.name, e.amount, e.kind, e.targets.length)}`
    case 'frenzy':
      return 'Frenzy! +ATK'
    case 'lastStand':
      return 'Last Stand — one unit holds the line.'
    case 'root':
      return 'Rooted — it cannot act.'
    case 'venom':
      return 'Venom courses through the ranks.'
    case 'cover': {
      const name = (uid: string, fallback: string) => nameOf(e.snap.find((x) => x.uid === uid), fallback)
      return `${name(e.by, 'The front line')} covers ${name(e.saved, 'the back line')} — volley intercepted.`
    }
    case 'reflect': {
      const name = (uid: string, fallback: string) => nameOf(e.snap.find((x) => x.uid === uid), fallback)
      // "turned back on" — the blow travelled, which is the whole difference
      // between this and Deflect, where it simply stops.
      return `${name(e.uid, 'The shield')} blazes — the blow is turned back on ${name(e.dst, 'the attacker')} for ${e.dmg}.`
    }
    case 'bounce': {
      const name = (uid: string, fallback: string) => nameOf(e.snap.find((x) => x.uid === uid), fallback)
      return `The shield ricochets into ${name(e.dst, 'the line')} for ${e.dmg}${e.killed > 0 ? `, ${e.killed} slain` : ''}.`
    }
    case 'raise': {
      const name = (uid: string, fallback: string) => nameOf(e.snap.find((x) => x.uid === uid), fallback)
      // "back on its feet", never "survives" or "holds" — those belong to Last
      // Stand, which is the effect this one is most likely to be mistaken for.
      return `${name(e.by, 'A banner')} raises ${name(e.uid, 'the fallen')} — back on its feet at 1 unit.`
    }
    case 'deflect': {
      const who = nameOf(e.snap.find((x) => x.uid === e.uid), 'The stack')
      // Says "turned aside", never "absorbed" or "soaked" — those words belong
      // to Bulwark, and the whole point of the keyword is that it is not that.
      return `${who} turns the blow aside completely${e.left > 0 ? ` — ${e.left} left.` : ' — its last.'}`
    }
    case 'heal':
      return 'Healed.'
    case 'cleave':
      return 'Cleave!'
    case 'death':
      return 'A stack is wiped out.'
    case 'summon':
      return 'Reinforcements arrive.'
    case 'buff':
      return e.text
    case 'battleEnd':
      return e.winner === 'tie' ? 'A standstill.' : side(e.winner) ? 'Victory!' : 'Defeat.'
  }
}

export interface KeyMoment {
  label: string
  text: string
  /** true when this went your way */
  mine: boolean
}

/**
 * "How it went" (§2.3) — the three lines that answer *what killed me* without
 * a designer on call: the biggest single blow, the first stack you lost, and
 * the killing hit. Reconstructed from the log, never recomputed.
 */
export function keyMoments(result: BattleResult, playerIsA: boolean): KeyMoment[] {
  const board = new Map<string, StackSnap>()
  const out: KeyMoment[] = []
  let biggest: { text: string; dmg: number; mine: boolean } | null = null
  let firstLoss: KeyMoment | null = null
  let lastBlow: KeyMoment | null = null

  for (const e of result.events) {
    if (e.t === 'battleStart') {
      for (const s of [...e.a, ...e.b]) board.set(s.uid, s)
      continue
    }
    if (e.t === 'attack' || e.t === 'cleave') {
      const src = board.get(e.src)
      const dst = board.get(e.dst)
      const srcName = nameOf(src, 'A stack')
      const dstName = nameOf(dst, 'a stack')
      const mine = src ? (src.side === 'a') === playerIsA : true
      if (e.dmg > 0 && (!biggest || e.dmg > biggest.dmg)) {
        biggest = { text: `${srcName} hit ${dstName} for ${e.dmg}.`, dmg: e.dmg, mine }
      }
      if (e.killed > 0) lastBlow = { label: 'Killing blow', text: `${srcName} finished ${dstName}.`, mine }
    }
    if (e.t === 'death' && !firstLoss) {
      const dead = e.snap.find((s) => s.uid === e.uid) ?? board.get(e.uid)
      const mine = dead ? (dead.side === 'a') === playerIsA : false
      firstLoss = {
        label: 'First stack lost',
        text: `${mine ? 'Your' : 'Their'} ${nameOf(dead, 'stack')} was wiped out.`,
        mine,
      }
    }
    if ('snap' in e) for (const s of e.snap) board.set(s.uid, s)
  }

  if (biggest) out.push({ label: 'Biggest hit', text: biggest.text, mine: biggest.mine })
  if (firstLoss) out.push(firstLoss)
  if (lastBlow) out.push(lastBlow)
  return out
}
