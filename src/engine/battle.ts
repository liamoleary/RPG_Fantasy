/**
 * simulateBattle — a PURE, SEEDED function (§12.3 rule 1).
 *
 * No Date.now(), no Math.random(): every random decision goes through the
 * injected RNG. The UI never recomputes combat — it replays `events` (rule 2).
 * Every event that changes the board carries a `snap` of the affected stacks,
 * so the renderer stays a dumb projector of the log.
 */
import { UNIT_BY_ID } from '../data/index'
import type { AbilityEffect, FactionId, HeroDef, HeroMods, KeywordId, Row, UnitDef } from '../data/types'
import { rankDefOf } from './ranks'
import { makeRng, type RNG } from './rng'

export const MAX_EXCHANGES = 200
export const FRONT_SLOTS = 4
export const BACK_SLOTS = 3
export const TOTAL_SLOTS = FRONT_SLOTS + BACK_SLOTS

export type Side = 'a' | 'b'

/** A stack as it lives in run state between battles. */
export interface BoardStack {
  uid: string
  unitId: string
  count: number
  /** 0–3 front row, 4–6 back row */
  slot: number
  /** permanent per-unit bonuses accumulated during the run (Growth, effects) */
  bonusAtk: number
  bonusHp: number
  /** number of Growth ticks this stack has received */
  growthTicks: number
  /** gold sunk into this stack, for sell refunds */
  spent: number
  /** Banner Rank earned by stack size: 0 none, 1 Veteran, 2 Honored (§3) */
  rank: number
}

export interface HeroState {
  heroId: string
  name: string
  factionId: FactionId
  level: number
  mods: HeroMods
}

export interface BattleSide {
  board: BoardStack[]
  hero: HeroState
}

export interface StackSnap {
  uid: string
  side: Side
  unitId: string
  slot: number
  count: number
  startCount: number
  wound: number
  atk: number
  maxHp: number
  bulwark: number
  alive: boolean
  rooted: boolean
  rank: number
}

export type BattleEvent =
  | { t: 'battleStart'; a: StackSnap[]; b: StackSnap[] }
  | { t: 'passive'; side: Side; text: string }
  | { t: 'attack'; src: string; dst: string; side: Side; dmg: number; absorbed: number; killed: number; retaliation: boolean; snap: StackSnap[] }
  | { t: 'cleave'; src: string; dst: string; dmg: number; killed: number; snap: StackSnap[] }
  | { t: 'venom'; uid: string; units: number; snap: StackSnap[] }
  | { t: 'buff'; uids: string[]; text: string; snap: StackSnap[] }
  | { t: 'heal'; uid: string; amount: number; revived: number; snap: StackSnap[] }
  | { t: 'frenzy'; uid: string; atk: number; snap: StackSnap[] }
  | { t: 'lastStand'; uid: string; snap: StackSnap[] }
  | { t: 'spellCast'; side: Side; name: string; text: string; targets: string[]; snap: StackSnap[] }
  | { t: 'root'; uid: string; exchanges: number; snap: StackSnap[] }
  | { t: 'summon'; snap: StackSnap[]; uid: string }
  | { t: 'death'; uid: string; snap: StackSnap[] }
  | { t: 'battleEnd'; winner: Side | 'tie'; damage: number; exchanges: number }

export interface Survivor {
  uid: string
  unitId: string
  count: number
  tier: number
}

export interface BattleResult {
  winner: Side | 'tie'
  survivorsA: Survivor[]
  survivorsB: Survivor[]
  damageToLoser: number
  /** tie deals half to both; otherwise 0 */
  damageToBoth: number
  events: BattleEvent[]
  exchanges: number
}

// ── runtime stack ──────────────────────────────────────────────────────────

