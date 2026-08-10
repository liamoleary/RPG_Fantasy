import { create } from 'zustand'
import type { FactionId } from '../data/types'
import type { BattleResult } from '../engine/battle'
import {
  moveStack,
  offerSlots,
  promote as campPromote,
  recruit as campRecruit,
  sell as campSell,
  rerollCost,
  resetUid,
  rollOffer,
  tierUpCost,
  MAX_CAMP_TIER,
} from '../engine/camp'
import type { Difficulty } from '../engine/rivals'
import { hashSeed, makeRng } from '../engine/rng'
import {
  advanceRound,
  canMarchOn,
  choosePlayerTalent,
  autoArrangePlayer,
  marchOn as engineMarchOn,
  newRun,
  player,
  renownFor,
  resolveBattles,
  type InterludeGrants,
  type RunState,
  type Warlord,
} from '../engine/run'
import { markRunEnd } from '../net/sync'
import { buildRunReport, emptyTally, submitRun, tallyBattle, type RunTally } from '../net/telemetry'
import { withMeta, type MetaSave } from './meta'
import { clampTier, renownMultiplier } from '../data/tiers'
import { DEFAULT_SAVE, loadSave, writeSave, type SaveData } from './persist'

export type Screen = 'home' | 'muster' | 'battle' | 'runover'

/**
 * What the battle ended in, held just long enough to stamp it over the final
 * board. The old flow parked this on a whole screen between every fight and
 * the next muster; a round is 40 seconds and a page you always dismiss is a
 * page in the way. The numbers are read off the report at the moment the
 * replay ends, so the flash does not depend on run state that advanceRound is
 * about to move on.
 */
export interface Outcome {
  verdict: 'win' | 'loss' | 'tie'
  /** banner damage taken this round; 0 on a win */
  damage: number
  /** units left standing on your board */
  survivors: number
  /** your banner HP after the round */
  hp: number
  round: number
}

interface Store {
  save: SaveData
  run: RunState | null
  screen: Screen
  /** uid of the stack the player has picked up for repositioning */
  selected: string | null
  scouting: boolean
  inspecting: string | null
  /** uid of a stack that just gained a Banner Rank — one stamp, then cleared */
  rankFlash: string | null
  playerBattle: BattleResult | null
  /** set when a replay ends, cleared when the round advances (DN08) */
  outcome: Outcome | null
  speed: 1 | 2
  renownEarned: number
  /** the grants a just-marched campaign received, until the screen is dismissed */
  interlude: InterludeGrants | null
  /** §4 counters that are events rather than state, accumulated as the run goes. */
  tally: RunTally

  // lifecycle
  start: (factionId: FactionId, heroId: string, difficulty: Difficulty) => void
  /** DN10 §2: carry the warband into the next tier. */
  marchOn: () => void
  /** DN10 §2: end the campaign here, banked at the tier reached. */
  claimVictory: () => void
  /** shared by the fork and an ordinary lobby end; `claimed` stops the climb */
  endLobby: (claimed: boolean) => void
  resume: () => void
  /** Adopt meta-progression pulled from the server (§2). Local-only fields —
   *  the active run and settings — are untouched. */
  applyMeta: (meta: MetaSave) => void
  abandon: () => void
  goHome: () => void

  // muster
  buy: (index: number) => void
  reroll: () => void
  toggleFreeze: () => void
  tierUp: () => void
  promote: (uid: string) => void
  sell: (uid: string) => void
  select: (uid: string | null) => void
  place: (slot: number) => void
  autoArrange: () => void
  chooseTalent: (nodeId: string) => void
  setScouting: (v: boolean) => void
  inspect: (id: string | null) => void

  // battle
  fight: () => void
  finishBattle: () => void
  nextRound: () => void
  setSpeed: (s: 1 | 2) => void
  setDifficulty: (d: Difficulty) => void
  setReducedMotion: (v: boolean) => void
}

const persist = (save: SaveData, run: RunState | null) => {
  writeSave({ ...save, activeRun: run })
}

