import { create } from 'zustand'
import { BOON_BY_ID, HERO_BY_ID, unit } from '../data/index'
import type { FactionId } from '../data/types'
import type { BattleResult, BoardStack } from '../engine/battle'
import {
  moveStack,
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
  applyBoon,
  autoArrangePlayer,
  newRun,
  opponentOf,
  player,
  renownFor,
  resolveBattles,
  byId,
  type RunState,
} from '../engine/run'
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
  playerBattle: BattleResult | null
  speed: 1 | 2
  renownEarned: number

  // lifecycle
  start: (factionId: FactionId, heroId: string, difficulty: Difficulty) => void
  resume: () => void
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
  chooseBoon: (boonId: string) => void
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
  playerBattle: null,
  speed: 1,
  renownEarned: 0,

  start: (factionId, heroId, difficulty) => {
    resetUid(0)
    const seed = (Math.random() * 0xffffffff) >>> 0
    const run = newRun({ seed, factionId, heroId, difficulty })
    const save = { ...get().save, settings: { ...get().save.settings, difficulty } }
    persist(save, run)
    set({ run, save, screen: 'muster', selected: null, playerBattle: null, renownEarned: 0, speed: save.settings.speedDefault })
  },

  resume: () => {
    const active = get().save.activeRun
    if (!active) return
    // Stack uids are minted from a counter; restart it past anything saved.
    const highest = active.warlords.flatMap((w) => w.board).reduce((n, s) => Math.max(n, Number(s.uid.replace(/\D/g, '')) || 0), 0)
    resetUid(highest)
    set({
      run: active,
      screen: active.phase === 'over' ? 'runover' : 'muster',
      selected: null,
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
    const res = campRecruit(p.board, p.gold, unitId, p.mods)
    if (!res.ok) return
    p.board = res.board
    p.gold = res.gold
    p.camp = { ...p.camp, offer: p.camp.offer.map((id, i) => (i === index ? null : id)) }
    persist(get().save, run)
    set({ run: { ...run } })
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
    set({ run: { ...run } })
  },

  toggleFreeze: () => {
    const { run } = get()
    if (!run) return
    const p = player(run)
    p.camp = { ...p.camp, frozen: !p.camp.frozen }
    persist(get().save, run)
    set({ run: { ...run } })
  },

  tierUp: () => {
    const { run } = get()
    if (!run) return
    const p = player(run)
    const cost = tierUpCost(p.camp, p.mods)
    if (cost === null || p.gold < cost || p.camp.tier >= MAX_CAMP_TIER) return
    p.gold -= cost
    p.camp = { ...p.camp, tier: p.camp.tier + 1, tierDiscount: 0 }
    p.camp = { ...p.camp, offer: rollOffer(p.factionId, p.camp, p.mods, makeUiRng(run, 900 + p.camp.tier)) }
    persist(get().save, run)
    set({ run: { ...run } })
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
    set({ run: { ...run }, selected: null })
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
    set({ run: { ...run }, selected: null })
  },

  select: (uid) => set({ selected: uid }),

  place: (slot) => {
    const { run, selected } = get()
    if (!run || !selected) return
    const p = player(run)
    p.board = moveStack(p.board, selected, slot)
    persist(get().save, run)
    set({ run: { ...run }, selected: null })
  },

  autoArrange: () => {
    const { run } = get()
    if (!run) return
    autoArrangePlayer(run)
    persist(get().save, run)
    set({ run: { ...run }, selected: null })
  },

  chooseBoon: (boonId) => {
    const { run } = get()
    if (!run) return
    const boon = BOON_BY_ID.get(boonId)
    if (!boon || !run.boonOffer.some((b) => b.id === boonId)) return
    applyBoon(player(run), boon)
    run.boonOffer = []
    run.phase = 'muster'
    persist(get().save, run)
    set({ run: { ...run } })
  },

  setScouting: (v) => set({ scouting: v }),
  inspect: (id) => set({ inspecting: id }),

  fight: () => {
    const { run } = get()
    if (!run) return
    const p = player(run)
    p.board = p.board.filter((s) => s.count > 0)
    const oppId = opponentOf(run, p.id)
    resolveBattles(run)
    const report = run.reports.find((r) => r.aId === p.id || r.bId === p.id)
    void oppId
    persist(get().save, run)
    set({
      run: { ...run },
      playerBattle: report?.result ?? null,
      screen: 'battle',
      selected: null,
      scouting: false,
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
      const hero = HERO_BY_ID.get(p.heroId)
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
      void hero
      writeSave(save)
      set({ save, screen: 'runover', renownEarned: earned, playerBattle: null })
      return
    }

    advanceRound(run)
    persist(get().save, run)
    set({ run: { ...run }, screen: 'muster', playerBattle: null, selected: null })
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

// Convenience selectors used across screens.
export const selectPlayer = (s: Store) => (s.run ? player(s.run) : null)
export const selectOpponent = (s: Store) => {
  if (!s.run) return null
  const id = opponentOf(s.run, s.run.playerId)
  return id ? byId(s.run, id) : null
}
export const stackUnit = (st: BoardStack) => unit(st.unitId)