interface RStack {
  uid: string
  side: Side
  def: UnitDef
  slot: number
  row: Row
  atk: number
  maxHp: number
  count: number
  startCount: number
  wound: number
  bulwark: number
  alive: boolean
  charge: boolean
  volley: boolean
  siege: boolean
  cleave: boolean
  lifesteal: boolean
  guard: number
  venom: number
  frenzy: number
  venomPending: number
  frenzied: boolean
  rootedUntil: number
  retaliatedCycle: number
  actions: number
  jitter: number
  rank: number
  // ── Honored (Rank 2) behaviour flags, set from data in buildStack ────────
  /** Piercing Volley: fraction of the raw hit carried to a second stack */
  volleySplash: number
  /** Overcharge: consumed by this stack's first attack of the battle */
  firstShotDouble: boolean
  /** the unit's triggered ability resolves twice */
  abilityEcho: boolean
  /** extra ATK on top of each Frenzy trigger */
  frenzyPlus: number
}

interface Ctx {
  rng: RNG
  events: BattleEvent[]
  stacks: RStack[]
  heroes: Record<Side, HeroState>
  heroDefs: Record<Side, HeroDef>
  lastStandUsed: Record<Side, boolean>
  exchange: number
}

const pool = (s: RStack): number => s.count * s.maxHp - s.wound
const maxPool = (s: RStack): number => s.startCount * s.maxHp

function snap(s: RStack): StackSnap {
  return {
    uid: s.uid,
    side: s.side,
    unitId: s.def.id,
    slot: s.slot,
    count: s.alive ? s.count : 0,
    startCount: s.startCount,
    wound: s.wound,
    atk: s.atk,
    maxHp: s.maxHp,
    bulwark: s.bulwark,
    alive: s.alive,
    rooted: false,
    rank: s.rank,
  }
}

function snaps(...list: RStack[]): StackSnap[] {
  return list.map(snap)
}

function kw(def: UnitDef, k: string): number | undefined {
  const found = def.keywords.find((x) => x.k === k)
  return found ? (found.x ?? 1) : undefined
}

// ── setup ──────────────────────────────────────────────────────────────────

function buildStack(bs: BoardStack, side: Side, hero: HeroState, heroDef: HeroDef, rng: RNG): RStack {
  const def = UNIT_BY_ID.get(bs.unitId)
  if (!def) throw new Error(`unknown unit ${bs.unitId}`)
  const m = hero.mods
  const row: Row = bs.slot < FRONT_SLOTS ? 'front' : 'back'

  // Banner Ranks are data-driven stack modifiers on the same pipeline as
  // keywords (§3.1): they fold into the reads below, never into new branches
  // further down the simulation.
  const rank = bs.rank ?? 0
  const rdef = rankDefOf(bs.unitId)
  const honored = rank >= 2 && rdef ? rdef.honored : null
  const granted = honored && honored.type === 'keyword' ? honored : null
  const extraKw = (k: KeywordId): number => (granted && granted.k === k ? (granted.x ?? 1) : 0)
  const has = (k: KeywordId): boolean => kw(def, k) !== undefined || extraKw(k) > 0

  const volley = has('volley')
  let atk = def.atk + bs.bonusAtk + m.allAtk + (row === 'front' ? m.frontAtk : m.backAtk)
  if (volley) atk += m.volleyAtk
  let hp = def.hp + bs.bonusHp + m.allHp
  if (rank >= 1 && rdef) {
    atk += rdef.veteran.atk ?? 0
    hp += rdef.veteran.hp ?? 0
  }
  if (honored && honored.type === 'statPerUnit') {
    atk += honored.atk ?? 0
    hp += honored.hp ?? 0
  }
  const maxHp = Math.max(1, hp)

  let bulwark = (kw(def, 'bulwark') ?? 0) + extraKw('bulwark')
  if (row === 'front') bulwark += m.frontBulwark
  if (row === 'front' && heroDef.passive.id === 'frontBulwark3') bulwark += heroDef.passive.x ?? 3

  return {
    uid: bs.uid,
    side,
    def,
    slot: bs.slot,
    row,
    atk: Math.max(0, atk),
    maxHp,
    count: bs.count,
    startCount: bs.count,
    wound: 0,
    bulwark,
    alive: bs.count > 0,
    charge: has('charge') || m.chargeAll,
    volley,
    siege: has('siege'),
    cleave: has('cleave') || (m.cleaveFront && row === 'front'),
    lifesteal: has('lifesteal') || m.lifestealAll,
    guard: (kw(def, 'guard') ?? 0) + extraKw('guard'),
    venom: (kw(def, 'venom') ?? 0) + extraKw('venom'),
    frenzy: (kw(def, 'frenzy') ?? 0) + extraKw('frenzy'),
    venomPending: 0,
    frenzied: false,
    rootedUntil: -1,
    retaliatedCycle: -1,
    actions: 0,
    jitter: rng.next(),
    rank,
    volleySplash: honored && honored.type === 'volleySplash' ? honored.frac : 0,
    firstShotDouble: honored ? honored.type === 'firstShotDouble' : false,
    abilityEcho: honored ? honored.type === 'abilityEcho' : false,
    frenzyPlus: honored && honored.type === 'frenzyPlus' ? honored.x : 0,
  }
}