export const useGame = create<Store>((set, get) => ({
  save: typeof localStorage === 'undefined' ? { ...DEFAULT_SAVE } : loadSave(),
  run: null,
  screen: 'home',
  selected: null,
  scouting: false,
  inspecting: null,
  rankFlash: null,
  playerBattle: null,
  outcome: null,
  speed: 1,
  renownEarned: 0,
  interlude: null,
  tally: emptyTally(),

  start: (factionId, heroId, difficulty) => {
    resetUid(0)
    const seed = (Math.random() * 0xffffffff) >>> 0
    // DN10 §2: every campaign begins at Tier 1. Deliberately, and not as a
    // limitation — Tier 1 is the draft arc, it is where a campaign's identity
    // gets forged, and the veteran shortcut is explicitly deferred until
    // telemetry shows replay fatigue actually exists.
    const run = newRun({ seed, factionId, heroId, difficulty })
    const save = { ...get().save, settings: { ...get().save.settings, difficulty } }
    persist(save, run)
    set({ run, save, screen: 'muster', selected: null, rankFlash: null, playerBattle: null, outcome: null, renownEarned: 0, interlude: null, speed: save.settings.speedDefault, tally: emptyTally() })
  },

  applyMeta: (meta) => {
    const save = withMeta(get().save, meta)
    writeSave({ ...save, activeRun: get().run ?? save.activeRun ?? null })
    set({ save })
  },

  resume: () => {
    const active = get().save.activeRun
    if (!active) return
    // Stack uids are minted from a counter; restart it past anything saved.
    const highest = active.warlords.flatMap((w) => w.board).reduce((n, s) => Math.max(n, Number(s.uid.replace(/\D/g, '')) || 0), 0)
    resetUid(highest)
    // A run saved before Banner Ranks shipped has no `rank` on its stacks;
    // normalise once here so no engine read has to guess (§3).
    const boards = [...active.warlords.map((w) => w.board), ...Object.values(active.ghostBoards)]
    for (const board of boards) for (const s of board) if (typeof s.rank !== 'number') s.rank = 0
    set({
      run: active,
      screen: active.phase === 'over' ? 'runover' : 'muster',
      selected: null,
      rankFlash: null,
      playerBattle: null,
      outcome: null,
    })
    // A run saved in the engine's 'result' phase has resolved its battle but
    // not advanced the round. Dropping it straight on Muster lets Fight resolve
    // the same round twice, so finish the round here. There used to be a screen
    // to come back to; there is only a two-second flash now, and replaying it a
    // day later would be noise rather than news.
    if (active.phase === 'result') get().nextRound()
  },

  abandon: () => {
    const save = { ...get().save, activeRun: null }
    writeSave(save)
    set({ save, run: null, screen: 'home', playerBattle: null, outcome: null })
  },

  goHome: () => set({ screen: 'home', scouting: false, inspecting: null, outcome: null }),

  buy: (index) => {
    const { run } = get()
    if (!run) return
    const p = player(run)
    const unitId = p.camp.offer[index]
    if (!unitId) return
    const before = new Map(p.board.map((s) => [s.uid, s.rank]))
    const res = campRecruit(p.board, p.gold, unitId, p.mods)
    if (!res.ok) return
    // The engine decides the rank; the UI only notices that one went up, so the
    // card can stamp its new chevron (§3.3).
    const promoted = res.board.find((s) => s.rank > (before.get(s.uid) ?? 0))
    p.board = res.board
    p.gold = res.gold
    p.camp = { ...p.camp, offer: p.camp.offer.map((id, i) => (i === index ? null : id)) }
    persist(get().save, run)
    set({ run: { ...run }, rankFlash: promoted?.uid ?? null })
  },

  reroll: () => {
    const { run } = get()
    if (!run) return
    const p = player(run)
    const cost = rerollCost(p.camp, p.mods)
    if (p.gold < cost) return
    p.gold -= cost
    p.camp = {
      ...p.camp,
      offer: rollOffer(p.factionId, p.camp, p.mods, makeUiRng(run, p.camp.rerollsUsedThisRound)),
      rerollsUsedThisRound: p.camp.rerollsUsedThisRound + 1,
      frozen: false,
    }
    persist(get().save, run)
    set({ run: { ...run }, rankFlash: null })
  },

  toggleFreeze: () => {
    const { run } = get()
    if (!run) return
    const p = player(run)
    p.camp = { ...p.camp, frozen: !p.camp.frozen }
    persist(get().save, run)
    set({ run: { ...run }, rankFlash: null })
  },

  tierUp: () => {
    const { run } = get()
    if (!run) return
    const p = player(run)
    const cost = tierUpCost(p.camp, p.mods)
    if (cost === null || p.gold < cost || p.camp.tier >= MAX_CAMP_TIER) return
    p.gold -= cost
    const tier = p.camp.tier + 1
    p.camp = { ...p.camp, tier, tierDiscount: 0 }
    // Battlegrounds convention (§15): a tier-up keeps the offer on the board and
    // only fills the slot(s) it just unlocked — it is not a free reroll.
    const added = offerSlots(p.camp, p.mods) - p.camp.offer.length
    if (added > 0) {
      const rolled = rollOffer(p.factionId, p.camp, p.mods, makeUiRng(run, 900 + tier))
      p.camp = { ...p.camp, offer: [...p.camp.offer, ...rolled.slice(0, added)] }
    }
    persist(get().save, run)
    // §4: the camp tier curve is a sequence of decisions, not a final number.
    set({ run: { ...run }, rankFlash: null, tally: { ...get().tally, tierCurve: [...get().tally.tierCurve, tier] } })
  },

  promote: (uid) => {
    const { run } = get()
    if (!run) return
    const p = player(run)
    const res = campPromote(p.board, p.gold, uid, p.camp, p.mods)
    if (!res.ok) return
    p.board = res.board
    p.gold = res.gold
    persist(get().save, run)
    set({ run: { ...run }, selected: null, rankFlash: null, tally: { ...get().tally, promotions: get().tally.promotions + 1 } })
  },

  sell: (uid) => {
    const { run } = get()
    if (!run) return
    const p = player(run)
    const res = campSell(p.board, p.gold, uid, p.mods)
    if (!res.ok) return
    p.board = res.board
    p.gold = res.gold
    persist(get().save, run)
    set({ run: { ...run }, selected: null, rankFlash: null })
  },

  select: (uid) => set({ selected: uid }),

  place: (slot) => {
    const { run, selected } = get()
    if (!run || !selected) return
    const p = player(run)
    p.board = moveStack(p.board, selected, slot)
    persist(get().save, run)
    set({ run: { ...run }, selected: null, rankFlash: null })
  },

  autoArrange: () => {
    const { run } = get()
    if (!run) return
    autoArrangePlayer(run)
    persist(get().save, run)
    set({ run: { ...run }, selected: null, rankFlash: null })
  },

  chooseTalent: (nodeId) => {
    const { run } = get()
    if (!run) return
    choosePlayerTalent(run, nodeId)
    persist(get().save, run)
    set({ run: { ...run } })
  },

  setScouting: (v) => set({ scouting: v }),
  inspect: (id) => set({ inspecting: id }),

  fight: () => {
    const { run } = get()
    if (!run) return
    // Only a fresh Muster may start a battle; resolving twice would double the
    // damage across the whole lobby. (chooseBoon returns 'levelup' to 'muster'.)
    if (run.phase !== 'muster') return
    const p = player(run)
    p.board = p.board.filter((s) => s.count > 0)
    resolveBattles(run)
    const report = run.reports.find((r) => r.aId === p.id || r.bId === p.id)
    // Only the player's replay needs its event log; the other three pairings
    // would otherwise dump their whole battle into localStorage every round.
    for (const r of run.reports) {
      if (r.aId !== p.id && r.bId !== p.id) r.result.events = []
    }
    persist(get().save, run)
    set({
      run: { ...run },
      tally: tallyBattle(get().tally, report?.result ?? null, report?.aId === p.id),
      playerBattle: report?.result ?? null,
      screen: 'battle',
      selected: null,
      scouting: false,
      rankFlash: null,
    })
  },

  /**
   * The replay is over. Work out what happened and hand it to the flash; the
   * battle screen stays mounted underneath, so the verdict is stamped over the
   * board that produced it rather than over a fresh page. Advancing is the
   * flash's job (it does it on a timer, or on a tap).
   */
  finishBattle: () => {
    const { run } = get()
    if (!run) return
    const p = player(run)
    const report = run.reports.find((r) => r.aId === p.id || r.bId === p.id)
    const playerIsA = report ? report.aId === p.id : true
    const won = report ? (playerIsA ? report.winner === 'a' : report.winner === 'b') : false
    const tie = report?.winner === 'tie'
    const survivors = report
      ? (playerIsA ? report.result.survivorsA : report.result.survivorsB).reduce((n, s) => n + s.count, 0)
      : 0
    set({
      outcome: {
        verdict: tie ? 'tie' : won ? 'win' : 'loss',
        damage: tie ? (report?.result.damageToBoth ?? 0) : won ? 0 : (report?.damage ?? 0),
        survivors,
        hp: Math.max(0, p.hp),
        round: run.round,
      },
    })
  },

  /**
   * A lobby has ended. Under DN10 that is not automatically the end of the
   * campaign: a winner with rungs left is offered the fork instead, and the
   * run stays live so "March On" can be answered tomorrow (§4).
   *
   * Renown is banked per lobby, at that lobby's multiplier — §2's "per tier
   * climbed, win or lose". A campaign that reaches Tier 4 has therefore been
   * paid four times at rising rates, which is what makes altitude worth the
   * risk of losing the warband that got you there.
   */
  endLobby: (claimed: boolean) => {
    const { run } = get()
    if (!run) return
    const p = player(run)
    const placement = p.placement ?? 1
    const won = placement === 1
    const tier = clampTier(run.tier)
    // The campaign continues only if the player won and chose not to claim.
    const marching = won && canMarchOn(run) && !claimed
    const earned = Math.floor(renownFor(placement) * renownMultiplier(tier))
    const best = get().save.stats.bestPlacementByHero[p.heroId] ?? 99
    const prev = get().save.tiers
    const key = String(tier)
    const rec = prev.records[key] ?? { reached: 0, fallen: 0 }
    const save: SaveData = {
      ...get().save,
      renown: get().save.renown + earned,
      stats: {
        // A campaign is the unit now, so these only move when one ends.
        runs: get().save.stats.runs + (marching ? 0 : 1),
        wins: get().save.stats.wins + (!marching && won ? 1 : 0),
        bestPlacementByHero: { ...get().save.stats.bestPlacementByHero, [p.heroId]: Math.min(best, placement) },
      },
      tiers: {
        // Winning at a tier opens the next one. Losing never demotes (§4),
        // so every field here only ever moves up.
        highestUnlocked: won ? Math.max(prev.highestUnlocked, clampTier(tier + 1)) : prev.highestUnlocked,
        highestWon: won ? Math.max(prev.highestWon, tier) : prev.highestWon,
        // `reached` is booked on arrival, not here; this is where a campaign
        // *ends*, so only the ending is recorded.
        records: marching ? { ...prev.records } : { ...prev.records, [key]: { ...rec, fallen: rec.fallen + 1 } },
        bestByHero: won
          ? { ...prev.bestByHero, [p.heroId]: Math.max(prev.bestByHero[p.heroId] ?? 0, tier) }
          : { ...prev.bestByHero },
      },
      // A campaign paused at the fork is still an active run: §4 wants the
      // Interlude to be a place you can stop for the night.
      activeRun: marching ? run : null,
    }
    if (!marching) {
      // §2: mark this as a run-end write before persisting. It is the one kind
      // of write allowed to lower stored renown, so the flag has to be set
      // before writeSave fires the sync listener.
      markRunEnd()
    }
    writeSave(save)
    // §4: one report per finished lobby, fire-and-forget. Built before the run
    // is cleared, since it reads the final board off it.
    const report = buildRunReport(run, get().tally)
    if (report) void submitRun(report)
    set({ save, screen: 'runover', renownEarned: earned, playerBattle: null, outcome: null })
  },

  marchOn: () => {
    const { run } = get()
    if (!run || !canMarchOn(run)) return
    const { run: next, grants } = engineMarchOn(run)
    // Uids are minted from a counter shared with the carried board; keep it
    // past anything that marched, or a new recruit collides with a veteran.
    const highest = next.warlords
      .flatMap((w: Warlord) => w.board)
      .reduce((n: number, st) => Math.max(n, Number(st.uid.replace(/\D/g, '')) || 0), 0)
    resetUid(highest)
    const prev = get().save.tiers
    const key = String(next.tier)
    const rec = prev.records[key] ?? { reached: 0, fallen: 0 }
    const save: SaveData = {
      ...get().save,
      tiers: { ...prev, records: { ...prev.records, [key]: { ...rec, reached: rec.reached + 1 } } },
      // Kept in step with what is written to storage. `endLobby` parked the
      // *finished* lobby here so the fork could survive a close; leaving it
      // there would offer yesterday's fork on Home while a new lobby is live.
      activeRun: next,
    }
    persist(save, next)
    set({
      save,
      run: next,
      screen: 'muster',
      interlude: grants,
      selected: null,
      rankFlash: null,
      playerBattle: null,
      outcome: null,
      tally: emptyTally(),
    })
  },

  claimVictory: () => get().endLobby(true),

  nextRound: () => {
    const { run } = get()
    if (!run) return

    const p = player(run)
    if (run.finished || !p.alive) {
      get().endLobby(false)
      return
    }

    advanceRound(run)
    persist(get().save, run)
    set({ run: { ...run }, screen: 'muster', playerBattle: null, outcome: null, selected: null, rankFlash: null })
  },

  setSpeed: (s) => {
    const save = { ...get().save, settings: { ...get().save.settings, speedDefault: s } }
    writeSave({ ...save, activeRun: get().run })
    set({ speed: s, save })
  },

  setDifficulty: (d) => {
    const save = { ...get().save, settings: { ...get().save.settings, difficulty: d } }
    writeSave({ ...save, activeRun: get().run })
    set({ save })
  },

  setReducedMotion: (v) => {
    const save = { ...get().save, settings: { ...get().save.settings, reducedMotion: v } }
    writeSave({ ...save, activeRun: get().run })
    set({ save })
  },
}))

/**
 * UI-initiated rolls (rerolls, tier-up refreshes) still flow through the
 * seeded generator, keyed on the run seed plus a call-site salt.
 */
function makeUiRng(run: RunState, salt: number) {
  return makeRng(hashSeed(`${run.seed}|ui|${run.round}|${salt}`))
}
