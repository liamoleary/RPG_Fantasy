# BANNERFELL — Design Notes 04: economy honesty, apex forms, and impact

Companion to `GAME_DESIGN.md` and `DESIGN_NOTES_01–03`. Where this conflicts with earlier docs, this wins. Twelve playtest observations this round; two exposed real design holes (§1, §3), one exposed a missing system answer (§2), the rest are presentation and UX. No new art is required for any of it.

---

## 1. The shop inversion — line-aware recruiting (ECONOMY FIX, the big one)

**Observed:** "Upgraded versions appear in the shop, but their stacks are worth less than the T1 versions — no reason to buy the upgraded unit, just always buy the lower one."

**Diagnosed in code:** `recruit()` in `engine/camp.ts` merges on **exact unitId only**. The GDD's promise that "recruits train up into the stack's current form" (§5.2) was never implemented — buying Militia while owning a promoted Footman stack starts a *separate* Militia stack. Meanwhile high-muster T1s race up Banner Rank count thresholds, so the cheap form looks strictly better all game. The player is right: the higher-form shop offers are mostly dead cards. Fix in three rules:

1. **Line-aware merging with conversion.** Buying any form of a line you already own merges into your stack of that line, converting recruits into the stack's current form: `added = max(1, floor(musterSize / 2^stepsBehind))` where `stepsBehind` = how many forms behind the purchased unit is. Buying the stack's exact form adds full `musterSize`. Examples with the Vanguard line (Militia +4 / Footman +3 / Champion +1): into a Footman stack — Militia adds 2, Footman adds 3; into a Champion stack — Militia adds 1, Footman adds 1, Champion adds 1. The T1-spam dominance is gone; the higher offer is now the efficient buy for a promoted line, which is what a shop *showing you the upgrade* implies.
2. **Buying above your stack's form starts its own stack** (that's late entry at strength, already correct), and **identical-form stacks auto-merge** — including on promotion, so promoting your Militia into Footmen while owning a Footman stack combines them.
3. **The buy button tells the truth.** Every camp card's button shows what will actually happen: "+2 → Footmen" when it merges with conversion, "+4 NEW" when it starts a stack. No hidden math — the button is the tutorial.

**Sim guardrails:** re-run rank-adoption columns (conversion slows count-based rank racing — thresholds may need lowering for lines); check T1-buy rate after round 6 drops but doesn't die; line-top `musterSize` may want to be 2 (sim's call).

---

## 2. "Was that a bug or an ability?" — the game must answer this itself

**Observed:** a Bulwark-stacked Vanguard board felt unkillable, then "some minion from the shamans whacked me out in one shot."

Almost certainly not a bug: Bulwark soaks `bulwark × count` per attack *then decays* — a huge `atk × count` swing (Leviathan, Thunder Roc dive, or a boon-fed Chain Lightning, which as a spell ignores rows) still punches through, and that's correct: finite armour losing to concentrated force is the designed ceiling on turtling. But the player had to *ask me* what happened, and that's the real failure. Three fixes so the game answers:

1. **Damage numbers show the armour math.** When Bulwark absorbs, the float reads `34 −12🛡 = 22`, and the stack's shield value visibly ticks down. Armour that decays silently is why "unkillable" flipped to "one-shot" with no warning.
2. **Big-hit callout.** Any single attack dealing ≥ 40% of a stack's pooled HP gets a named banner — "**Leviathan of the Deep Tide** — 38 damage!" — same presentation family as hero spell banners (DN03 §1.2). One-shots should feel like an *event with an author*, not a glitch.
3. **"How it went" on the result screen.** Three auto-picked key moments — biggest single hit, first stack lost, the killing blow — each one line with attacker, victim and numbers, with "see full battle log" expanding the event list. This permanently answers every future "what killed me?" without a designer on call.

---

## 3. Apex abilities — the final form should feel final (NEW SYSTEM)

**Suggestion accepted, scoped to line-tops.** Every completed line's final form gains an **Apex ability**: a meter that charges during battle and unleashes an ultimate with a full flourish. This is the payoff DN03's lines were missing, and it's the systemic answer to §1 — promoted stacks now do something no pile of T1s ever can.

