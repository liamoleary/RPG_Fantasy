import { beforeEach, describe, expect, it } from 'vitest'
import { useGame } from '../src/state/store'
import { newRun, player, resolveBattles } from '../src/engine/run'

/**
 * Design Notes 08: the round ends in a flash over the board, not on a page.
 *
 * Two rules are worth holding onto here, because breaking either is silent.
 * The first is that the flash's numbers come off the report at the moment the
 * replay ends — advanceRound is about to move the run on, so anything read
 * later would describe the wrong round. The second is what the deleted screen
 * was quietly doing for us: it was the only thing standing between a resumed
 * mid-result run and a second resolution of the same battle.
 */

// The store persists through localStorage, which the node environment lacks.
// A two-line shim is enough: nothing here asserts on what was written.
const store: Record<string, string> = {}
;(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => void (store[k] = v),
  removeItem: (k: string) => void delete store[k],
}

const freshRun = () => newRun({ seed: 4242, factionId: 'vanguard', heroId: 'h_berrik', difficulty: 'standard' })

describe('the outcome flash', () => {
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k]
    useGame.setState({ run: null, screen: 'home', outcome: null, playerBattle: null })
  })

  it('reads its figures off the report, before the round advances', () => {
    const run = freshRun()
    resolveBattles(run)
    useGame.setState({ run, screen: 'battle' })

    useGame.getState().finishBattle()
    const outcome = useGame.getState().outcome
    expect(outcome, 'a resolved battle must produce an outcome').not.toBeNull()

    const p = player(run)
    const report = run.reports.find((r) => r.aId === p.id || r.bId === p.id)!
    const playerIsA = report.aId === p.id
    const won = playerIsA ? report.winner === 'a' : report.winner === 'b'
    const expected = report.winner === 'tie' ? 'tie' : won ? 'win' : 'loss'

    expect(outcome!.verdict).toBe(expected)
    expect(outcome!.round).toBe(run.round)
    expect(outcome!.hp).toBe(Math.max(0, p.hp))
    expect(outcome!.survivors).toBe(
      (playerIsA ? report.result.survivorsA : report.result.survivorsB).reduce((n, s) => n + s.count, 0),
    )
    // A win costs nothing; a loss costs what the report says.
    expect(outcome!.damage).toBe(won ? 0 : report.winner === 'tie' ? report.result.damageToBoth : report.damage)
  })

  it('leaves the screen on the battle, so the verdict lands over the board', () => {
    const run = freshRun()
    resolveBattles(run)
    useGame.setState({ run, screen: 'battle' })
    useGame.getState().finishBattle()
    expect(useGame.getState().screen).toBe('battle')
  })

  it('clears itself when the round advances', () => {
    const run = freshRun()
    resolveBattles(run)
    useGame.setState({ run, screen: 'battle' })
    useGame.getState().finishBattle()
    expect(useGame.getState().outcome).not.toBeNull()

    useGame.getState().nextRound()
    expect(useGame.getState().outcome).toBeNull()
    expect(useGame.getState().screen).toBe('muster')
  })

  /**
   * The regression the old result screen was hiding. A run saved after its
   * battle resolved but before the round advanced sits in phase 'result'. It
   * used to resume onto that screen, whose only button advanced the round.
   * With the screen gone, resuming has to finish the round itself — otherwise
   * the player lands on Muster with a spent battle still pending and Fight
   * resolves it a second time.
   */
  it('finishes the round when a run is resumed mid-result, rather than re-fighting it', () => {
    const run = freshRun()
    resolveBattles(run)
    expect(run.phase, 'resolveBattles leaves the run in the result phase').toBe('result')
    const roundFought = run.round

    useGame.setState({ save: { ...useGame.getState().save, activeRun: run } })
    useGame.getState().resume()

    const after = useGame.getState().run!
    expect(after.phase).not.toBe('result')
    expect(after.round, 'the resumed run must be past the round it already fought').toBeGreaterThan(roundFought)
    expect(useGame.getState().screen).toBe('muster')
  })
})
