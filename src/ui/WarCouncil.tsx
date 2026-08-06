/**
 * The War Council (Design Notes 05 §4).
 *
 * The whole tree, from round 1, with concrete numbers on every node — this is
 * the screen that turns round 2 into a promise the run keeps. Three branch
 * columns, five rungs each, forks shown side by side.
 *
 * A node is in exactly one of five states, and each has to be readable at a
 * glance on a phone: taken, next (what a point buys right now), locked (the
 * fork option you passed on), feat-locked (visible but not yours yet), and
 * ahead (everything else).
 */
import { useState } from 'react'
import { HERO_BY_ID } from '../data/index'
import {
  BRANCHES,
  TIERS,
  TIER_NAMES,
  nodesAt,
  type Branch,
  type TalentNode,
  type Tier,
} from '../data/talents/index'
import type { HeroMods } from '../data/types'
import { lockedOptions, offersFor, pointsIn } from '../engine/talents'
import { branchColor } from './HeroSheet'
import { MagicPreview } from './MagicPreview'
import { Sigil } from './Sigil'

type NodeState = 'taken' | 'next' | 'locked' | 'feat' | 'ahead'

export function WarCouncil({
  tree,
  taken,
  heroId,
  mods,
  round,
  /** Read-only when looking at a rival (§5) — no picking, just reading. */
  readOnly = false,
  onPick,
}: {
  tree: readonly TalentNode[]
  taken: readonly string[]
  heroId: string
  mods: HeroMods
  round: number
  readOnly?: boolean
  onPick?: (nodeId: string) => void
}) {
  const [open, setOpen] = useState<string | null>(null)
  const hero = HERO_BY_ID.get(heroId)
  const takenSet = new Set(taken)
  const lockedSet = new Set(lockedOptions(tree, taken).map((n) => n.id))
  const nextIds = new Set(offersFor(tree, taken).flatMap((o) => o.options.map((n) => n.id)))

  const stateOf = (node: TalentNode): NodeState => {
    if (takenSet.has(node.id)) return 'taken'
    if (lockedSet.has(node.id)) return 'locked'
    if (node.unlockedByFeat) return 'feat'
    if (!readOnly && nextIds.has(node.id)) return 'next'
    return 'ahead'
  }

  const detail = open ? tree.find((n) => n.id === open) : null

  return (
    <div className="council">
      <div className="council-grid">
        {BRANCHES.map((branch) => (
          <div key={branch} className="council-col" style={{ ['--bc' as string]: branchColor(branch) }}>
            <div className="council-head">
              <span className="council-branch">{branch}</span>
              <span className="council-depth">{pointsIn(tree, taken, branch)}/5</span>
            </div>
            {TIERS.map((tier) => (
              <TierCell
                key={tier}
                branch={branch}
                tier={tier}
                nodes={nodesAt(tree, branch, tier)}
                stateOf={stateOf}
                openId={open}
                onOpen={setOpen}
              />
            ))}
          </div>
        ))}
      </div>

      {/* One detail panel rather than text crammed into every cell — the grid
          stays readable and the numbers stay concrete. */}
      {detail && (
        <div className="council-detail" style={{ ['--bc' as string]: branchColor(detail.branch) }}>
          <div className="council-detail-head">
            <strong>{detail.name}</strong>
            <span className="tiny dim">
              {detail.branch} · {TIER_NAMES[detail.tier]}
            </span>
          </div>
          <div className="small">{detail.text}</div>
          {detail.branch === 'magic' && hero && <MagicPreview hero={hero} mods={mods} round={round} boon={detail} />}
          {detail.heroId && (
            <span className="tiny gold council-sig">
              <Sigil id={hero?.sigil ?? 'shield'} size={12} /> {hero?.name}&rsquo;s own
            </span>
          )}
          {detail.unlockedByFeat && <span className="tiny gold">Unlocked by a feat</span>}
          {stateOf(detail) === 'locked' && <span className="tiny dim">Locked — you took the other side of this fork.</span>}
          {!readOnly && stateOf(detail) === 'next' && onPick && (
            <button className="btn btn-primary btn-sm" onClick={() => onPick(detail.id)}>
              Take it
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function TierCell({
  branch,
  tier,
  nodes,
  stateOf,
  openId,
  onOpen,
}: {
  branch: Branch
  tier: Tier
  nodes: TalentNode[]
  stateOf: (n: TalentNode) => NodeState
  openId: string | null
  onOpen: (id: string | null) => void
}) {
  return (
    <div className="council-tier" data-fork={nodes.length > 1 || undefined}>
      {nodes.map((node) => {
        const state = stateOf(node)
        return (
          <button
            key={node.id}
            className="council-node"
            data-state={state}
            data-open={node.id === openId || undefined}
            onClick={() => onOpen(node.id === openId ? null : node.id)}
            aria-label={`${node.name} — ${branch} ${TIER_NAMES[tier]}: ${node.text}`}
          >
            <span className="council-node-name">{node.name}</span>
            {state === 'taken' && <span className="council-tick" aria-hidden="true">✓</span>}
            {(state === 'locked' || state === 'feat') && <span className="council-lock" aria-hidden="true">🔒</span>}
            {node.heroId && <span className="council-star" aria-hidden="true">★</span>}
          </button>
        )
      })}
    </div>
  )
}
