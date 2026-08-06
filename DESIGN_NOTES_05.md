# BANNERFELL — Design Notes 05: the War Council (boons become a talent tree)

Companion to `GAME_DESIGN.md` and `DESIGN_NOTES_01–04`. Where this conflicts with earlier docs — including GDD §4.1's random boon offers and the pool system — **this wins and replaces them.** DN04 §11's path-rank presentation survives almost intact; it becomes the skin of this system rather than a layer over randomness.

---

## 1. The change, in one paragraph

Boon *effects* stay. Boon *selection* stops being random. Every hero now has a fixed, fully visible **talent tree** — three branches, five tiers each — shown from round 1. Level-ups (rounds 2, 4, 6, 8, 10, 12, unchanged) grant one **talent point** to place in any branch, which always takes that branch's *next* node. The flow is identical every run; what changes between runs is which paths fit the army you actually drafted. This is the WoW model adapted to a six-point run: commitment over luck, planning over reacting, "the paths get stronger" made literal and visible.

**Why the randomness was failing** (playtest + design read): random 1-of-3 offers meant the player could neither plan toward anything nor learn the boon pool — every level-up was a comprehension test of three unfamiliar cards, and builds were assembled *at* the player rather than *by* them. A visible tree turns round-2 into a promise the run keeps.

**The honest trade:** determinism is solvable — with fixed trees, one "correct" path per hero can emerge. §7's guardrails exist specifically to catch that, and the design counters it structurally three ways: choice nodes (§2.3), hero overrides (§3), and the fact that the *right* path depends on the draft RNG that still drives the rest of the run.

---

## 2. Tree structure

### 2.1 Shape