// ── damage ─────────────────────────────────────────────────────────────────

interface DamageOut {
  dealt: number
  absorbed: number
  killed: number
  overkill: number
  died: boolean
}

function applyDamage(ctx: Ctx, target: RStack, raw: number, opts: { siege?: boolean } = {}): DamageOut {
  const out: DamageOut = { dealt: 0, absorbed: 0, killed: 0, overkill: 0, died: false }
  if (!target.alive || raw <= 0) return out

  let dmg = raw
  if (!opts.siege && target.bulwark > 0) {
    // Bulwark is armour carried by every unit in the stack, so it soaks
    // `bulwark × alive count` — the same shape as `atk × alive count`.
    // Without the count term armour is decisive at round 2 and worthless at
    // round 12, which is exactly how the Iron Vanguard used to lose.
    out.absorbed = Math.min(target.bulwark * target.count, dmg)
    dmg -= out.absorbed
    target.bulwark = Math.max(0, target.bulwark - 1)
  }
  if (dmg <= 0) return out

  const before = target.count
  const remaining = pool(target) - dmg
  out.dealt = dmg

  if (remaining <= 0) {
    out.overkill = -remaining
    // Marshal Yseult: the first wipe each battle leaves one unit standing.
    const heroDef = ctx.heroDefs[target.side]
    if (heroDef.passive.id === 'lastStand' && !ctx.lastStandUsed[target.side]) {
      ctx.lastStandUsed[target.side] = true
      target.count = 1
      target.wound = target.maxHp - 1
      out.killed = before - 1
      out.overkill = 0
      ctx.events.push({ t: 'lastStand', uid: target.uid, snap: snaps(target) })
      return out
    }
    target.count = 0
    target.wound = 0
    target.alive = false
    out.killed = before
    out.died = true
    return out
  }

  target.count = Math.ceil(remaining / target.maxHp)
  target.wound = target.count * target.maxHp - remaining
  out.killed = before - target.count
  return out
}

function healStack(ctx: Ctx, target: RStack, amount: number): { healed: number; revived: number } {
  if (!target.alive || amount <= 0) return { healed: 0, revived: 0 }
  const before = target.count
  const cur = pool(target)
  const next = Math.min(maxPool(target), cur + amount)
  target.count = Math.ceil(next / target.maxHp)
  target.wound = target.count * target.maxHp - next
  const res = { healed: next - cur, revived: target.count - before }
  if (res.healed > 0) {
    ctx.events.push({ t: 'heal', uid: target.uid, amount: res.healed, revived: res.revived, snap: snaps(target) })
  }
  return res
}

// ── targeting ──────────────────────────────────────────────────────────────

const aliveOn = (ctx: Ctx, side: Side): RStack[] => ctx.stacks.filter((s) => s.side === side && s.alive)
const enemiesOf = (ctx: Ctx, s: RStack): RStack[] => aliveOn(ctx, s.side === 'a' ? 'b' : 'a')

function chooseTarget(ctx: Ctx, attacker: RStack): RStack | undefined {
  const foes = enemiesOf(ctx, attacker)
  if (foes.length === 0) return undefined

  if (attacker.siege) {
    let best = foes[0]
    for (const f of foes) if (f.bulwark > best.bulwark) best = f
    if (best.bulwark > 0) return best
  }
  if (attacker.volley) return ctx.rng.pick(foes)

  const front = foes.filter((f) => f.row === 'front')
  if (front.length > 0) {
    const column = attacker.slot % FRONT_SLOTS
    const mirrored = front.find((f) => f.slot === column)
    return mirrored ?? ctx.rng.pick(front)
  }
  return ctx.rng.pick(foes)
}

