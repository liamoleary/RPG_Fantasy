import { BOON_BY_ID, FACTION_BY_ID, HERO_BY_ID } from '../data/index'
import { spellPower } from '../engine/battle'
import { START_HP, heroState, opponentOf, type RunState, type Warlord } from '../engine/run'
import { Sigil } from './Sigil'

export function Ladder({ run, onInspect }: { run: RunState; onInspect: (id: string) => void }) {
  const foeId = opponentOf(run, run.playerId)
  const order = [...run.warlords].sort((a, b) => Number(b.alive) - Number(a.alive) || b.hp - a.hp)
  return (
    <div className="ladder">
      {order.map((w) => (
        <BannerChip key={w.id} w={w} you={w.id === run.playerId} foe={w.id === foeId} onClick={() => onInspect(w.id)} />
      ))}
    </div>
  )
}

function BannerChip({ w, you, foe, onClick }: { w: Warlord; you: boolean; foe: boolean; onClick: () => void }) {
  const f = FACTION_BY_ID.get(w.factionId)
  const hero = HERO_BY_ID.get(w.heroId)
  return (
    <button
      className="banner"
      style={{ ['--fc' as string]: f?.colors.primary ?? '#666' }}
      data-dead={!w.alive}
      data-you={you}
      data-foe={foe && w.alive}
      onClick={onClick}
      aria-label={`${w.name}, ${w.hp} HP`}
    >
      <Sigil id={hero?.sigil ?? 'shield'} size={15} />
      <span className="banner-hp" style={{ color: w.hp <= 8 ? 'var(--danger)' : undefined }}>
        {w.alive ? w.hp : '✕'}
      </span>
    </button>
  )
}

export function WarlordSheet({ run, id, onClose }: { run: RunState; id: string; onClose: () => void }) {
  const w = run.warlords.find((x) => x.id === id)
  if (!w) return null
  const f = FACTION_BY_ID.get(w.factionId)
  const hero = HERO_BY_ID.get(w.heroId)
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <span className="faction-icon" style={{ ['--fc' as string]: f?.colors.primary }}>
            <Sigil id={hero?.sigil ?? 'shield'} size={22} />
          </span>
          <div className="grow">
            <h2>{w.name}</h2>
            <div className="small dim">
              {f?.name} · {hero?.name} {hero?.title}
            </div>
          </div>
          <div className="center">
            <div className="eyebrow">HP</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: w.alive ? undefined : 'var(--ink-dim)' }}>
              {w.alive ? `${w.hp}/${START_HP}` : '—'}
            </div>
          </div>
        </div>
        <div className="small dim">
          {w.wins}W · {w.losses}L · Camp Tier {w.camp.tier}
          {!w.alive && w.placement ? ` · finished ${w.placement}th` : ''}
        </div>
        {hero && (
          <div className="panel small">
            <div className="eyebrow">Passive</div>
            <div>{hero.passive.text}</div>
            <div className="eyebrow" style={{ marginTop: 8 }}>
              {hero.spell.name}
            </div>
            {/* Spell copy carries a literal X — show what it resolves to now. */}
            <div>{hero.spell.text.replace(/\bX\b/g, String(spellPower(hero, heroState(w, run.round))))}</div>
          </div>
        )}
        <div className="eyebrow">Boons taken ({w.boonsTaken.length})</div>
        {w.boonsTaken.length === 0 && <div className="small dim">None yet.</div>}
        {w.boonsTaken.map((id) => {
          const b = BOON_BY_ID.get(id)
          return b ? (
            <div key={id} className="panel small">
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
