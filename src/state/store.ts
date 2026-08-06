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
  choosePlayerTalent,
  autoArrangePlayer,
  newRun,
  player,
  renownFor,
  resolveBattles,
  type RunState,
} from '../engine/run'
import { markRunEnd } from '../net/sync'
import { buildRunReport, emptyTally, submitRun, tallyBattle, type RunTally } from '../net/telemetry'
import { withMeta, type MetaSave } from './meta'
import { DEFAULT_SAVE, loadSave, writeSave, type SaveData } from './persist'

export type Screen = 'home' | 'muster' | 'battle' | 'result' | 'runover'

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
  speed: 1 | 2
  renownEarned: number
  /** §4 counters that are events rather than state, accumulated as the run goes. */
  tally: RunTally

  // lifecycle
  start: (factionId: FactionId, heroId: string, difficulty: Difficulty) => void
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
  speed: 1,
  renownEarned: 0,
  tally: emptyTally(),

  start: (factionId, heroId, difficulty) => {
    resetUid(0)
    const seed = (Math.random() * 0xffffffff) >>> 0
    const run = newRun({ seed, factionId, heroId, difficulty })
    const save = { ...get().save, settings: { ...get().save.settings, difficulty } }
    persist(save, run)
    set({ run, save, screen: 'muster', selected: null, rankFlash: null, playerBattle: null, renownEarned: 0, speed: save.settings.speedDefault, tally: emptyTally() })
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
    // A run saved mid-'result' must come back to the result screen — dropping it
    // on Muster lets Fight resolve the same round twice.
    set({
      run: active,
      screen: active.phase === 'over' ? 'runover' : active.phase === 'result' ? 'result' : 'muster',
      selected: null,
      rankFlash: null,
      playerBattle: null,
    })
  },

  abandon: () => {
    const save = { ...get().save, activeRun: null }
    writeSave(save)
    set({ save, run: null, screen: 'home', playerBattle: null })
  },

  goHome: () => set({ screen: 'home', scouting: false, inspecting: null }),

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

  finishBattle: () => set({ screen: 'result' }),

  nextRound: () => {
    const { run } = get()
    if (!run) return

    const p = player(run)
    if (run.finished || !p.alive) {
      const placement = p.placement ?? 1
      const earned = renownFor(placement)
      const best = get().save.stats.bestPlacementByHero[p.heroId] ?? 99
      const save: SaveData = {
        ...get().save,
        renown: get().save.renown + earned,
        stats: {
          runs: get().save.stats.runs + 1,
          wins: get().save.stats.wins + (placement === 1 ? 1 : 0),
          bestPlacementByHero: { ...get().save.stats.bestPlacementByHero, [p.heroId]: Math.min(best, placement) },
        },
        activeRun: null,
      }
      // §2: mark this as a run-end write before persisting. It is the one kind
      // of write allowed to lower stored renown, so the flag has to be set
      // before writeSave fires the sync listener.
      markRunEnd()
      writeSave(save)
      // §4: one report per finished run, fire-and-forget. Built before the run
      // is cleared, since it reads the final board off it.
      const report = buildRunReport(run, get().tally)
      if (report) void submitRun(report)
      set({ save, screen: 'runover', renownEarned: earned, playerBattle: null })
      return
    }

    advanceRound(run)
    persist(get().save, run)
    set({ run: { ...run }, screen: 'muster', playerBattle: null, selected: null, rankFlash: null })
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