- **Who:** the six line-top forms only (`vg_champion`, `vg_ballistier`, `vd_elderbark`, `vd_matriarch`, `st_warlord`, `st_stormspear`). Not T5s (already bombs), not mercs (hired help doesn't ascend). Apex is the reward for *finishing a line*, full stop.
- **Charging:** the stack gains 1 charge when it attacks and 1 when it survives taking casualties; at full charge (default 5, per-unit in data) the ultimate fires in place of its next attack, then the meter resets. Deterministic, seeded, event-logged like everything else.
- **The six ultimates** (shapes fixed, numbers sim-tuned):
  - **Sunburst Verdict** (Champion): a single colossal strike on the mirrored target that ignores Bulwark; your front row gains Bulwark 1.
  - **Sunlance** (Ballistier): a piercing bolt that hits the front-row target *and* the stack behind it in the same column.
  - **Rootquake** (Elderbark): roots the entire enemy front row for 2 exchanges; this stack heals 25% of pool.
  - **Moonfall** (Matriarch): volleys the two most-wounded enemy stacks; excess kill damage returns as healing to your most-wounded stack.
  - **Bloodcall** (Warlord): immediately attacks twice; every friendly Frenzy trigger this battle grants this stack +1 ATK permanently for the battle.
  - **Ninth Wave** (Stormspear): a lightning harpoon at the highest-count enemy stack, splashing half damage to its row neighbours.
- **Presentation:** a slim segmented charge meter on the card (distinct from rank pips and Cover pips); when full, the card glows its faction accent; on firing — the same treatment as a hero spell: flare, named banner, beam to targets. The meter also shows in Muster inspect so buyers know what they're building toward.
- **Balance guardrails:** apex units enter the DN02/DN03 sim columns; if line adoption exceeds ~80% the charge requirement rises before numbers come down — the fantasy is the ultimate *moment*, not permanent DPS.

---

## 4. Install as an app (PWA prompt)

The plumbing (manifest, service worker) exists per GDD §12.1 / GRAPHICS_UPDATE §4 — what's missing is the *invitation*. Add an install flow: capture `beforeinstallprompt` (Chrome/Android) and offer a styled **"Install Bannerfell"** card on the Home screen plus a one-time prompt **after the player's first completed run** (never on first load — earn it first, and browsers require engagement anyway). On iOS Safari, where auto-install prompts don't exist, the same card opens a two-step illustrated sheet: Share → Add to Home Screen. Verify installed mode (`display-mode: standalone`) hides the card and respects safe-area insets.

## 5. Everything fits the screen — no page scroll in Muster

The Fight button must never be below the fold. Muster becomes a fixed-height layout (`100dvh` — dynamic viewport units so browser chrome doesn't break it): ladder strip, board, and a **pinned bottom action bar** (Ready — Fight!) are always on screen; the War Camp panel is the one internally-scrollable region if space runs out. Battle and Result screens get the same treatment. Acceptance: on a 360×740 viewport with browser chrome, every interactive element is reachable without scrolling the page.

## 6. The Tier-up button is a decision, not a utility

Reroll and Freeze are camp furniture; Tier-up is one of the biggest decisions in the game and currently dresses like its siblings. Give it its own identity: a banner-shaped button in the faction's gold accent showing the current tier as a Roman numeral shield (the §DN01 tier badge language), the cost, and a subtle pulse **only when affordable**. On press: the camp briefly flashes the new tier's card backs. Reroll/Freeze stay visually quiet. One CSS component, no art assets.

## 7. Hits must land — impact FX with power scaling

Attacks currently read as polite. The impact package, all CSS transforms/opacity (reduced-motion swaps every shake for a flash):

- **Attacker:** deeper lunge with a 1-frame hold at contact; stack size scales the lunge weight subtly.
- **Defender:** red flash pulse + small knockback; damage number pops with size scaled to the % of pool removed.
- **Kills:** stack death gets the shatter plus a slot-flash; the killing hit's number lands heavier (larger, brief hold).
- **Heavy hits** (≥40% of pool, same threshold as §2.2): micro screen-shake, impact spark at the contact point, and the big-hit banner. Power fantasy scales with actual power — a 6-damage poke and a 38-damage Leviathan swing must feel like different events.
- Frequency cap: never more than one screen-shake per second; simultaneous heavy hits share one shake.

## 8. Promotion is one tap away, not a scroll away

Two changes: the Inspect sheet pins **Promote — 3g → Footman** (with target thumbnail) in a sticky header next to the unit name, disabled state explaining why (needs Camp Tier 3 / not enough gold); and any board card with an affordable promotion shows a small gold up-chevron badge — tapping it opens a one-tap confirm popover right there. The player should never scroll to grow.

## 9. The hero deserves the stage

Move your hero from a corner plaque to a **bottom-centre portrait panel** — art large (`HERO_ART_2X`), gradient-masked into the UI, sitting between your back line and the action bar where dead space lives after the DN03 §3 orientation fix. Spell-cast pips arc over the portrait; casts visibly launch *from the portrait*. The enemy hero stays a compact plaque top-corner (their board matters more than their face). Tap behaviour unchanged (pause + sheet).

## 10. Casters cast in their own colours

Archers got projectiles (DN02/03); casters got nothing. Extend the flavour system with `castFx` on units and heroes — `'holy' | 'nature' | 'storm' | 'arcane' | 'blood'`, defaulting by faction (Vanguard holy-gold, Verdant nature-green with leaf/petal particles, Stormtide storm-blue arcs) and overridable per unit. Every ability trigger gets: a cast glow on the caster in its flavour, a beam or arc to the target, and a receiving effect — heals bloom light on the recipient with rising motes (gold light from the Battle Cleric, drifting leaves from a dryad), damage spells strike in their palette. The Cleric's per-exchange heal is currently the most invisible power in the game; after this it should be the most visible.

## 11. Boons are a path you walk, not a grab bag

The M&M feel — *Basic → Advanced → Expert Thaumaturgy* — is one presentation layer away, no mechanics change:

- Track picks per branch. Branch ranks: **Basic (1) → Advanced (2) → Expert (3) → Master (4+)**.
- The level-up screen becomes three visible **path columns** — Might / Magic / Command, each showing its filled rank pips and its current title ("Magic — Advanced"). The offered boon card sits in its column, labelled "**advances Magic to Expert**".
- Picking fires a path-rank toast ("Your Magic is now Expert") and the boon strip (DN03 §2.3) groups its icons by branch with the rank shown.
- The hero sheet shows all three paths with ranks. Zero engine change — it's bookkeeping the UI already has.

---

## 12. Acceptance criteria

1. With a promoted stack on board, every relevant camp card's buy button states exactly what it will add and to which stack; buying the higher form is never strictly worse than the lower form of the same line.
2. A Bulwark absorb shows its math; any ≥40%-pool hit is bannered with its author; the result screen names the killing blow. The §2 scenario is fully explained by the screen alone.
3. Each of the six line-top forms charges and fires its Apex with a visible meter, banner and targets; battles remain deterministic per seed and all Apex behaviour is event-logged.
4. The install card appears post-first-run on Android/Chrome and iOS (instruction sheet); installed mode hides it.
5. No page scrolling in Muster/Battle/Result on a 360×740 viewport; Fight is always visible.
6. Tier-up reads as the premium action at a glance and pulses only when affordable.
7. Melee impacts, kills and heavy hits are visually distinct grades; reduced-motion path exists for all of it.
8. Promotion reachable in one tap from the board and pinned at the top of the sheet.
9. Your hero portrait is the largest single UI element on the battle screen after the boards; casts emanate from it.
10. The Cleric's heal is visible in gold, a dryad's in green, at 2× speed.
11. Level-up shows three ranked paths; every pick advances a named rank.
12. All existing tests pass; new tests cover conversion merging (§1.1 formula incl. min-1 and exact-form cases), auto-merge on promote, and Apex charge/fire determinism; sim re-run posts §1 and §3 guardrail columns.

## 13. Suggested commits

1. `feat(engine): line-aware recruiting with conversion + auto-merge on promote` (+ tests, sim columns)
2. `feat(ui): truthful buy buttons, armour math floats, big-hit banners, result key moments`
3. `feat(engine+ui): Apex abilities for the six line-top forms` (+ tests)
4. `feat(ui): muster viewport fit, pinned action bar, tier-up button identity, promote fast-path`
5. `feat(ui): battle impact package + hero centre-stage + caster castFx flavours`
6. `feat(ui): boon path ranks presentation`
7. `feat(pwa): install prompt flow`
8. `chore(sim): full re-run; paste §1/§3 columns`

*— End of Design Notes 04 —*