function adjacentAlly(ctx: Ctx, s: RStack): RStack | undefined {
  const sameSide = ctx.stacks.filter((x) => x.side === s.side && x.alive && x.row === s.row && x.uid !== s.uid)
  return sameSide.find((x) => Math.abs(x.slot - s.slot) === 1)
}

function adjacentEnemyOf(ctx: Ctx, target: RStack): RStack | undefined {
  const same = ctx.stacks.filter((x) => x.side === target.side && x.alive && x.row === target.row && x.uid !== target.uid)
  return same.find((x) => Math.abs(x.slot - target.slot) === 1)
}

// ── triggers ───────────────────────────────────────────────────────────────

function onCasualties(ctx: Ctx, s: RStack, killed: number) {
  if (killed <= 0 || !s.alive) return
  if (s.frenzy > 0) {
    const heroDef = ctx.heroDefs[s.side]
    let gain = s.frenzy + ctx.heroes[s.side].mods.frenzyAtk + s.frenzyPlus
    if (!s.frenzied && heroDef.passive.id === 'frenzyPermanentAtk') gain += heroDef.passive.x ?? 1
    s.frenzied = true
    s.atk += gain
    ctx.events.push({ t: 'frenzy', uid: s.uid, atk: gain, snap: snaps(s) })
  }
  fireAbility(ctx, s, 'onCasualty')
}

function onDeath(ctx: Ctx, s: RStack) {
  ctx.events.push({ t: 'death', uid: s.uid, snap: snaps(s) })
  fireAbility(ctx, s, 'onDeath')
}

function fireAbility(ctx: Ctx, s: RStack, trigger: string) {
  const ab = s.def.ability
  if (!ab || ab.trigger !== trigger) return
  // Honored ability echo (§3): the same effect resolves a second time.
  const times = s.abilityEcho ? 2 : 1
  for (let i = 0; i < times; i++) {
    if (trigger !== 'onDeath' && !s.alive) return
    applyAbilityEffect(ctx, s, ab.effect)
  }
}

function applyAbilityEffect(ctx: Ctx, s: RStack, e: AbilityEffect) {
  const allies = aliveOn(ctx, s.side)

  switch (e.type) {
    case 'alliesBulwark': {
      for (const a of allies) a.bulwark += e.x
      ctx.events.push({ t: 'buff', uids: allies.map((a) => a.uid), text: `+${e.x} Bulwark`, snap: snaps(...allies) })
      break
    }
    case 'alliesAtk': {
      for (const a of allies) a.atk += e.x
      ctx.events.push({ t: 'buff', uids: allies.map((a) => a.uid), text: `+${e.x} ATK`, snap: snaps(...allies) })
      break
    }
    case 'selfAtk': {
      s.atk += e.x
      ctx.events.push({ t: 'buff', uids: [s.uid], text: `+${e.x} ATK`, snap: snaps(s) })
      break
    }
    case 'selfBulwark': {
      s.bulwark += e.x
      ctx.events.push({ t: 'buff', uids: [s.uid], text: `+${e.x} Bulwark`, snap: snaps(s) })
      break
    }
    case 'healLowest': {
      const wounded = allies.filter((a) => pool(a) < maxPool(a))
      if (wounded.length === 0) break
      let worst = wounded[0]
      for (const a of wounded) if (pool(a) / maxPool(a) < pool(worst) / maxPool(worst)) worst = a
      healStack(ctx, worst, e.x * s.count)
      break
    }
    case 'damageRandom': {
      const foes = enemiesOf(ctx, s)
      if (foes.length === 0) break
      const t = ctx.rng.pick(foes)
      const res = applyDamage(ctx, t, e.x)
      ctx.events.push({ t: 'attack', src: s.uid, dst: t.uid, side: s.side, dmg: res.dealt, absorbed: res.absorbed, killed: res.killed, retaliation: false, snap: snaps(s, t) })
      if (res.died) onDeath(ctx, t)
      else onCasualties(ctx, t, res.killed)
      break
    }
    case 'extraAttackAlly': {
      const others = allies.filter((a) => a.uid !== s.uid && a.atk > 0)
      if (others.length === 0) break
      performAttack(ctx, ctx.rng.pick(others), true)
      break
    }
    case 'goldNextMuster':
      // Economy abilities are a Muster-phase concern — see economyGold().
      break
    case 'summon': {
      const def = UNIT_BY_ID.get(e.unit)
      if (!def) break
      const used = new Set(ctx.stacks.filter((x) => x.side === s.side && x.alive).map((x) => x.slot))
      const wantFront = def.row !== 'back'
      const range = wantFront ? [0, 1, 2, 3, 4, 5, 6] : [4, 5, 6, 0, 1, 2, 3]
      const slot = range.find((sl) => !used.has(sl))
      if (slot === undefined) break
      const fresh = buildStack(
        { uid: `${s.uid}~sum${ctx.exchange}`, unitId: def.id, count: e.count, slot, bonusAtk: 0, bonusHp: 0, growthTicks: 0, spent: 0, rank: 0 },
        s.side,
        ctx.heroes[s.side],
        ctx.heroDefs[s.side],
        ctx.rng,
      )
      ctx.stacks.push(fresh)
      ctx.events.push({ t: 'summon', uid: fresh.uid, snap: snaps(fresh) })
      break
    }
  }
}

