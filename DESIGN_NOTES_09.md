# BANNERFELL — Design Notes 09: War Tiers (the climb)

Companion to `GAME_DESIGN.md` and `DESIGN_NOTES_01–08`. Builds directly on DN08; requires the `feat/balance-01` faction pass to be complete first (§7). Where this conflicts with earlier docs, this wins.

---

## 1. The complaint is the system working — so the answer is a new system

"It's fun but too easy now" is the *expected* result of DN08, which deliberately made the early game forgiving and the run survivable (§5.1, and §6 explicitly said "not raising difficulty"). That was right: the base run is the place where the power fantasy gets built, and testers of every skill level will play it. Rebalancing the whole game harder would just re-create the old problem for everyone else.

So challenge becomes **opt-in and climbable**: a difficulty ladder you ascend one victory at a time, where the game at your ceiling is always hard, your ceiling is always on display, and a win at altitude is *earned* by definition. This is the Slay the Spire Ascension model, and it's the proven answer to exactly this complaint in exactly this genre.

## 2. One push-back before the design

The request read naturally as "win a lobby → carry on into a harder lobby in the same sitting." **Rejected, for three reasons:**

1. **The draft arc is the game.** Rounds 1–8 — scraping gold, choosing lines, watching the board grow — are the fun. A second lobby entered with a finished warband has no draft arc; it's just battles. Chaining lobbies would make the *least* interesting part of the game the reward for the most interesting part.
2. **Session length explodes.** Reaching "Tier 3" in one sitting = three full lobbies ≈ 60–75 minutes on the DN08 pacing. That kills the pick-up-and-play identity, and a phone interruption at minute 55 costing the whole climb would feel brutal, not challenging.
3. **Tuning cliff.** A lobby tuned to threaten a maxed board must be absurd; the same lobby faced by a merely-good board is a wall. Difficulty tuned against "whatever you finished with" can't be authored well.

**The shape that keeps everything you asked for:** the climb happens *across* runs. Win at Tier N → the victory screen's headline button is **"Raise the Banner — Tier N+1"**, seeding your *next* run one tier higher. Fail anywhere → the defeat screen celebrates the altitude ("**You fell at War Tier 3** — few banners fly this high"). The Home screen wears your highest tier as a crest. Every element of the request survives; each climb attempt stays one 20–30 minute run; and every run still contains the full draft arc, which at higher tiers becomes the hard part again — earning it.

## 3. The War Tiers

- **Tier 1** is the game as shipped after DN08 + the balance pass. Nothing about it changes — it stays the forgiving on-ramp.
- **Tiers 2–10 are authored, cumulative modifiers**: each tier adds exactly **one named rule** on top of everything below it. Named, because legibility is the difference between "hard" and "unfair" — the run-start screen lists every active banner rule, and so does the pause sheet.
- **Design rule for authoring modifiers:** alternate between *the enemy grows* and *you march leaner*, never touch the battle engine, and **never remove the toys** — board slots, talent points, Banner Ranks, Standards all remain exactly as DN08 built them. Pressure comes from opposition and margins, not from amputating the systems that make the game fun.

| Tier | Banner rule (name → effect) |
|---|---|
| 2 | **Veteran Rivals** — all rival policies run at low noise (current Warlord AI) |
| 3 | **Rich Foes** — rivals gain +1 income per round |
| 4 | **Thin Rations** — your starting HP 50 → 42 |
| 5 | **Elite Muster** — rivals draft with full synergy scoring and take tier-4 forks |
| 6 | **Their War Chests** — rival War-Chest rounds grant them double |
| 7 | **Long Supply Lines** — your income ceiling 18 → 15 |
| 8 | **Grudge Pairings** — the strongest surviving rival is paired against you every third round |
| 9 | **Iron Banners** — rivals' boards enter battle with +1 Bulwark on their front line |
| 10 | **The Crownless Throne** — final two rounds replace fallen rivals with authored boss boards |

Exact numbers are the harness's to tune (§7); the *names and shapes* are the design. Ten is a cap for now — authored beats procedural for feel, and if players ceiling out at 10 that's a wonderful problem for a DN10.

## 4. Progression rules

