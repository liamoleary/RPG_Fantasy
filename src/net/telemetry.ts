/**
 * Run telemetry (Launch Plan §4).
 *
 * One POST per finished run. This is the difference between "the elves feel
 * weak" and "Verdant is placing 5.4 average across 60 runs and nobody picks the
 * stag line" — and it is how every DN02–04 sim prediction gets checked against
 * real humans rather than against the harness that produced it.
 *
 * Gameplay only, per §4's privacy note: board state, choices and outcomes. No
 * device info, no location, nothing about the player except the display name
 * they typed.
 */
import { BOON_BY_ID } from '../data/index'
import type { BattleResult } from '../engine/battle'
import { player, type RunState } from '../engine/run'
import { BUILD_ID } from '../build'
import { ensureAccount } from './account'
import { api } from './client'

/**
 * The handful of §4 fields that cannot be read off RunState at the end,
 * because they are events rather than state. Accumulated by the store as the
 * run happens; everything else is derived at submit time.
 */
export interface RunTally {
  startedAt: number
  /** Camp tier after each purchase, in order — §4's "camp tier curve". */
  tierCurve: number[]
  promotions: number
  apexFires: number
  damageDealt: number
  damageTaken: number
}

export function emptyTally(): RunTally {
  return { startedAt: Date.now(), tierCurve: [], promotions: 0, apexFires: 0, damageDealt: 0, damageTaken: 0 }
}

/** Fold one finished battle into the running tally. */
export function tallyBattle(tally: RunTally, result: BattleResult | null, playerIsA: boolean): RunTally {
  if (!result) return tally
  let apex = 0
  for (const event of result.events) {
    if (event.t !== 'apex') continue
    // Only count the player's own ultimates, not the opponent's.
    const side = (event as { side?: string }).side
    if (side === undefined || side === (playerIsA ? 'a' : 'b')) apex += 1
  }
  const won = result.winner === (playerIsA ? 'a' : 'b')
  const dealt = won ? result.damageToLoser : result.damageToBoth
  const taken = won ? result.damageToBoth : result.damageToLoser
  return {
    ...tally,
    apexFires: tally.apexFires + apex,
    damageDealt: tally.damageDealt + dealt,
    damageTaken: tally.damageTaken + taken,
  }
}

export interface RunReport {
  buildId: string
  heroId: string
  factionId: string
  difficulty: string
  placement: number | null
  rounds: number
  durationMs: number
  seed: number
  hp: number
  details: Record<string, unknown>
}

/** Everything §4 asks for, assembled at the moment the run ends. */
export function buildRunReport(run: RunState, tally: RunTally, now = Date.now()): RunReport | null {
  try {
    const me = player(run)
    const boonBranches: Record<string, number> = {}
    for (const boonId of me.boonsTaken) {
      const branch = BOON_BY_ID.get(boonId)?.branch ?? 'unknown'
      boonBranches[branch] = (boonBranches[branch] ?? 0) + 1
    }

    return {
      buildId: BUILD_ID,
      heroId: me.heroId,
      factionId: me.factionId,
      difficulty: run.difficulty,
      placement: me.placement,
      rounds: run.round,
      durationMs: Math.max(0, now - tally.startedAt),
      seed: run.seed,
      hp: me.hp,
      details: {
        board: me.board.map((s) => ({ unitId: s.unitId, count: s.count, slot: s.slot, rank: s.rank ?? 0 })),
        boonsTaken: [...me.boonsTaken],
        boonBranches,
        campTier: me.camp.tier,
        tierCurve: [...tally.tierCurve],
        promotions: tally.promotions,
        ranksEarned: me.board.reduce((n, s) => n + (s.rank ?? 0), 0),
        apexFires: tally.apexFires,
        damageDealt: tally.damageDealt,
        damageTaken: tally.damageTaken,
        wins: me.wins,
        losses: me.losses,
        // §4: the lobby's rival archetypes, so a placement can be read against
        // the company it was earned in.
        rivals: run.warlords
          .filter((w) => !w.isPlayer)
          .map((w) => ({ heroId: w.heroId, factionId: w.factionId, archetype: w.archetype, placement: w.placement })),
      },
    }
  } catch {
    return null
  }
}

/** Fire-and-forget, like everything else in net/. A lost report is a lost row,
 *  never a stalled run-over screen. */
export async function submitRun(report: RunReport): Promise<boolean> {
  const account = await ensureAccount()
  if (!account) return false
  const res = await api<{ ok: true }>('POST', '/api/runs', { token: account.token, body: report })
  return res.ok
}
