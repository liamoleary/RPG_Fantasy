import { BOON_BY_ID, FACTION_BY_ID, HERO_BY_ID } from '../data/index'
import type { BoonBranch } from '../data/types'
import { spellPower } from '../engine/battle'
import { heroLevel } from '../engine/boons'
import { heroState, type Warlord } from '../engine/run'
import { Sigil } from './Sigil'

/**
 * Boons are a path you walk (Design Notes 04 §11). The M&M feel — Basic to
 * Advanced to Expert — is pure presentation over `boonsTaken`, so this is the
 * only place the arithmetic lives and there is no engine change behind it.
 */
export const PATH_TITLES = ['—', 'Basic', 'Advanced', 'Expert', 'Master'] as const

export function pathTitle(picks: number): string {
  return PATH_TITLES[Math.min(picks, 4)]
}

/** How many boons this warlord has taken in each branch. */
export function branchPicks(boonsTaken: readonly string[]): Record<BoonBranch, number> {
  const out: Record<BoonBranch, number> = { might: 0, magic: 0, command: 0 }
  for (const id of boonsTaken) {
    const b = BOON_BY_ID.get(id)
    if (b) out[b.branch] += 1
  }
  return out
}

/** One path's standing: pips filled to its rank, with the rank's name. */
export function PathPips({ branch, picks }: { branch: BoonBranch; picks: number }) {
  return (
    <span className="path" style={{ ['--bc' as string]: branchColor(branch) }}>
      <span className="path-name">{branch}</span>
      <span className="path-pips" aria-hidden="true">
        {[0, 1, 2, 3].map((k) => (
          <i key={k} data-on={k < Math.min(picks, 4) ? 'true' : undefined} />
        ))}
      </span>
      <span className="path-title">{pathTitle(picks)}</span>
    </span>
  )
}

/** The three paths side by side — the level-up screen and the hero sheet. */
export function PathColumns({ boonsTaken }: { boonsTaken: readonly string[] }) {
  const picks = branchPicks(boonsTaken)
  return (
    <div className="paths">
      {(['might', 'magic', 'command'] as BoonBranch[]).map((b) => (
        <PathPips key={b} branch={b} picks={picks[b]} />
      ))}
    </div>
  )
}

/** The three boon branches, wherever a branch has to be coloured. */
export function branchColor(b: string): string {
  return b === 'might' ? '#e08a5a' : b === 'magic' ? '#9a7ae0' : '#5ab0a0'
}

/**
 * One warlord's kit: passive, spell with its numbers substituted, boons taken.
 *
 * It takes a warlord rather than the run so battle can open the same sheet for
 * either hero when a plaque is tapped (Design Notes 03 §1.3) — during a fight
 * the enemy's kit is no longer secret, and it is exactly what the player needs
 * to read the beams coming at them.
 */
export function HeroSheet({ warlord, round, onClose }: { warlord: Warlord; round: number; onClose: () => void }) {
  const hero = HERO_BY_ID.get(warlord.heroId)!
  const f = FACTION_BY_ID.get(warlord.factionId)!
  const x = spellPower(hero, heroState(warlord, round))
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <span className="faction-icon" style={{ ['--fc' as string]: f.colors.primary }}>
            <Sigil id={hero.sigil} size={22} />
          </span>
          <div className="grow">
            <h2>
              {hero.name} {hero.title}
            </h2>
            <div className="small dim">
              {f.name} · Level {heroLevel(round)}
              {warlord.isPlayer ? '' : ` · ${warlord.name}`}
            </div>
          </div>
        </div>
        <div className="panel small">
          <div className="eyebrow">Passive</div>
          <div>{hero.passive.text}</div>
          <div className="eyebrow" style={{ marginTop: 8 }}>
            {hero.spell.name}
          </div>
          <div>{hero.spell.text.replace(/\bX\b/g, String(x))}</div>
          <div className="tiny dim">Currently X = {x}.</div>
        </div>
        <div className="eyebrow">Paths</div>
        <PathColumns boonsTaken={warlord.boonsTaken} />

        <div className="eyebrow">Boons taken ({warlord.boonsTaken.length})</div>
        {warlord.boonsTaken.length === 0 && (
          <div className="small dim">
            {warlord.isPlayer ? 'None yet — your first choice comes on round 2.' : 'None yet.'}
          </div>
        )}
        {warlord.boonsTaken.map((id) => {
          const b = BOON_BY_ID.get(id)
          return b ? (
            <div key={id} className="panel small">
              <span className="boon-branch" style={{ ['--bc' as string]: branchColor(b.branch) }}>
                {b.branch}
              </span>
              <strong style={{ display: 'block' }}>{b.name}</strong>
              <span className="dim">{b.text}</span>
            </div>
          ) : null
        })}
        <button className="btn btn-primary" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}
