import { MAX_WAR_TIER, clampTier, renownMultiplier, rulesForTier, tierDef } from '../data/tiers'
import type { SaveData } from '../state/persist'
import type { InterludeGrants } from '../engine/run'

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
  onClose,
}: {
  tiers: SaveData['tiers']
  /** the tier to detail at the foot — the campaign's current rung, or 1 */
  selected: number
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
            Every campaign starts at Tier 1. Win a lobby and you may march on with your whole warband, one rung
            higher, into a lobby that has been building without you. Altitude pays renown either way.
          </div>
        </div>

        <div className="tier-list">
          {Array.from({ length: MAX_WAR_TIER }, (_, i) => i + 1).map((tier) => {
            const def = tierDef(tier)
            const open = tier <= unlocked
            const rec = tiers.records[String(tier)] ?? { reached: 0, fallen: 0 }
            return (
              <button
                key={tier}
                className="tier-row"
                data-on={tier === selected ? 'true' : undefined}
                data-locked={open ? undefined : 'true'}
                disabled
              >
                <span className="tier-row-n">{tier}</span>
                <span className="tier-row-body">
                  <strong>{def.name ?? 'The foot of the mountain'}</strong>
                  <span className="tiny dim">{def.text ?? 'The game as it ships. Nothing added.'}</span>
                </span>
                {/* Campaign history, not a scoreboard (DN10 §7.4): how many
                    campaigns got this far, and how many got no further. */}
                <span className="tier-row-rec tiny">
                  {rec.reached === 0 ? (
                    <span className="dim">{open ? 'unreached' : 'locked'}</span>
                  ) : (
                    <>
                      <b>{rec.reached}</b>
                      <span className="dim"> reached</span>
                      {rec.fallen > 0 && <span className="dim"> · {rec.fallen} fell</span>}
                    </>
                  )}
                </span>
              </button>
            )
          })}
        </div>

        <div className="panel tiny">
          <div className="eyebrow" style={{ marginBottom: 4 }}>
            Tier {selected} — every rule in force
          </div>
          <TierRules tier={selected} compact />
          <div className="dim" style={{ marginTop: 6 }}>
            Renown ×{renownMultiplier(selected).toFixed(2)}, win or lose, banked for each lobby you take at this
            altitude. No units, heroes or factions are ever locked behind a tier.
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
 * The Interlude (DN10 §3) — one screen, not a phase.
 *
 * This replaces DN09's "Banners of war" card outright. That card existed to
 * tell you what you had signed up for at the top of a tier-N run; under DN10
 * a campaign always begins at Tier 1, so the only moment it could ever have
 * fired is the moment you arrive by marching — and then it was one of two
 * sheets saying overlapping things with the same button on them.
 *
 * The whole point is that it is a *receipt*. §3 is explicit that nothing may
 * change on arrival without being listed here, so this reads the grants the
 * engine actually applied rather than describing what it believes happened —
 * if the two ever drift, the screen is wrong on purpose rather than by
 * accident, and the test that pins `marchOn`'s return value catches it.
 *
 * It is also a stopping point. §4 wants a campaign to be many sittings, and
 * this is the natural place to put the app down: the march is already saved by
 * the time this appears.
 */
export function Interlude({ grants, onClose }: { grants: InterludeGrants; onClose: () => void }) {
  const def = tierDef(grants.tier)
  return (
    <div className="scrim scrim-solid" onClick={onClose}>
      <div className="sheet tier-banners" onClick={(e) => e.stopPropagation()}>
        <div className="center">
          <div className="eyebrow">The army rests</div>
          <h2>War Tier {grants.tier}</h2>
          <div className="small dim">{def.name ? `${def.name} — ${def.text}` : 'A new war, on the same march.'}</div>
        </div>

        <ul className="tier-rules interlude-grants">
          <li>
            <span className="tier-rule-n">♥</span>
            <span className="tier-rule-body">
              <strong>Banner restored — {grants.hp} HP</strong>
              <span className="tiny dim"> Each lobby is a fresh war; the tier rules are the difficulty, not attrition.</span>
            </span>
          </li>
          <li>
            <span className="tier-rule-n">◆</span>
            <span className="tier-rule-body">
              <strong>{grants.gold} gold to muster with</strong>
              <span className="tiny dim"> The tier's opening stipend. Nothing banks across a march.</span>
            </span>
          </li>
          <li>
            <span className="tier-rule-n">✦</span>
            <span className="tier-rule-body">
              <strong>
                +{grants.talentPoints} talent point{grants.talentPoints === 1 ? '' : 's'}
              </strong>
              <span className="tiny dim"> On top of the level-up cadence, which restarts with the new lobby.</span>
            </span>
          </li>
        </ul>

        <div className="panel tiny">
          <div className="eyebrow" style={{ marginBottom: 4 }}>
            Everything else marches with you
          </div>
          <div className="dim">
            Your stacks, counts, Banner Ranks, promotions, camp and war council all carry unchanged. The rivals here
            have been building without you.
          </div>
        </div>

        <div className="center">
          <div className="eyebrow" style={{ marginBottom: 4 }}>
            Every rule in force
          </div>
        </div>
        <TierRules tier={grants.tier} compact />

        <button className="btn btn-primary" onClick={onClose}>
          March
        </button>
      </div>
    </div>
  )
}