- Winning at your current highest tier unlocks the next; you can always *choose* to run any unlocked tier from Home (chasing a first-win at altitude vs. comfy runs both stay valid).
- Losing never demotes. The crest shows your highest **unlocked** tier and, separately, your highest **won** tier — "climbing at 6, conquered 5" is a state the UI should express.
- Per-hero best tiers tracked too (hero select shows a small tier chip), but the headline crest is account-wide — the front-page number you asked for.
- **Renown multiplier: ×(1 + 0.15 × (tier − 1))**, win or lose. Altitude pays even when it kills you.
- No content is ever gated behind tiers — factions, heroes and feats stay Renown-bought. Tiers gate pride, crests and the multiplier only. (The moment a unit hides behind Tier 6, the ladder stops being self-selected challenge and starts being a wall between players and toys.)

## 5. Presentation — the climb must be worn

- **Home:** the crest is the biggest new element — a banner-and-laurel device with the tier numeral, faction-agnostic gold-on-ink, sitting beside "New Run". Tapping it opens the tier picker (unlocked tiers, each listing its cumulative rules, win/loss record per tier).
- **Run start:** a "banners of war" interstitial lists the active rules — three seconds of "here's what you signed up for."
- **Victory:** the fork from §2 — **Raise the Banner** (headline, next tier) / Claim Victory. First-ever win at a tier gets the full ceremony + crest upgrade animation.
- **Defeat at Tier ≥ 2 is reframed as an expedition report, not a failure screen:** altitude first ("You fell at War Tier 4"), the Legend recap beneath, and the record shown as the mountain ("Tier 4: three attempts, summit unclaimed"). Defeat at Tier 1 keeps the current gentler screen.
- Feedback widget and telemetry (LAUNCH_PLAN) tag every run with its tier.

## 6. What "earned" means in numbers

Target win-rate curve for the harness's competent policy (and later, real telemetry): **Tier 1 ≈ 45–55%, each tier −8 to −12 points, Tier 10 ≈ 3–8%.** If a tier fails to bite (win rate flat vs. the tier below), its rule is too soft — tune the number, not the concept. If any tier cliffs (>20-point drop), split its pressure across two tiers and push the list down.

## 7. Sequencing and guardrails

1. **Hard prerequisite: `feat/balance-01` exit criteria met.** Tuning a difficulty ladder on a 32.5%-Verdant spread bakes the imbalance into every tier; do not start before the faction band holds.
2. Harness gains per-tier columns (win rate, run length, faction spread *per tier* — a tier that reorders faction strength is flagged, since modifiers can interact with mechanics unevenly: e.g. Rich Foes feeds AI Verdant Growth).
3. All modifiers land as data/config (`data/tiers.ts`), zero engine edits — same discipline as DN08 §6.
4. Save/telemetry: `highestUnlocked`, `highestWon`, per-tier records, per-hero bests; LAUNCH_PLAN run rows gain `tier`.

## 8. Acceptance criteria

1. Tier 1 is byte-identical in behaviour to pre-DN09 (config default proves it; existing tests untouched).
2. Every active tier rule is visible at run start, in the pause sheet, and in the tier picker; nothing hidden modifies a run.
3. Victory at highest tier offers Raise the Banner; defeat at Tier ≥ 2 leads with altitude and record; Home wears the crest; hero select shows per-hero bests.
4. Renown multiplier applies win or lose; no content is tier-gated.
5. Determinism per seed holds at every tier; battles unchanged (engine untouched).
6. Harness report shows the §6 curve shape and per-tier faction spread within band ±0.4 of the global band.
7. Tests: tier unlock/never-demote, modifier stacking (tier N applies exactly rules 2..N), config equivalence at Tier 1, save round-trip of records.

## 9. Commits

1. `feat(data+engine-config): war tier definitions and modifier application` (+ tests)
2. `feat(app): tier progression, records, renown multiplier, save + telemetry fields`
3. `feat(ui): crest, tier picker, run-start banners, victory fork, expedition-report defeat`
4. `chore(sim): per-tier columns; report win-rate curve and per-tier faction spread`

*— End of Design Notes 09 —*
