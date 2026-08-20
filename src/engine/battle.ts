/**
 * simulateBattle — a PURE, SEEDED function (§12.3 rule 1).
 *
 * No Date.now(), no Math.random(): every random decision goes through the
 * injected RNG. The UI never recomputes combat — it replays `events` (rule 2).
 * Every event that changes the board carries a `snap` of the affected stacks,
 * so the renderer stays a dumb projector of the log.
 */
import { UNIT_BY_ID } from '../data/index'
import type { AbilityEffect, ApexDef, FactionId, HeroDef, HeroMods, KeywordId, Row, UnitDef } from '../data/types'
import { rankDefOf } from './ranks'
import { makeRng, type RNG } from './rng'
import { TALENT_BY_ID } from '../data/talents/index'

export const MAX_EXCHANGES = 200
export const FRONT_SLOTS = 4
export const BACK_SLOTS = 3
export const TOTAL_SLOTS = FRONT_SLOTS + BACK_SLOTS

export type Side = 'a' | 'b'

/**
 * Hero passives that are in force from the first exchange, so the battle screen
 * can pulse them off the caster's plaque before a blow lands (§1.4).
 */
const BATTLE_START_PASSIVES = new Set(['frontBulwark3', 'lastStand', 'extraCast'])

/** How to read a spellCast's `amount` (Design Notes 03 §1.2 / §2.6). */
export type SpellOutcome = 'heal' | 'damage' | 'shield' | 'atk' | 'root' | 'strikes'

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
  /**
   * Permanent Venom earned from Growth (DN11 §2.2). Optional so a save written
   * before DN11 loads clean — absent reads as zero everywhere.
   */
  bonusVenom?: number
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
  /** attack of a single model */
  atk: number
  /** health of a single model */
  maxHp: number
  /**
   * The three numbers a card actually shows, computed here rather than in the
   * UI so the display can never disagree with the simulation (GDD §12.3).
   *
   * A stack is one pool of health, not N independent models — `damage` spends
   * it down and the model count is derived from what is left. `atk` and
   * `maxHp` alone are the per-model stats, which never move during a battle
   * and so could not show a player why a stack was about to break.
   */
  /** what the whole stack swings for: atk x count */
  power: number
  /** health left in the pool: count x maxHp - wound */
  hp: number
  /** the pool it started the battle with */
  hpMax: number
  bulwark: number
  alive: boolean
  rooted: boolean
  rank: number
  /** Cover charges still available this battle (§3.3 pips) */
  cover: number
  /** Apex meter — 0/0 for the forms that have no ultimate (DN04 §3) */
  apexCharge: number
  apexMax: number
}

export type BattleEvent =
  | { t: 'battleStart'; a: StackSnap[]; b: StackSnap[] }
  /** a battle-scoped hero passive announcing itself at battle start (§1.4) */
  | { t: 'passive'; side: Side; name: string; text: string }
  | {
      t: 'attack'
      src: string
      dst: string
      side: Side
      dmg: number
      absorbed: number
      killed: number
      retaliation: boolean
      /** DN12 §4.1: this answer was a Bloodlust counter, not the universal
       *  retaliation every stack makes. The battle screen reads it to put the
       *  red glow on the counter-attacker for the beat it lasts. */
      bloodlust?: boolean
      snap: StackSnap[]
    }
  | { t: 'cleave'; src: string; dst: string; dmg: number; killed: number; snap: StackSnap[] }
  | { t: 'venom'; uid: string; units: number; snap: StackSnap[] }
  | { t: 'cover'; src: string; saved: string; by: string; left: number; snap: StackSnap[] }
  /** Deflect (DN12 §4.6): a blow negated whole. `left` is what remains after. */
  | { t: 'deflect'; uid: string; left: number; snap: StackSnap[] }
  /** Raise (DN12 §4.2): `by` hauls the wiped `uid` back up at 1 unit. */
  | { t: 'raise'; uid: string; by: string; left: number; snap: StackSnap[] }
  /** `src` is the stack that cast it, when a stack cast it (Design Notes 04 §10) */
  | { t: 'buff'; uids: string[]; text: string; src?: string; snap: StackSnap[] }
  | { t: 'heal'; uid: string; amount: number; revived: number; src?: string; snap: StackSnap[] }
  | { t: 'frenzy'; uid: string; atk: number; snap: StackSnap[] }
  | { t: 'lastStand'; uid: string; snap: StackSnap[] }
  | {
      t: 'spellCast'
      side: Side
      name: string
      text: string
      targets: string[]
      /** what the cast actually did, for the banner and the run receipt */
      amount: number
      kind: SpellOutcome
      snap: StackSnap[]
    }
  /** a line-top form unleashing its ultimate (Design Notes 04 §3) */
  | {
      t: 'apex'
      uid: string
      side: Side
      name: string
      text: string
      targets: string[]
      amount: number
      kind: SpellOutcome
      snap: StackSnap[]
    }
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
  /** DN12 §4.1: last cycle this stack fired a Bloodlust counter. Separate from
   *  `retaliatedCycle` so the two answers are capped independently. */
  counteredCycle: number
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
  /** Growth ticks the stack carries in from the run — read by growth-scaled
   *  battle effects (DN11 §2.2), never mutated here. */
  growthTicks: number
  /** DN11: Initiative granted during the battle, on top of the form's own */
  initBonus: number
  /** DN11: >1 means the next attack divides across that many targets, once */
  splitNext: number
  /** Cover charges left this battle (front row only) */
  coverLeft: number
  /** Deflect charges left this battle (DN12 §4.6) — any row, unlike Cover */
  deflectLeft: number
  /** Raises left this battle (DN12 §4.2) */
  raiseLeft: number
  /** the ultimate this stack charges toward, if its form has one (§3) */
  apex: ApexDef | null
  apexCharge: number
}

