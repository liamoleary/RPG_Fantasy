# BANNERFELL — Design Notes 01 (first playtest feedback)

Companion to `GAME_DESIGN.md`. Three items from Liam's first hands-on session: two UX problems to fix, one new system to build. Where this document conflicts with the GDD, this document wins.

---

## 1. The board doesn't explain itself (UX fix — high priority)

**Observed:** On the Muster screen the warband shows a row of 3 larger boxes and a row of 4 smaller boxes with no labels. The player couldn't tell what the rows meant or why the boxes were different sizes.

**What they actually are (per GDD §6):** the 4 slots are the **Front Line** (melee — absorbs attacks) and the 3 slots are the **Back Line** (ranged/support — protected until the front line falls). The size difference carries no meaning and must go.

**Required changes:**

1. **Uniform slot size** across both rows. Any visual differences between rows should be deliberate (row tint, a subtle shield vs. arrow watermark in empty slots), never incidental.
2. **Label the rows** directly on the board: `FRONT LINE — melee, takes the hits` above/beside the 4-slot row, `BACK LINE — ranged, protected` on the 3-slot row. Short labels always visible; the explanatory clause can truncate on small screens with the full text in the row's info tap.
3. **Orient consistently with battle:** the enemy appears at the top of the battle screen, so on *your* board the back line sits on top and the front line at the bottom (nearest your thumb). Muster and Battle must agree so the mental model transfers.
4. **Row eligibility on every card:** each unit card shows a tiny position glyph (⚔ front / ➶ back / ◈ any). When dragging a unit, legal slots glow and illegal slots dim — the player should never discover placement rules through a rejected drop.
5. **Empty-slot hints:** empty slots show a ghost glyph + row name so a new player reads the board's structure at a glance even with one unit on it.

**Acceptance:** a first-time player can answer "what are the two rows and where should my Crossbow Levy go?" from the Muster screen alone, without playing a battle.

---

## 2. You can't learn what a unit does without buying it (UX fix — high priority)

**Observed:** Unit info is invisible until the card is played. On a phone (no hover), the player is buying blind.

**Required changes — a universal Inspect sheet:**

1. **Tap any unit card, anywhere** — War Camp offer, your board, the scout view of your next opponent, and the battle screen (pauses playback while open) — to open a bottom-sheet with:
   - Full stats: ATK / HP / Init / muster size / tier / row eligibility.
   - **Keywords in plain language** ("Bulwark 2 — absorbs 2 damage from each attack, then weakens by 1"), not just keyword names.
   - **Promotion line preview:** the full line (e.g. Militia → Footman → Sunforged Champion) with each form's stats, new keywords, gold cost, and required Camp Tier — so buying a T1 unit is visibly buying its future.
   - **Banner Rank progress** (see §3): current count, next threshold, and what the rank will grant.
2. **Interaction model:** single tap = inspect (never buys, never plays). Recruiting is either drag-from-shop-to-board or an explicit `Recruit — 3g` button inside the sheet. Long-press may be a shortcut for quick-buy later; tap must stay safe.
3. **Same sheet for heroes and boons:** tapping the hero portrait or any lobby rival shows passive, spell (with current X values), and boons taken.
4. **Keyword glossary** reachable from settings/help listing all launch keywords — but the inspect sheet must be self-sufficient; the glossary is backup, not the primary path.

**Acceptance:** the player can state a shop unit's full behavior, its promotion path, and its next rank reward without spending gold.

---

## 3. NEW SYSTEM — Banner Ranks (stack-size milestones)

**Liam's idea, adopted:** stacks shouldn't just get linearly bigger — hitting a stack-size threshold should *upgrade* the unit, granting a new keyword or skill improvement. This gives a second progression axis alongside promotions and a reason to keep buying a unit past "enough," and it makes big stacks feel like the elite companies they look like.

### 3.1 Rules

- Every unit line defines **two rank thresholds** in data, scaled to its muster size:

  | Muster size | Rank 1 "Veteran" at | Rank 2 "Honored" at |
  |---|---|---|
  | +4 / +3 per purchase | 12 | 24 |
  | +2 per purchase | 8 | 16 |
  | +1 per purchase | 4 | 8 |

  (Defaults — individual units may override in data.)
- **Rank 1 — Veteran:** a small stat bonus defined per unit (typically +1 ATK *or* +1 HP per unit in the stack).
- **Rank 2 — Honored:** a **unit-specific milestone skill or keyword** — the exciting one. Examples for the Vanguard roster:

  | Unit | Honored (Rank 2) reward |
  |---|---|
  | Militia line | **Shield Wall** — the stack gains Bulwark 1 (stacks with promotions' Bulwark) |
  | Crossbow Levy line | **Piercing Volley** — volleys hit a second random target for half damage |
  | Footman (if base-bought) | inherits Militia line reward — rewards are defined **per line**, not per form |
  | Battle Cleric | heal triggers twice per exchange |
  | Cannon Crew | **Overcharge** — first shot each battle deals double damage |

  Claude Code designs the remaining line rewards using each faction's signature mechanic (Verdant rewards accelerate Growth, Stormtide rewards feed Frenzy, etc.).
- **Ranks are permanent for the run** once earned, tracked on the *stack*, and **survive promotion** (the count is preserved, so the company keeps its colors). Battle casualties never remove a rank — thresholds check the stack's full (restored) count at Muster.
- Effects that permanently reduce count below a threshold (e.g. selling part of a stack, if that ever exists) do **not** revoke earned ranks. Simple rule: ranks only ever go up.
- Rank bonuses apply in the engine as data-driven stack modifiers — same pipeline as keywords (GDD §8.3); no UI-side logic.

### 3.2 Why this is good for the game (design intent)

- Creates a real tension with promotions: gold into *count* (chasing a rank) vs. gold into *quality* (promotion, higher-tier units). Both must remain viable — this is the point.
- Gives cheap high-muster units a late-game identity: a 24-strong Honored Militia wall is a build, not a leftover.
- Amplifies count-generating boons/heroes (Thornqueen Maravel's +1 count passive now has a destination).

### 3.3 UI

- Card shows **rank pips** (none / one bronze / two gold chevrons) beside the count badge.
- Inspect sheet shows a progress line: `18 / 24 — Honored: Piercing Volley` (the screenshot's 18-count Crossbow Levy is exactly the moment this should be visible and tempting).
- Rank-up moment gets a flourish on par with promotion: chevron stamp animation + the new keyword sliding onto the card.

### 3.4 Balance guardrails (sim harness)

- Add rank-adoption and rank-vs-placement columns to `scripts/sim.ts` output.
- Watch for the degenerate "one giant stack" strategy: if a single Honored mega-stack dominates (>8% win-delta per GDD §13), first lever is raising thresholds; second is capping Rank 2 effects (flat, not per-unit-scaling, rewards).
- Rival archetype policies must understand ranks (greedy-scaling archetype should chase thresholds) or the player exploits AI blindness.

---

## 4. Suggested build order

1. §2 Inspect sheet (unblocks learning the game — everything else is easier to evaluate once info is visible).
2. §1 Board readability (small, mostly CSS + labels).
3. §3 Banner Ranks (engine + data + UI + sim columns), then a harness pass to re-verify GDD §13 targets.

*— End of Design Notes 01 —*