// ── attacking ──────────────────────────────────────────────────────────────

function performAttack(ctx: Ctx, attacker: RStack, isExtra = false, cycle = 0) {
  if (!attacker.alive || attacker.atk <= 0) return
  const target = chooseTarget(ctx, attacker)
  if (!target) return

  let raw = attacker.atk * attacker.count
  // Overcharge (§3): the first shot this stack fires all battle lands double.
  if (attacker.firstShotDouble) {
    attacker.firstShotDouble = false
    raw *= 2
  }
  const res = applyDamage(ctx, target, raw, { siege: attacker.siege })
  ctx.events.push({
    t: 'attack',
    src: attacker.uid,
    dst: target.uid,
    side: attacker.side,
    dmg: res.dealt,
    absorbed: res.absorbed,
    killed: res.killed,
    retaliation: false,
    snap: snaps(attacker, target),
  })

  if (attacker.venom > 0 && target.alive) {
    target.venomPending += attacker.venom
    ctx.events.push({ t: 'venom', uid: target.uid, units: attacker.venom, snap: snaps(target) })
  }
  if (attacker.lifesteal && res.dealt > 0) {
    healStack(ctx, attacker, Math.floor(res.dealt / 2))
  }

  fireAbility(ctx, attacker, 'onAttack')

  const targetDied = res.died
  if (targetDied) onDeath(ctx, target)
  else onCasualties(ctx, target, res.killed)

  // Piercing Volley (§3): the same volley carries into a second stack for a
  // fraction of its raw damage. Like every volley it draws no retaliation, and
  // it reports as an ordinary attack so the replay needs no new event type.
  if (attacker.volleySplash > 0 && attacker.alive) {
    const foes = enemiesOf(ctx, attacker)
    const others = foes.filter((f) => f.uid !== target.uid)
    const pool = others.length > 0 ? others : foes
    const splash = Math.floor(raw * attacker.volleySplash)
    if (pool.length > 0 && splash > 0) {
      const second = ctx.rng.pick(pool)
      const sp = applyDamage(ctx, second, splash, { siege: attacker.siege })
      ctx.events.push({
        t: 'attack',
        src: attacker.uid,
        dst: second.uid,
        side: attacker.side,
        dmg: sp.dealt,
        absorbed: sp.absorbed,
        killed: sp.killed,
        retaliation: false,
        snap: snaps(attacker, second),
      })
      if (sp.died) onDeath(ctx, second)
      else onCasualties(ctx, second, sp.killed)
    }
  }

  // Cleave: overkill spills into a stack adjacent to the one that fell.
  if (attacker.cleave && targetDied && res.overkill > 0) {
    const spill = adjacentEnemyOf(ctx, target)
    if (spill) {
      const c = applyDamage(ctx, spill, res.overkill, { siege: attacker.siege })
      ctx.events.push({ t: 'cleave', src: attacker.uid, dst: spill.uid, dmg: c.dealt, killed: c.killed, snap: snaps(spill) })
      if (c.died) onDeath(ctx, spill)
      else onCasualties(ctx, spill, c.killed)
    }
  }

  // Retaliation — once per cycle, never against Volley, never on extra attacks.
  if (!isExtra && !attacker.volley && target.alive && target.retaliatedCycle !== cycle && target.atk > 0) {
    target.retaliatedCycle = cycle
    const retAtk = target.atk + ctx.heroes[target.side].mods.retaliationAtk
    const back = applyDamage(ctx, attacker, retAtk * target.count, { siege: target.siege })
    ctx.events.push({
      t: 'attack',
      src: target.uid,
      dst: attacker.uid,
      side: target.side,
      dmg: back.dealt,
      absorbed: back.absorbed,
      killed: back.killed,
      retaliation: true,
      snap: snaps(target, attacker),
    })
    if (back.died) onDeath(ctx, attacker)
    else onCasualties(ctx, attacker, back.killed)
  }
}

