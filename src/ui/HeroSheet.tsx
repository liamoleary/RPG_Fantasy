import { BOON_BY_ID, FACTION_BY_ID, HERO_BY_ID } from '../data/index'
import { spellPower } from '../engine/battle'
import { heroLevel } from '../engine/boons'
import { heroState, type Warlord } from '../engine/run'
import { Sigil } from './Sigil'

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
