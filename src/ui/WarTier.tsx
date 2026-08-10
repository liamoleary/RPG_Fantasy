import { MAX_WAR_TIER, clampTier, renownMultiplier, rulesForTier, tierDef } from '../data/tiers'
import type { SaveData } from '../state/persist'

/**
 * The climb, worn (Design Notes 09 §5).
 *
 * Everything here reads two numbers that are deliberately separate: the
 * highest tier you may *choose*, and the highest you have actually *won* at.
 * "Climbing at 6, conquered 5" is a real state and the UI has to be able to
 * say it — one number could not.
 */

/** The banner-and-laurel device. Faction-agnostic gold on ink, per §5. */
export function TierCrest({
  tiers,
  onClick,
}: {
  tiers: SaveData['tiers']
  onClick?: () => void
}) {
  const climbing = clampTier(tiers.highestUnlocked)
  const won = clampTier(tiers.highestWon)
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag className="crest" onClick={onClick} aria-label={`War Tier ${climbing}. Highest won: ${won}. Choose a tier.`}>
      <span className="crest-laurel" aria-hidden="true">
        ❦
      </span>
      <span className="crest-body">
        <span className="crest-eyebrow">War Tier</span>
        <span className="crest-numeral">{climbing}</span>
      </span>
      <span className="crest-foot">{won >= climbing ? 'conquered' : `conquered ${won}`}</span>
    </Tag>
  )
}

/** Every rule a run at this tier is playing under — the same list everywhere. */
export function TierRules({ tier, compact }: { tier: number; compact?: boolean }) {
  const rules = rulesForTier(tier)
  if (rules.length === 0) {
    return <div className="tier-rules-empty small dim">No banner rules. The war as it is fought at the foot of the mountain.</div>
  }
  return (
    <ul className="tier-rules" data-compact={compact ? 'true' : undefined}>
      {rules.map((r) => (
        <li key={r.tier}>
          <span className="tier-rule-n">{r.tier}</span>
          <span className="tier-rule-body">
            <strong>{r.name}</strong>
            {!compact && <span className="tiny dim"> {r.text}</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}

/**
 * The picker. Every unlocked tier, its cumulative rules and your record at it.
 * Locked tiers are shown too, greyed — the ladder is the point, so hiding the
 * rest of it would hide the thing you are climbing.
 */
export function TierPicker({
  tiers,
  selected,
  onPick,
  onClose,
}: {
  tiers: SaveData['tiers']
  selected: number
  onPick: (tier: number) => void
  onClose: () => void
}) {
  const unlocked = clampTier(tiers.highestUnlocked)
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet tier-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="center">
          <div className="eyebrow">The climb</div>
          <h2>War Tiers</h2>
          <div className="small dim">
            Win at a tier to unlock the next. Losing never costs you a rung — and altitude pays renown either way.
          </div>
        </div>

        <div className="tier-list">
          {Array.from({ length: MAX_WAR_TIER }, (_, i) => i + 1).map((tier) => {
            const def = tierDef(tier)
            const open = tier <= unlocked
            const rec = tiers.records[String(tier)] ?? { runs: 0, wins: 0 }
            return (
              <button
                key={tier}
                className="tier-row"
                data-on={tier === selected ? 'true' : undefined}
                data-locked={open ? undefined : 'true'}
                disabled={!open}
                onClick={() => onPick(tier)}
              >
                <span className="tier-row-n">{tier}</span>
                <span className="tier-row-body">
                  <strong>{def.name ?? 'The foot of the mountain'}</strong>
                  <span className="tiny dim">{def.text ?? 'The game as it ships. Nothing added.'}</span>
                </span>
                <span className="tier-row-rec tiny">
                  {rec.runs === 0 ? (
                    <span className="dim">{open ? 'unattempted' : 'locked'}</span>
                  ) : (
                    <>
                      <b>{rec.wins}</b>
                      <span className="dim">/{rec.runs}</span>
                    </>
                  )}
                </span>
              </button>
            )
          })}
        </div>

        <div className="panel tiny">
          <div className="eyebrow" style={{ marginBottom: 4 }}>
            Running Tier {selected} — every rule in force
          </div>
          <TierRules tier={selected} compact />
          <div className="dim" style={{ marginTop: 6 }}>
            Renown ×{renownMultiplier(selected).toFixed(2)}, win or lose. No units, heroes or factions are ever locked
            behind a tier.
          </div>
        </div>

        <button className="btn btn-primary" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  )
}

/**
 * "Here is what you signed up for" — three seconds at the top of a run (§5).
 * Dismissible immediately: it is a statement, not a gate, and a player on
 * their twelfth Tier 4 attempt should not have to read it again.
 */
export function TierBanners({ tier, onClose }: { tier: number; onClose: () => void }) {
  if (clampTier(tier) <= 1) return null
  return (
    <div className="scrim scrim-solid" onClick={onClose}>
      <div className="sheet tier-banners" onClick={(e) => e.stopPropagation()}>
        <div className="center">
          <div className="eyebrow">Banners of war</div>
          <h2>War Tier {clampTier(tier)}</h2>
        </div>
        <TierRules tier={tier} />
        <button className="btn btn-primary" onClick={onClose}>
          March
        </button>
      </div>
    </div>
  )
}