// ── hero spells ────────────────────────────────────────────────────────────

function spellMagnitude(heroDef: HeroDef, hero: HeroState): number {
  const sp = heroDef.spell
  const m = hero.mods
  const scale = SPELL_POWER_SCALE[sp.id] ?? 1
  const raw = sp.base + sp.perLevel * (hero.level - 1) + (m.spellPower + m.spellPowerPerLevel * hero.level) * scale
  return Math.max(1, Math.round(raw))
}

/**
 * The X a hero's spell would apply right now. Read-only: UI sheets substitute
 * it into the spell's text so the player sees the real number, not a letter.
 */
export function spellPower(heroDef: HeroDef, hero: HeroState): number {
  return spellMagnitude(heroDef, hero)
}

/** How strongly a point of spellPower moves each spell — keeps buffs and nukes on the same currency. */
const SPELL_POWER_SCALE: Record<string, number> = {
  shieldLowest: 0.55,
  rallyAtk: 0.3,
  healMostWounded: 1.5,
  root: 0.2,
  chainLightning: 1.6,
  extraAttack: 0.25,
}

function castSchedule(heroDef: HeroDef, hero: HeroState): number[] {
  const sp = heroDef.spell
  const cadence = Math.max(2, sp.everyN - hero.mods.spellCadenceReduction)
  const extra = hero.mods.spellExtraCasts + (heroDef.passive.id === 'extraCast' ? (heroDef.passive.x ?? 1) : 0)
  const total = 3 + extra
  const out: number[] = []
  let e = sp.atStart ? 0 : cadence
  for (let i = 0; i < total; i++) {
    out.push(e)
    e += cadence
  }
  return out
}