interface Ctx {
  rng: RNG
  events: BattleEvent[]
  stacks: RStack[]
  heroes: Record<Side, HeroState>
  heroDefs: Record<Side, HeroDef>
  /** Last Stands already spent this battle, per side (Yseult's passive `x`). */
  lastStandUsed: Record<Side, number>
  exchange: number
  /** Frenzy triggers per side this battle — Bloodcall reads it (§3) */
  frenzyCount: Record<Side, number>
  /**
   * The cycle now being resolved (DN12 §4.1). The pre-existing retaliation
   * takes `cycle` as a parameter and keeps doing so — touching that would move
   * every seeded log in the repo. Bloodlust reads this instead, because it has
   * to be gated on extra attacks too, and those call `performAttack` without a
   * cycle argument.
   */
  cycle: number
  /**
   * Re-entrancy depth for counter-attacks (§4.1's loop guard). Non-zero means
   * we are already resolving a counter, and no further counter may fire.
   *
   * A counter deals its damage through `applyDamage`, which cannot re-enter
   * `performAttack` on its own — so the loop this stops is the indirect one: a
   * counter kills the attacker, the attacker's death fires an ability that
   * grants an ally an extra attack, that attack lands on the counter-attacker,
   * and round it goes. A depth counter closes that whatever new path someone
   * adds later, which a per-stack flag would not.
   */
  counterDepth: number
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
    // A dead stack reports zeroes, so the card does not read as a threat
    // during its death beat. The `alive` test mirrors the `count` line above
    // and is belt-and-braces rather than load-bearing: the one place that
    // clears `alive` zeroes count and wound in the same breath, so both
    // expressions are already 0 by then. Deleting it fails no test, and
    // tests/battle.test.ts pins the *outcome* rather than pretending to cover
    // the guard.
    power: s.alive ? s.atk * s.count : 0,
    hp: s.alive ? pool(s) : 0,
    hpMax: maxPool(s),
    bulwark: s.bulwark,
    alive: s.alive,
    rooted: false,
    rank: s.rank,
    cover: s.coverLeft,
    apexCharge: s.apex ? s.apexCharge : 0,
    apexMax: s.apex ? s.apex.charge : 0,
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

/** One named contributor to a stack's ATK/HP (Design Notes 03 §2.1). */
export interface StatPart {
  label: string
  atk: number
  hp: number
}

export interface StatBreakdown {
  atk: number
  hp: number
  /** in the order the player earned them: base, Growth, rank, then boons */
  parts: StatPart[]
}

export const rowOfSlot = (slot: number): Row => (slot < FRONT_SLOTS ? 'front' : 'back')

/**
 * A stack's effective ATK/HP, itemised.
 *
 * The Muster board used to print base + Growth and quietly drop everything a
 * boon had done, so "+2 ATK to back-row units" changed nothing the player could
 * see (§2). This is the one place the sum lives: `buildStack` takes its numbers
 * from here, so the card, the sheet and the simulator can never disagree.
 *
 * `talentsTaken` is only used to *name* the contributions — the totals always
 * come from `m`, and any difference lands in a single unnamed remainder.
 */
export function stackStats(bs: BoardStack, row: Row, m: HeroMods, talentsTaken: readonly string[] = []): StatBreakdown {
  const def = UNIT_BY_ID.get(bs.unitId)
  if (!def) throw new Error(`unknown unit ${bs.unitId}`)
  const rank = bs.rank ?? 0
  const rdef = rankDefOf(bs.unitId)
  const honored = rank >= 2 && rdef ? rdef.honored : null
  const granted = honored && honored.type === 'keyword' ? honored : null
  const volley = kw(def, 'volley') !== undefined || (granted?.k === 'volley' && (granted.x ?? 1) > 0)

  const parts: StatPart[] = [{ label: 'base', atk: def.atk, hp: def.hp }]
  if (bs.bonusAtk !== 0 || bs.bonusHp !== 0) parts.push({ label: 'Growth', atk: bs.bonusAtk, hp: bs.bonusHp })
  if (rank >= 1 && rdef && ((rdef.veteran.atk ?? 0) !== 0 || (rdef.veteran.hp ?? 0) !== 0)) {
    parts.push({ label: 'Veteran', atk: rdef.veteran.atk ?? 0, hp: rdef.veteran.hp ?? 0 })
  }
  if (honored && honored.type === 'statPerUnit' && ((honored.atk ?? 0) !== 0 || (honored.hp ?? 0) !== 0)) {
    parts.push({ label: 'Honored', atk: honored.atk ?? 0, hp: honored.hp ?? 0 })
  }

  // What the talents are worth in total, and who to credit it to.
  const modAtk = m.allAtk + (row === 'front' ? m.frontAtk : m.backAtk) + (volley ? m.volleyAtk : 0)
  const modHp = m.allHp
  let namedAtk = 0
  let namedHp = 0
  for (const id of talentsTaken) {
    const b = TALENT_BY_ID.get(id)
    if (!b) continue
    const a =
      (b.mods.allAtk ?? 0) + (row === 'front' ? (b.mods.frontAtk ?? 0) : (b.mods.backAtk ?? 0)) + (volley ? (b.mods.volleyAtk ?? 0) : 0)
    const h = b.mods.allHp ?? 0
    if (a === 0 && h === 0) continue
    namedAtk += a
    namedHp += h
    parts.push({ label: b.name, atk: a, hp: h })
  }
  if (modAtk - namedAtk !== 0 || modHp - namedHp !== 0) {
    parts.push({ label: 'talents', atk: modAtk - namedAtk, hp: modHp - namedHp })
  }

  const atk = parts.reduce((n, pt) => n + pt.atk, 0)
  const hp = parts.reduce((n, pt) => n + pt.hp, 0)
  return { atk: Math.max(0, atk), hp: Math.max(1, hp), parts }
}

function buildStack(bs: BoardStack, side: Side, hero: HeroState, heroDef: HeroDef, rng: RNG): RStack {
  const def = UNIT_BY_ID.get(bs.unitId)
  if (!def) throw new Error(`unknown unit ${bs.unitId}`)
  const m = hero.mods
  const row: Row = rowOfSlot(bs.slot)

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
  // Stats come from the shared breakdown so the board and the battle agree.
  const stats = stackStats(bs, row, m)
  const atk = stats.atk
  const maxHp = stats.hp

  let bulwark = (kw(def, 'bulwark') ?? 0) + extraKw('bulwark')
  if (row === 'front') bulwark += m.frontBulwark
  if (row === 'front' && heroDef.passive.id === 'frontBulwark3') bulwark += heroDef.passive.x ?? 3

  return {
    uid: bs.uid,
    side,
    def,
    slot: bs.slot,
    row,
    atk,
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
    // Growth-earned Venom rides in with the printed keyword (DN11 §2.2), so
    // every venom read downstream sees one number and needs no new branch.
    venom: (kw(def, 'venom') ?? 0) + extraKw('venom') + (bs.bonusVenom ?? 0),
    frenzy: (kw(def, 'frenzy') ?? 0) + extraKw('frenzy'),
    venomPending: 0,
    frenzied: false,
    rootedUntil: -1,
    retaliatedCycle: -1,
    counteredCycle: -1,
    actions: 0,
    jitter: rng.next(),
    rank,
    volleySplash: honored && honored.type === 'volleySplash' ? honored.frac : 0,
    firstShotDouble: honored ? honored.type === 'firstShotDouble' : false,
    abilityEcho: honored ? honored.type === 'abilityEcho' : false,
    frenzyPlus: honored && honored.type === 'frenzyPlus' ? honored.x : 0,
    growthTicks: bs.growthTicks,
    initBonus: 0,
    splitNext: 0,
    // Apex is the reward for finishing a line: only the top form carries one,
    // and it starts every battle at zero (§3).
    apex: def.apex ?? null,
    apexCharge: 0,
    // Cover is a front-line job: a back-row stack cannot shield anything.
    coverLeft: row === 'front' ? (kw(def, 'cover') ?? 0) + extraKw('cover') + m.frontCover : 0,
    // Deflect is not: it is this stack's own shield, and a back-row stack
    // raising it against the volley that found it is exactly the point.
    deflectLeft: (kw(def, 'deflect') ?? 0) + extraKw('deflect'),
    raiseLeft: (kw(def, 'raise') ?? 0) + extraKw('raise'),
  }
}

// ── damage ─────────────────────────────────────────────────────────────────

interface DamageOut {
  dealt: number
  absorbed: number
  killed: number
  overkill: number
  died: boolean
  /** the blow never landed — a Deflect charge ate it whole (DN12 §4.6) */
  deflected: boolean
}

/**
 * `status` marks damage that is NOT an incoming blow — Venom resolving on the
 * poisoned stack's own action is the only such source today. It exists so
 * Deflect can be opt-OUT rather than opt-in: every present and future way of
 * hitting a stack spends a charge by default, and the one thing that is a
 * lingering condition rather than a hit says so. The other way round, a damage
 * source added later would silently slip past a shield that promises to eat
 * "the first attack", which is the failure nobody would notice.
 */
function applyDamage(ctx: Ctx, target: RStack, raw: number, opts: { siege?: boolean; status?: boolean } = {}): DamageOut {
  const out: DamageOut = { dealt: 0, absorbed: 0, killed: 0, overkill: 0, died: false, deflected: false }
  if (!target.alive || raw <= 0) return out

  // Deflect (DN12 §4.6) resolves FIRST, and it is not Bulwark. Bulwark takes a
  // slice off every blow and wears down by one; this takes one blow entirely
  // and is then gone. Because the attack never lands, it costs no armour
  // either — there is nothing for the Bulwark to have soaked — so the check
  // sits above the block below rather than inside it.
  //
  // Siege does not bypass it. Siege ignores *armour*, and a shield thrown up
  // to eat one hit is not armour; keeping them independent is also what lets
  // the pair be explained in one sentence each.
  if (!opts.status && target.deflectLeft > 0) {
    target.deflectLeft -= 1
    out.deflected = true
    ctx.events.push({ t: 'deflect', uid: target.uid, left: target.deflectLeft, snap: snaps(target) })
    return out
  }

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
    // Yseult's Last Stand is a count, not a flag: it is her only knob, and a
    // passive with no number in it cannot be balanced against five that have one.
    if (heroDef.passive.id === 'lastStand' && ctx.lastStandUsed[target.side] < (heroDef.passive.x ?? 1)) {
      ctx.lastStandUsed[target.side] += 1
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

/**
 * `src` names the stack responsible, so the replay can draw the magic leaving
 * the caster rather than blooming out of nowhere (§10). Hero spells leave it
 * unset — they already beam from the hero's own portrait.
 */
function healStack(ctx: Ctx, target: RStack, amount: number, src?: RStack): { healed: number; revived: number } {
  if (!target.alive || amount <= 0) return { healed: 0, revived: 0 }
  const before = target.count
  const cur = pool(target)
  const next = Math.min(maxPool(target), cur + amount)
  target.count = Math.ceil(next / target.maxHp)
  target.wound = target.count * target.maxHp - next
  const res = { healed: next - cur, revived: target.count - before }
  if (res.healed > 0) {
    ctx.events.push({
      t: 'heal',
      uid: target.uid,
      amount: res.healed,
      revived: res.revived,
      ...(src && src.uid !== target.uid ? { src: src.uid } : {}),
      snap: src && src.uid !== target.uid ? snaps(target, src) : snaps(target),
    })
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
  if (attacker.volley) {
    const picked = ctx.rng.pick(foes)
    // Cover (§2.1): a volley into a covered back-row stack is taken by the
    // front-row unit standing over it. Siege ignores Cover unconditionally —
    // a Siege unit reaches this branch whenever no Bulwark target exists, so
    // the check has to be on the attacker, not on which branch it fell through.
    const guard = attacker.siege ? undefined : interceptorFor(ctx, picked)
    if (guard) {
      guard.coverLeft -= 1
      ctx.events.push({
        t: 'cover',
        src: attacker.uid,
        saved: picked.uid,
        by: guard.uid,
        left: guard.coverLeft,
        snap: snaps(picked, guard),
      })
      return guard
    }
    return picked
  }

  const front = foes.filter((f) => f.row === 'front')
  if (front.length > 0) {
    const column = attacker.slot % FRONT_SLOTS
    const mirrored = front.find((f) => f.slot === column)
    return mirrored ?? ctx.rng.pick(front)
  }
  return ctx.rng.pick(foes)
}

/**
 * Coverage map (Design Notes 02 §2.1). Four front slots sit over three back
 * slots, offset like bricks: back slot `b` stands behind front slots `b` and
 * `b + 1`. Slots are 0-3 front and 4-6 back, so the back index is slot - 4.
 */
export function coveringSlotsFor(backSlot: number): [number, number] {
  const b = backSlot - FRONT_SLOTS
  return [b, b + 1]
}

/**
 * The front-row stack that intercepts a volley aimed at `target`, if any.
 * More remaining charges wins; ties go to the lower slot, so the choice never
 * depends on iteration order and stays deterministic.
 */
function interceptorFor(ctx: Ctx, target: RStack): RStack | undefined {
  if (target.row !== 'front' && target.slot >= FRONT_SLOTS) {
    const [a, b] = coveringSlotsFor(target.slot)
    let best: RStack | undefined
    for (const s of ctx.stacks) {
      if (s.side !== target.side || !s.alive || s.row !== 'front') continue
      if (s.coverLeft <= 0) continue
      if (s.slot !== a && s.slot !== b) continue
      if (!best || s.coverLeft > best.coverLeft || (s.coverLeft === best.coverLeft && s.slot < best.slot)) best = s
    }
    return best
  }
  return undefined
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
  // Apex charges on taking the hit and holding (§3): bleeding for the line is
  // half of how the final form earns its moment.
  gainApex(s)
  if (s.frenzy > 0) {
    const heroDef = ctx.heroDefs[s.side]
    let gain = s.frenzy + ctx.heroes[s.side].mods.frenzyAtk + s.frenzyPlus
    if (!s.frenzied && heroDef.passive.id === 'frenzyPermanentAtk') gain += heroDef.passive.x ?? 1
    s.frenzied = true
    s.atk += gain
    ctx.frenzyCount[s.side] += 1
    ctx.events.push({ t: 'frenzy', uid: s.uid, atk: gain, snap: snaps(s) })
    // The Windspeaker (DN11 §2.3): a friendly Frenzy anywhere in the warband
    // also quickens the stack that bled. Driven by the ability table, not by
    // the unit id — any later unit declaring `allyFrenzy` behaves the same.
    for (const a of aliveOn(ctx, s.side)) {
      const ab = a.def.ability
      if (!ab || ab.trigger !== 'allyFrenzy') continue
      for (let i = 0; i < (a.abilityEcho ? 2 : 1); i++) applyAbilityEffect(ctx, s, ab.effect)
    }
  }
  fireAbility(ctx, s, 'onCasualty')
}

function onDeath(ctx: Ctx, s: RStack) {
  ctx.events.push({ t: 'death', uid: s.uid, snap: snaps(s) })
  fireAbility(ctx, s, 'onDeath')
  // After the stack's own last word, not before it: a Deathcry is the thing it
  // does as it goes, and being hauled back up is what happens to it afterwards.
  tryRaise(ctx, s)
}

/**
 * Raise (DN12 §4.2). A wiped stack is put back on the field at 1 unit by an
 * ally holding a `raise` charge.
 *
 * The pick is deterministic and spends no randomness: lowest slot among the
 * living allies that still have a charge — the same tie-break `interceptorFor`
 * uses, chosen for the same reason. A stack cannot raise itself; it is the one
 * on the floor.
 *
 * Where this sits relative to Marshal Yseult (§3.2) is the whole design. Her
 * Last Stand fires inside `applyDamage` and prevents the wipe, so `onDeath`
 * never runs and no charge is spent. This answers only once a stack is really
 * gone. They stack cleanly and neither shadows the other.
 */
function tryRaise(ctx: Ctx, dead: RStack) {
  if (dead.alive) return
  let by: RStack | undefined
  for (const a of ctx.stacks) {
    if (a.side !== dead.side || !a.alive || a.uid === dead.uid || a.raiseLeft <= 0) continue
    if (!by || a.slot < by.slot) by = a
  }
  if (!by) return

  by.raiseLeft -= 1
  dead.alive = true
  dead.count = 1
  dead.wound = 0
  ctx.events.push({ t: 'raise', uid: dead.uid, by: by.uid, left: by.raiseLeft, snap: snaps(dead, by) })
}

/**
 * `against` names the stack this trigger is a response TO, where the trigger
 * has one — today only `onAttacked`, whose whole point is answering a
 * particular blow. Every other trigger leaves it unset and no other effect
 * reads it.
 */
function fireAbility(ctx: Ctx, s: RStack, trigger: string, against?: RStack) {
  const ab = s.def.ability
  if (!ab || ab.trigger !== trigger) return
  // Honored ability echo (§3): the same effect resolves a second time.
  const times = s.abilityEcho ? 2 : 1
  for (let i = 0; i < times; i++) {
    if (trigger !== 'onDeath' && !s.alive) return
    applyAbilityEffect(ctx, s, ab.effect, against)
  }
}

function applyAbilityEffect(ctx: Ctx, s: RStack, e: AbilityEffect, against?: RStack) {
  const allies = aliveOn(ctx, s.side)

  switch (e.type) {
    case 'alliesBulwark': {
      for (const a of allies) a.bulwark += e.x
      ctx.events.push({ t: 'buff', uids: allies.map((a) => a.uid), text: `+${e.x} Bulwark`, src: s.uid, snap: snaps(...allies) })
      break
    }
    case 'alliesAtk': {
      for (const a of allies) a.atk += e.x
      ctx.events.push({ t: 'buff', uids: allies.map((a) => a.uid), text: `+${e.x} ATK`, src: s.uid, snap: snaps(...allies) })
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
    case 'allyBulwark': {
      // One shield, not the whole board. `randomFront` draws from ctx.rng so it
      // stays seeded like everything else; `lowestBulwark` is the smith looking
      // for whoever needs it most, and ties break on slot rather than on array
      // order so the same board always answers the same way.
      const pool = e.pick === 'randomFront' ? allies.filter((a) => a.row === 'front') : allies
      if (pool.length === 0) break
      let pick: RStack
      if (e.pick === 'randomFront') {
        pick = pool[Math.floor(ctx.rng.next() * pool.length)]
      } else {
        pick = pool[0]
        for (const a of pool) if (a.bulwark < pick.bulwark || (a.bulwark === pick.bulwark && a.slot < pick.slot)) pick = a
      }
      pick.bulwark += e.x
      ctx.events.push({ t: 'buff', uids: [pick.uid], text: `+${e.x} Bulwark`, src: s.uid, snap: snaps(pick) })
      break
    }
    case 'adjacentHpPerGrowth': {
      // Every Muster this stack survived, paid forward to the stacks beside it.
      const ticks = s.growthTicks
      if (ticks <= 0) break
      const gain = e.x * ticks
      const near = allies.filter((a) => a.uid !== s.uid && a.row === s.row && Math.abs(a.slot - s.slot) === 1)
      if (near.length === 0) break
      for (const a of near) {
        a.maxHp += gain
        a.wound = Math.max(0, a.wound - gain)
      }
      ctx.events.push({ t: 'buff', uids: near.map((a) => a.uid), text: `+${gain} HP`, src: s.uid, snap: snaps(...near) })
      break
    }
    case 'splitNextAttack': {
      s.splitNext = e.x
      ctx.events.push({ t: 'buff', uids: [s.uid], text: `Splits ×${e.x}`, snap: snaps(s) })
      break
    }
    case 'grantInit': {
      s.initBonus += e.x
      ctx.events.push({ t: 'buff', uids: [s.uid], text: `+${e.x} Init`, snap: snaps(s) })
      break
    }
    case 'healLowest': {
      const wounded = allies.filter((a) => pool(a) < maxPool(a))
      if (wounded.length === 0) break
      let worst = wounded[0]
      for (const a of wounded) if (pool(a) / maxPool(a) < pool(worst) / maxPool(worst)) worst = a
      healStack(ctx, worst, e.x * s.count, s)
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
    case 'counterAttack': {
      // Bloodlust (DN12 §3.1). Answers the stack that struck, for a fraction
      // of this stack's full swing.
      //
      // Spends NO randomness: the target is the attacker, named by the
      // trigger, so there is no `chooseTarget` and no `rng.pick`. That is what
      // lets every seeded battle in the game without a counter-attacker on the
      // board replay byte-for-byte — the rng stream never moves.
      if (!against || !against.alive || !s.alive || s.atk <= 0) break
      if (ctx.counterDepth > 0) break
      if (s.counteredCycle === ctx.cycle) break
      s.counteredCycle = ctx.cycle

      // floor, not round: every damage number in this engine is an integer,
      // and a half-point drifting into the pool arithmetic is how a stack ends
      // a battle on 0.5 of a unit.
      const raw = Math.floor(s.atk * s.count * e.frac)
      if (raw <= 0) break

      ctx.counterDepth += 1
      try {
        const back = applyDamage(ctx, against, raw, { siege: s.siege })
        ctx.events.push({
          t: 'attack',
          src: s.uid,
          dst: against.uid,
          side: s.side,
          dmg: back.dealt,
          absorbed: back.absorbed,
          killed: back.killed,
          retaliation: true,
          bloodlust: true,
          snap: snaps(s, against),
        })
        if (back.died) onDeath(ctx, against)
        else onCasualties(ctx, against, back.killed)
      } finally {
        // `finally` so a throw anywhere downstream cannot leave the guard
        // latched on and silently disable every counter for the rest of the
        // battle — a failure that would look like a balance change.
        ctx.counterDepth -= 1
      }
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


// ── Apex abilities (Design Notes 04 §3) ────────────────────────────────────

/**
 * One charge, from acting or from surviving casualties. Charging is capped at
 * the requirement so the meter can never read past full, which would make the
 * card lie about how close the moment is.
 */
function gainApex(s: RStack) {
  if (!s.apex || !s.alive) return
  if (s.apexCharge < s.apex.charge) s.apexCharge += 1
}

const apexReady = (s: RStack): boolean => s.apex !== null && s.apexCharge >= s.apex.charge

/** The stack directly behind a front-row target, for Sunlance. */
function behindOf(ctx: Ctx, target: RStack): RStack | undefined {
  if (target.row !== 'front') return undefined
  // coveringSlotsFor(b) = [b, b+1]: back slot b stands behind front b and b+1,
  // so the stack behind front slot f is back slot f or f-1.
  const slots = [target.slot + FRONT_SLOTS, target.slot - 1 + FRONT_SLOTS]
  return ctx.stacks.find((x) => x.side === target.side && x.alive && slots.includes(x.slot))
}

/**
 * Fire the ultimate in place of this stack's attack, then reset the meter.
 * Every branch reports what it actually did, the same way a hero spell does,
 * so the banner and the log never have to guess.
 */
function fireApex(ctx: Ctx, s: RStack, cycle: number) {
  const apex = s.apex
  if (!apex) return
  s.apexCharge = 0
  const foes = enemiesOf(ctx, s)
  const allies = aliveOn(ctx, s.side)
  const touched: RStack[] = [s]
  const targets: string[] = []
  let amount = 0
  let kind: SpellOutcome = 'damage'

  const strike = (t: RStack, raw: number, opts: { siege?: boolean } = {}) => {
    const res = applyDamage(ctx, t, raw, opts)
    amount += res.dealt
    touched.push(t)
    targets.push(t.uid)
    if (res.died) onDeath(ctx, t)
    else onCasualties(ctx, t, res.killed)
    return res
  }

  switch (apex.id) {
    case 'sunburstVerdict': {
      const t = chooseTarget(ctx, s)
      if (t) strike(t, s.atk * s.count * apex.x, { siege: true })
      // The verdict shields the line it fights for.
      const front = allies.filter((a) => a.row === 'front')
      for (const a of front) a.bulwark += 1
      if (front.length > 0) {
        touched.push(...front)
        ctx.events.push({ t: 'buff', uids: front.map((a) => a.uid), text: '+1 Bulwark', src: s.uid, snap: snaps(...front) })
      }
      break
    }
    case 'sunlance': {
      const t = chooseTarget(ctx, s)
      if (t) {
        const raw = s.atk * s.count * (1 + apex.x)
        strike(t, raw)
        const behind = behindOf(ctx, t)
        if (behind) strike(behind, raw)
      }
      break
    }
    case 'rootquake': {
      kind = 'root'
      const front = foes.filter((f) => f.row === 'front')
      for (const f of front) {
        f.rootedUntil = ctx.exchange + apex.x
        targets.push(f.uid)
        touched.push(f)
        ctx.events.push({ t: 'root', uid: f.uid, exchanges: apex.x, snap: snaps(f) })
      }
      amount = apex.x
      healStack(ctx, s, Math.floor(maxPool(s) / 4))
      break
    }
    case 'moonfall': {
      const wounded = foes.slice().sort((p, q) => pool(p) / maxPool(p) - pool(q) / maxPool(q))
      const raw = s.atk * s.count * (1 + apex.x)
      let overflow = 0
      for (const t of wounded.slice(0, 2)) {
        const res = strike(t, raw)
        overflow += res.overkill
      }
      // What the moon takes it gives back: kill overflow heals your worst-off.
      const mine = aliveOn(ctx, s.side)
      const hurt = mine.slice().sort((p, q) => pool(p) / maxPool(p) - pool(q) / maxPool(q))[0]
      if (overflow > 0 && hurt) {
        healStack(ctx, hurt, overflow, s)
        touched.push(hurt)
      }
      break
    }
    case 'bloodcall': {
      kind = 'strikes'
      const gain = ctx.frenzyCount[s.side] * apex.x
      if (gain > 0) {
        s.atk += gain
        ctx.events.push({ t: 'buff', uids: [s.uid], text: `+${gain} ATK`, snap: snaps(s) })
      }
      // The two swings run through the ordinary attack path, so retaliation,
      // Cleave and Frenzy all behave exactly as they do on any other blow.
      for (let i = 0; i < 2; i++) {
        if (!s.alive) break
        performAttack(ctx, s, true, cycle)
        amount += 1
      }
      break
    }
    case 'ninthWave': {
      const biggest = foes.slice().sort((p, q) => q.count - p.count)[0]
      if (biggest) {
        const raw = s.atk * s.count * (1 + apex.x)
        strike(biggest, raw)
        const neighbours = ctx.stacks.filter(
          (x) => x.side === biggest.side && x.alive && x.row === biggest.row && Math.abs(x.slot - biggest.slot) === 1,
        )
        for (const n of neighbours) strike(n, Math.floor(raw / 2))
      }
      break
    }
  }

  ctx.events.push({
    t: 'apex',
    uid: s.uid,
    side: s.side,
    name: apex.name,
    text: apex.text,
    targets,
    amount,
    kind,
    snap: snaps(...touched.filter((t, i, all) => all.indexOf(t) === i)),
  })
}

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
  // Chain lightning (DN11 §2.2): a charged attack DIVIDES across several
  // targets rather than repeating at full strength — the same total damage,
  // spread. Consumed here so it costs exactly one attack.
  const split = attacker.splitNext > 1 ? attacker.splitNext : 1
  if (split > 1) {
    attacker.splitNext = 0
    raw = Math.max(1, Math.floor(raw / split))
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

  // A deflected blow never connected, so it carries no Venom in with it —
  // otherwise the shield stops the sword and the poison on it lands anyway.
  if (attacker.venom > 0 && target.alive && !res.deflected) {
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

  // Bloodlust (DN12 §4.1) — the target answers the blow it just took.
  //
  // Fires here, at one fixed point in program order: after the target's
  // casualties have resolved (so a stack wiped by the blow does not answer it)
  // and BEFORE the universal retaliation below (so the two land in a stable
  // order, attacker's blow → counter → retaliation, every time).
  //
  // Unlike that universal retaliation this is NOT gated on `isExtra` or on the
  // attacker's Volley: answering an archer, and answering an extra swing, are
  // exactly the two things it is for.
  if (target.alive) fireAbility(ctx, target, 'onAttacked', attacker)

  // The other prongs of a split attack, each for the same divided share. Like
  // Piercing Volley below they draw no retaliation and report as ordinary
  // attacks, so the replay needs no new event type.
  if (split > 1 && attacker.alive) {
    const others = enemiesOf(ctx, attacker).filter((f) => f.uid !== target.uid)
    for (const extra of others.slice(0, split - 1)) {
      const r = applyDamage(ctx, extra, raw, { siege: attacker.siege })
      ctx.events.push({
        t: 'attack',
        src: attacker.uid,
        dst: extra.uid,
        side: attacker.side,
        dmg: r.dealt,
        absorbed: r.absorbed,
        killed: r.killed,
        retaliation: false,
        snap: snaps(attacker, extra),
      })
      if (r.died) onDeath(ctx, extra)
      else onCasualties(ctx, extra, r.killed)
    }
  }

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

/**
 * How many times this hero's spell will fire in a battle. Read-only, for the
 * Magic boon preview — the schedule itself stays private to the simulator.
 */
export function spellCasts(heroDef: HeroDef, hero: HeroState): number {
  return castSchedule(heroDef, hero).length
}

/** Exchanges between casts — the other half of what a Magic boon buys. */
export function spellCadence(heroDef: HeroDef, hero: HeroState): number {
  return Math.max(2, heroDef.spell.everyN - hero.mods.spellCadenceReduction)
}

/** How many stacks a cast touches, or null for the spells that hit everyone. */
export function spellTargets(heroDef: HeroDef, hero: HeroState): number | null {
  const id = heroDef.spell.id
  if (id === 'rallyAtk') return null
  return (id === 'chainLightning' ? 3 : 1) + hero.mods.spellSplash
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
  let amount = 0
  let kind: SpellOutcome = 'atk'

  switch (sp.id) {
    case 'shieldLowest': {
      const sorted = allies.slice().sort((p, q) => pool(p) / maxPool(p) - pool(q) / maxPool(q))
      kind = 'shield'
      for (const t of sorted.slice(0, 1 + extraTargets)) {
        t.bulwark += x
        amount += x
        touched.push(t)
        targets.push(t.uid)
      }
      break
    }
    case 'rallyAtk': {
      kind = 'atk'
      amount = x
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
      kind = 'heal'
      for (const t of sorted.slice(0, 1 + extraTargets)) {
        amount += healStack(ctx, t, x).healed
        touched.push(t)
        targets.push(t.uid)
      }
      break
    }
    case 'root': {
      if (foes.length === 0) break
      const sorted = foes.slice().sort((p, q) => q.atk * q.count - p.atk * p.count)
      kind = 'root'
      amount = x
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
      kind = 'damage'
      for (const t of hit) {
        const res = applyDamage(ctx, t, each, { siege: true })
        amount += res.dealt
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
      kind = 'strikes'
      for (let i = 0; i < 1 + extraTargets; i++) {
        const t = ctx.rng.pick(pickable)
        targets.push(t.uid)
        for (let k = 0; k < x; k++) {
          performAttack(ctx, t, true)
          amount += 1
        }
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
    amount,
    kind,
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
    lastStandUsed: { a: 0, b: 0 },
    exchange: 0,
    frenzyCount: { a: 0, b: 0 },
    cycle: 0,
    counterDepth: 0,
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
    // Only the passives that are already true when the horns sound get a pulse
    // (§1.4). The conditional ones — Growth bonuses, first-Frenzy ATK — announce
    // themselves later, on the event that actually triggers them.
    const heroDef = ctx.heroDefs[side]
    if (BATTLE_START_PASSIVES.has(heroDef.passive.id)) {
      ctx.events.push({ t: 'passive', side, name: heroDef.name, text: heroDef.passive.text })
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
    // Mirrored onto the context so effects reached through the ability table
    // can read it — `extraAttackAlly` calls `performAttack` with no cycle
    // argument, and a Bloodlust counter provoked by one of those still has to
    // be capped at once per cycle. The pre-existing retaliation keeps using
    // the parameter, untouched.
    ctx.cycle = cycle
    const order = ctx.stacks
      .filter((s) => s.alive)
      .slice()
      .sort((p, q) => {
        const pc = p.charge && cycle === 1 ? 1 : 0
        const qc = q.charge && cycle === 1 ? 1 : 0
        if (pc !== qc) return qc - pc
        const pi = p.def.init + p.initBonus
        const qi = q.def.init + q.initBonus
        if (pi !== qi) return qi - pi
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
          // `status`: Venom is a condition the stack carries, resolving on its
          // own action — not a blow arriving, so no Deflect charge answers it.
          const res = applyDamage(ctx, s, lost * s.maxHp - s.wound, { siege: true, status: true })
          ctx.events.push({ t: 'venom', uid: s.uid, units: res.killed, snap: snaps(s) })
          onCasualties(ctx, s, res.killed)
        }
      }

      s.actions++
      const ab = s.def.ability
      if (ab && ab.trigger === 'everyExchange' && ab.everyN && s.actions % ab.everyN === 0) {
        fireAbility(ctx, s, 'everyExchange')
      }
      // A full meter spends itself instead of the stack's attack (§3). The
      // charge for acting lands BEFORE the swing so the attack's own snapshot
      // shows the meter filling — otherwise the card jumps from 4/5 straight
      // to the ultimate and the player never sees it come to a boil.
      if (apexReady(s)) {
        fireApex(ctx, s, cycle)
      } else {
        gainApex(s)
        performAttack(ctx, s, false, cycle)
      }

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
