/**
 * The silent half of the feedback widget (Launch Plan §3).
 *
 * A tester writes "my cleric did nothing???". On its own that is unactionable.
 * Attached to a snapshot showing she was rooted by Bramble Coil the whole fight,
 * it is a bug report. Everything here is captured without the player doing
 * anything, and none of it is personal — it is board state and dice.
 */
import { BUILD_ID } from '../build'
import type { BattleEvent, BattleResult, BoardStack } from '../engine/battle'
import { player, type RunState } from '../engine/run'

/** §3: "the last 50 battle-log events" — only attached for a Bug report. */
const BUG_LOG_EVENTS = 50

export interface FeedbackContext {
  buildId: string
  accountId: string | null
  displayName: string | null
  phase: string | null
  round: number | null
  heroId: string | null
  factionId: string | null
  difficulty: string | null
  boonsTaken: string[]
  board: { unitId: string; count: number; slot: number; rank: number }[]
  gold: number | null
  hp: number | null
  placement: number | null
  seed: number | null
  screen: string
  /** Present only when the category includes Bug. */
  battleLog?: string[]
}

function boardOf(board: BoardStack[]) {
  return board.map((s) => ({ unitId: s.unitId, count: s.count, slot: s.slot, rank: s.rank ?? 0 }))
}

/**
 * Squeeze an event down to one short line.
 *
 * "Compressed" in the §3 sense: the bulk of a BattleEvent is its `snap` — a full
 * copy of every affected stack, which the UI needs to replay the battle and a
 * bug report does not. Dropping the snapshots and keeping the scalars takes a
 * 50-event tail from tens of kilobytes to a few hundred bytes, and unlike a
 * gzipped blob it stays readable in the admin export and queryable in jsonb.
 */
export function compactEvent(event: BattleEvent): string {
  const parts: string[] = [event.t]
  for (const [key, value] of Object.entries(event as Record<string, unknown>)) {
    if (key === 't') continue
    // Snapshots and stack arrays are the payload we are deliberately shedding.
    if (Array.isArray(value) || (typeof value === 'object' && value !== null)) continue
    if (value === undefined || value === null || value === false) continue
    parts.push(value === true ? key : `${key}=${String(value).slice(0, 40)}`)
  }
  return parts.join(' ')
}

export function compactLog(result: BattleResult | null, limit = BUG_LOG_EVENTS): string[] {
  if (!result?.events?.length) return []
  return result.events.slice(-limit).map(compactEvent)
}

/**
 * Build the snapshot. Tolerates a null run (feedback from the Home screen) and
 * never throws — a widget that crashes while reporting a crash is worse than no
 * widget.
 */
export function buildContext(input: {
  run: RunState | null
  screen: string
  playerBattle: BattleResult | null
  account: { accountId: string; displayName: string } | null
  includeBattleLog: boolean
}): FeedbackContext {
  const base: FeedbackContext = {
    buildId: BUILD_ID,
    accountId: input.account?.accountId ?? null,
    displayName: input.account?.displayName ?? null,
    phase: null,
    round: null,
    heroId: null,
    factionId: null,
    difficulty: null,
    boonsTaken: [],
    board: [],
    gold: null,
    hp: null,
    placement: null,
    seed: null,
    screen: input.screen,
  }

  try {
    if (input.run) {
      const me = player(input.run)
      base.phase = input.run.phase
      base.round = input.run.round
      base.heroId = me.heroId
      base.factionId = me.factionId
      base.difficulty = input.run.difficulty
      base.boonsTaken = [...me.boonsTaken]
      base.board = boardOf(me.board)
      base.gold = me.gold
      base.hp = me.hp
      base.placement = me.placement
      base.seed = input.run.seed
    }
    if (input.includeBattleLog) {
      const log = compactLog(input.playerBattle)
      if (log.length > 0) base.battleLog = log
    }
  } catch {
    // A partially built context is still worth sending.
  }
  return base
}