function castSpell(ctx: Ctx, side: Side) {
  const heroDef = ctx.heroDefs[side]
  const hero = ctx.heroes[side]
  const sp = heroDef.spell
  const x = spellMagnitude(heroDef, hero)
  const extraTargets = hero.mods.spellSplash
  const allies = aliveOn(ctx, side)
  const foes = aliveOn(ctx, side === 'a' ? 'b' : 'a')
  if (allies.length === 0) return
  const touched: RStack[] = []
  const targets: string[] = []

  switch (sp.id) {
    case 'shieldLowest': {
      const sorted = allies.slice().sort((p, q) => pool(p) / maxPool(p) - pool(q) / maxPool(q))
      for (const t of sorted.slice(0, 1 + extraTargets)) {
        t.bulwark += x
        touched.push(t)
        targets.push(t.uid)
      }
      break
    }
    case 'rallyAtk': {
      for (const t of allies) {
        t.atk += x
        touched.push(t)
        targets.push(t.uid)
      }
      break
    }
    case 'healMostWounded': {
      const wounded = allies.filter((a) => pool(a) < maxPool(a))
      const sorted = wounded.sort((p, q) => pool(p) / maxPool(p) - pool(q) / maxPool(q))
      for (const t of sorted.slice(0, 1 + extraTargets)) {
        healStack(ctx, t, x)
        touched.push(t)
        targets.push(t.uid)
      }
      break
    }
    case 'root': {
      if (foes.length === 0) break
      const sorted = foes.slice().sort((p, q) => q.atk * q.count - p.atk * p.count)
      for (const t of sorted.slice(0, 1 + extraTargets)) {
        t.rootedUntil = ctx.exchange + x
        touched.push(t)
        targets.push(t.uid)
        ctx.events.push({ t: 'root', uid: t.uid, exchanges: x, snap: snaps(t) })
      }
      break
    }
    case 'chainLightning': {
      if (foes.length === 0) break
      const sorted = foes.slice().sort((p, q) => q.count * q.maxHp - p.count * p.maxHp)
      const hit = sorted.slice(0, 3 + extraTargets)
      const each = Math.max(1, Math.floor(x / hit.length))
      for (const t of hit) {
        const res = applyDamage(ctx, t, each, { siege: true })
        touched.push(t)
        targets.push(t.uid)
        if (res.died) onDeath(ctx, t)
        else onCasualties(ctx, t, res.killed)
      }
      break
    }
    case 'extraAttack': {
      const pickable = allies.filter((a) => a.atk > 0)
      if (pickable.length === 0) break
      for (let i = 0; i < 1 + extraTargets; i++) {
        const t = ctx.rng.pick(pickable)
        targets.push(t.uid)
        for (let k = 0; k < x; k++) performAttack(ctx, t, true)
        touched.push(t)
      }
      break
    }
  }

  ctx.events.push({
    t: 'spellCast',
    side,
    name: sp.name,
    text: sp.text.replace('X', String(x)),
    targets,
    snap: snaps(...touched),
  })
}

// ── main loop ──────────────────────────────────────────────────────────────

export interface SimOptions {
  round: number
}