Three branches per hero, keeping the established identities: **Might** (army combat), **Magic** (the hero's spell), **Command** (economy and camp). Each branch is a ladder of **5 tiers**. Six points per run means the deepest possible build is capstone + a one-point dip — you can never have two capstones, and that scarcity is the strategy.

- Placing a point in a branch always takes that branch's next tier — no skipping, no prerequisites beyond the ladder itself (with 6 points, WoW-style points-spent gates just add bookkeeping).
- Tier names carry over from DN04 §11: **Basic (1) → Advanced (2) → Expert (3) → Master (4) → Capstone (5)**.
- Picks are permanent for the run. No respec — this is a roguelike; commitment is the texture.

### 2.2 Power curve

Nodes scale hard with tier — the ladder must *feel* like a ladder: Basic ≈ a solid stat nudge, Advanced ≈ a keyword or mechanic touch, Expert ≈ changes what you buy or position, Master ≈ a build hinge, Capstone ≈ the run's headline. Rough power weights for the sim: 1 / 1.5 / 2.5 / 4 / 6.

### 2.3 Choice nodes — variety without randomness

Tiers **2 and 4 of every branch fork into a choice of two nodes**; picking one locks the other for the run. Deterministic (both options always the same, both visible from round 1), but it gives every branch four internal variants and every hero 64 theoretical full-tree shapes — enough space that "the" solved path is a moving target, with zero RNG. Tiers 1, 3 and 5 are fixed nodes.

**Feats now unlock alternate choice-node options** (replacing DN's "alternate boons into the pool"): meta-progression widens the forks, never deepens the power.

## 3. Content — where the existing boons go

The current boon pools are **recycled, not rewritten**: every existing boon effect payload becomes a node. The engine's effect-application layer doesn't change at all — this is a re-plumbing of *selection*, not of *effects*. Mapping guidance:

- **Shared skeleton, faction flavour.** The three branch ladders are defined once per **faction** (all that faction's heroes share them), with faction-mechanic nodes where they belong: Vanguard's Might track leans Bulwark/Cover, Verdant's leans Growth, Stormtide's leans Frenzy. Command tracks are the most shared (economy is economy); Magic tracks are the most personal.
- **Hero overrides.** Each hero replaces **two nodes** in their signature branch with hero-unique nodes (their old hero-specific boons, upgraded to fit the tier's power weight). Example shapes: Berrik's Might-Expert becomes *Oathwall* (his Bulwark identity), Zhala's Magic-Master becomes her extra-cast passive turned active choice. This is what makes Thane Berrik's tree read differently from Yseult's despite the shared skeleton.
- **Capstones** absorb the existing round-10/12 "capstone boons" — one fixed per branch per faction, hero-overridable.
- Old "rarity scales with round" logic: deleted. The ladder position *is* the rarity.

Claude Code drafts the full node tables (3 factions × 3 branches × 5 tiers + forks + 12 hero override nodes) from the existing pools, keeping every effect id; numbers go through the sim.

## 4. Presentation — the War Council screen

- **Always inspectable:** tap the hero portrait → **War Council** tab shows the full tree — three vertical branch columns, every node named and readable, taken nodes lit, current next-node highlighted, locked fork options greyed with a lock. Visible from round 1 so the player can plan the whole run at the tavern like a WoW character sheet.
- **Level-up flow:** the existing DN04 §11 three-column screen, now showing each branch's *actual next node* (both options when it's a fork) instead of random cards. Same one-tap pick. The chosen node slots into its column with the path-rank toast ("Might — Advanced").
- **Progress at a glance:** the boon strip under the hero portrait (DN03 §2.3) becomes three mini path-bars with pips per tier taken.
- **Preview discipline:** every node shows its concrete numbers *for this run* (Magic nodes show the spell's before → after, per DN04 §11), and DN03 §2's rule stands — picking a node visibly touches what it changed within one second.

## 5. Rivals use the same trees

AI warlords place points in the same trees, driven by archetype policy: greedy-scaling goes Command-heavy early, aggro-tempo rushes Might, hero-centric archetypes (Conclave-style) chase Magic capstones. Scouting an opponent shows their taken path in the warlord sheet — reading "she's two picks from her capstone" is new, legible threat information that randomness could never provide.

## 6. Engine and data scope

- New `data/talents/<faction>.ts` files: node defs `{ id, branch, tier, fork?: 'a'|'b', effect: <existing effect payload>, heroOverrides }`.
- `engine/boons.ts` becomes `engine/talents.ts`: track points per branch, resolve next-node/fork offers, apply effects through the existing pipeline. Offer-pool and rarity code deleted.
- Save/telemetry: run state stores the pick sequence (ordered list of node ids) — replay-safe, and telemetry (LAUNCH_PLAN §4) now records exact paths, which makes the §7 analysis trivial.
- Determinism unchanged: no RNG anywhere in this system anymore.
- Tests: ladder gating (no skips), fork lock, hero override substitution, six-points-max, effect parity (a recycled node produces the identical engine effect its boon did), rival policy pathing determinism.

## 7. Balance guardrails (sim + live telemetry)

- **No dominant path:** at Standard difficulty, no exact 6-pick sequence above **25%** of wins for a hero, and no branch above **50%** of total points placed, across 5k sims. First lever: numbers on the over-picked nodes. Second lever: swap the offending fixed tier-3 node into a fork. Never delete choice.
- **Capstone rate:** 30–50% of runs should reach *a* capstone — below that the ladder feels unclimbable, above it dips are undervalued.
- **Fork health:** each fork option picked 30–70% — a 90/10 fork is a fake choice.
- Once playtesting is live, LAUNCH_PLAN telemetry validates all three against real players, not just sims.

## 8. Acceptance criteria

1. The full tree is visible and readable from round 1 on a phone; every future node's text and numbers are inspectable before any point is spent.
2. Level-ups always offer the three branches' actual next nodes (with both fork options at tiers 2/4); no random draws remain anywhere in the system.
3. Two heroes of the same faction show visibly different trees (override nodes marked with the hero's sigil).
4. Feat unlocks appear as new fork options, labelled as unlocked.
5. Scouting shows a rival's taken path.
6. All existing boon effects still function identically in the engine (effect-parity tests pass); battles remain deterministic per seed.
7. Sim run posts the §7 columns and meets the fork-health band on at least 80% of forks at first tuning.
8. DN03 §2 feedback rules still hold: every pick visibly changes something within one second.

## 9. Suggested commits

1. `feat(data): talent tree definitions for the three factions + hero overrides` (recycled effects, no engine change)
2. `feat(engine): talents.ts — points, ladders, forks, rival pathing; delete boon pools` (+ tests incl. effect parity)
3. `feat(ui): War Council screen + level-up columns on real nodes + path pips + scout path view`
4. `chore(sim): path/fork/capstone columns; 5k-run report against §7 bands`

*— End of Design Notes 05 —*