export function simulateBattle(a: BattleSide, b: BattleSide, heroA: HeroDef, heroB: HeroDef, seed: number, opts: SimOptions): BattleResult {
  const rng = makeRng(seed)
  const ctx: Ctx = {
    rng,
    events: [],
    stacks: [],
    heroes: { a: a.hero, b: b.hero },
    heroDefs: { a: heroA, b: heroB },
    lastStandUsed: { a: false, b: false },
    exchange: 0,
  }

  for (const bs of a.board) if (bs.count > 0) ctx.stacks.push(buildStack(bs, 'a', a.hero, heroA, rng))
  for (const bs of b.board) if (bs.count > 0) ctx.stacks.push(buildStack(bs, 'b', b.hero, heroB, rng))

  ctx.events.push({
    t: 'battleStart',
    a: ctx.stacks.filter((s) => s.side === 'a').map(snap),
    b: ctx.stacks.filter((s) => s.side === 'b').map(snap),
  })

  // Guard auras and Warded Vanguard, then battle-start abilities.
  for (const s of ctx.stacks) {
    if (s.guard > 0) {
      const adj = adjacentAlly(ctx, s)
      if (adj) adj.bulwark += s.guard
    }
  }
  for (const side of ['a', 'b'] as Side[]) {
    const bonus = ctx.heroes[side].mods.firstStrikeBulwark
    if (bonus > 0) {
      const mine = aliveOn(ctx, side)
      if (mine.length > 0) {
        let first = mine[0]
        for (const s of mine) if (s.def.init > first.def.init) first = s
        first.bulwark += bonus
      }
    }
    const heroDef = ctx.heroDefs[side]
    if (heroDef.passive.id === 'frontBulwark3' || heroDef.passive.id === 'lastStand') {
      ctx.events.push({ t: 'passive', side, text: heroDef.passive.text })
    }
  }
  for (const s of ctx.stacks.slice()) fireAbility(ctx, s, 'battleStart')

  const schedules: Record<Side, number[]> = { a: castSchedule(heroA, a.hero), b: castSchedule(heroB, b.hero) }
  const castIdx: Record<Side, number> = { a: 0, b: 0 }

  const fireDueSpells = () => {
    for (const side of ['a', 'b'] as Side[]) {
      while (castIdx[side] < schedules[side].length && schedules[side][castIdx[side]] <= ctx.exchange) {
        castIdx[side]++
        if (aliveOn(ctx, side).length > 0) castSpell(ctx, side)
      }
    }
  }

  fireDueSpells()

  let cycle = 0
  while (
    ctx.exchange < MAX_EXCHANGES &&
    aliveOn(ctx, 'a').length > 0 &&
    aliveOn(ctx, 'b').length > 0
  ) {
    cycle++
    const order = ctx.stacks
      .filter((s) => s.alive)
      .slice()
      .sort((p, q) => {
        const pc = p.charge && cycle === 1 ? 1 : 0
        const qc = q.charge && cycle === 1 ? 1 : 0
        if (pc !== qc) return qc - pc
        if (p.def.init !== q.def.init) return q.def.init - p.def.init
        return p.jitter - q.jitter
      })

    for (const s of order) {
      if (!s.alive) continue
      if (aliveOn(ctx, 'a').length === 0 || aliveOn(ctx, 'b').length === 0) break
      if (ctx.exchange >= MAX_EXCHANGES) break

      if (s.rootedUntil >= ctx.exchange) {
        ctx.exchange++
        fireDueSpells()
        continue
      }

      // Venom resolves as the poisoned stack tries to act.
      if (s.venomPending > 0) {
        // Venom thins a stack but never wipes it — otherwise a 1-count elite
        // simply evaporates to a tier-3 mercenary, which reads as a bug.
        const lost = Math.min(s.count - 1, s.venomPending)
        s.venomPending = 0
        if (lost > 0) {
          const res = applyDamage(ctx, s, lost * s.maxHp - s.wound, { siege: true })
          ctx.events.push({ t: 'venom', uid: s.uid, units: res.killed, snap: snaps(s) })
          onCasualties(ctx, s, res.killed)
        }
      }

      s.actions++
      const ab = s.def.ability
      if (ab && ab.trigger === 'everyExchange' && ab.everyN && s.actions % ab.everyN === 0) {
        fireAbility(ctx, s, 'everyExchange')
      }
      performAttack(ctx, s, false, cycle)

      ctx.exchange++
      fireDueSpells()
    }
  }

  const aAlive = aliveOn(ctx, 'a')
  const bAlive = aliveOn(ctx, 'b')
  const winner: Side | 'tie' = aAlive.length > 0 && bAlive.length === 0 ? 'a' : bAlive.length > 0 && aAlive.length === 0 ? 'b' : 'tie'

  const survivors = (list: RStack[]): Survivor[] => list.map((s) => ({ uid: s.uid, unitId: s.def.id, count: s.count, tier: s.def.tier }))
  const winners = winner === 'a' ? aAlive : winner === 'b' ? bAlive : []
  const tierSum = winners.reduce((n, s) => n + s.def.tier, 0)
  const raw = Math.ceil(opts.round / 2) + tierSum
  const damageToLoser = winner === 'tie' ? 0 : Math.min(15, raw)
  const damageToBoth = winner === 'tie' ? Math.floor(Math.min(15, Math.ceil(opts.round / 2)) / 2) : 0

  ctx.events.push({ t: 'battleEnd', winner, damage: winner === 'tie' ? damageToBoth : damageToLoser, exchanges: ctx.exchange })

  return {
    winner,
    survivorsA: survivors(aAlive),
    survivorsB: survivors(bAlive),
    damageToLoser,
    damageToBoth,
    events: ctx.events,
    exchanges: ctx.exchange,
  }
}

/** Gold earned by battle-start economy units (Mule Cart, Coin Factor, Grovetender). */
export function economyGold(board: BoardStack[], cap = 2): number {
  let g = 0
  for (const bs of board) {
    const def = UNIT_BY_ID.get(bs.unitId)
    const ab = def?.ability
    if (ab && ab.effect.type === 'goldNextMuster') g += ab.effect.x
  }
  return Math.min(cap, g)
}
