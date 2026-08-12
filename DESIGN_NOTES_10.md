# BANNERFELL — Design Notes 10: Back to the Fun

Companion to `GAME_DESIGN.md` and `DESIGN_NOTES_01–09`. Where this conflicts
with an earlier doc — most of all DN09 (War Tiers) and any remaining pacing
ceiling — **this doc wins.**

---

## 1. The complaint

> "I am concerned the game is not balanced and we have lost some perspective
> on having fun with the game. The games need to go for longer so we can
> really flesh out our warband and have the time to make a strategy. Remove
> any tiers as in the game getting harder with time — back to the original
> plan of just choose your faction and play. Some factions and heroes are way
> stronger than others. Remove the confusion around minions in the tavern:
> all minions in the tavern are their base versions, higher tiers only
> through promoting. And buying leaves behind a little empty box — fix it."

Five asks, and one theme: the game had grown a meta-ladder and a pile of
sharp edges while the core promise — *pick a banner, build a warband, earn a
win* — went unbalanced. This note records what was cut, what was lengthened,
and every balance decision the harness drove.

## 2. War Tiers are gone

DN09's opt-in climb (ten cumulative rules, crest, tier picker, boss boards,
renown multiplier) is removed **entirely** — data, engine hooks, UI, save
fields, per-tier telemetry, the ladder report, and `tests/tiers.test.ts`.
Difficulty is once again exactly the three lobby settings (Skirmish /
Standard / Warlord), which tune rival policy noise and nothing else. No rule
ever changes mid-run or between runs; the game as shipped is the game.

Saves migrate by dropping the `tiers` block; renown, unlocks, feats and
stats are untouched. The server's `runs.tier` column stays (historic rows
keep meaning), but clients no longer send it.

## 3. The tavern sells base forms only

One flat rule, no exceptions: **the camp only ever sells the base form of a
promotion line.** Footman, Arbalest, Thornbark, Moonshade, Reaver,
Harpooner, and every line top (Champion, Ballistier, Elderbark, Matriarch,
Warlord, Stormspear) are things you *make* at the promote button, never
things you buy. Units outside a line (Shieldmaiden, Cannon Crew, mercs,
the T5s…) enter the offer at their own tier, as before.

Consequences, all deliberate:

- What a camp card *is* never needs a second reading. Recruits still train
  up into a promoted stack at the same halved-intake arithmetic (DN04 §1.1),
  and the buy button still prints exactly what arrives.
- With the promoted T2 forms out of the shop, camp tier 2 needed its own
  goods: **Shieldmaiden, Spirit of the Glade and Stormcaller Shaman moved
  T3 → T2**, so every faction's first tier-up buys a real identity piece —
  the wall, the healer, the drums.
- The old shop's worst balance outliers (Moonshade −22.9%, Thornbark −22.9%,
  Harpooner −19.9%, Reaver −18.5% win-delta) were precisely "promoted forms
  bought fresh as late stacks". That whole failure mode no longer exists.

The empty-box UI bug is fixed alongside: a bought slot used to leave a
dashed placeholder card in the hand; the hand now closes up.

## 4. The longer campaign

| Knob | Was | Now |
|---|---|---|
| Starting banner HP | 50 | **70** |
| Hard round cap | 20 | **26** |
| Sudden Death bite | 8 | **11** (same share of a banner) |
| Level-up rounds | 2–16 (8 points) | **2–20 (10 points)** |
| Income ceiling | 10 | **12** |
| Honored thresholds (default) | 12/24 · 8/16 · 4/8 | **14/28 · 10/20 · 5/10** |

Measured (800 lobbies, standard): median run **21 rounds**, p95 24, max 26 —
about four rounds longer than before, roughly a half-hour sitting. The extra
rounds are not empty: ten talent points mean a full run can now **finish two
War Council branches** (never three — the choice survives), the 12g ceiling
makes late rounds hold a promote *and* a recruit, and the raised Honored
thresholds land the milestone later in the longer arc (adoption 81% → 68%).
The harness's old "median ≤ 14" target is formally withdrawn; the pacing
target is now 19–23 median, p95 ≤ cap.

## 5. The balance pass (the actual numbers)

Everything below was measured at 800–1600 lobbies per iteration, two seeds,
using `npm run sim`. Baseline → shipped:

**Factions** (target band 4.2–4.8 average placement):

| | before | after |
|---|---|---|
| Vanguard | 3.87 ⚠ | 4.43 |
| Stormtide | 4.71 | 4.41 |
| Verdant | 4.94 ⚠ | 4.66 |

The big lever was the war banks: Vanguard banked +2/+4 per surviving stack
and now banks **+2/+3**; Verdant units got targeted stat buffs instead of a
bank change (Grovetender 1/3, Thornbark 3/6, Moonshade 3/3, Stag 4/5,
Elderbark 5/10, Matriarch 6/5). Vanguard's over-performers were shaved:
Shieldmaiden 2/5 (was 2/6), Battle Cleric heals 2/unit (was 3), Champion
4/5, Ballistier 5/4. Stormtide's promoted mid-forms thickened (Reaver 4/6,
Harpooner 3/3, Drummer 1/4).

**Heroes** (target band 4.0–5.0; baseline spread was 2.80–6.54):

| | before | after | change |
|---|---|---|---|
| Yseult | 3.74 → 3.12 post-restructure ⚠ | 4.84 | Last Stand 3 → 2 saves; Rallying Horn +1.4 ATK/level (was +2.8) |
| Gorrath | 2.80 ⚠ | 3.96 | Chain Lightning +24/level (was +62); passive +2 ATK (was +3) |
| Berrik | 3.99 | 4.01 | untouched |
| Sylvaen | 4.70 | 4.31 | untouched (rises with Verdant) |
| Maravel | 5.17 | 5.02 | untouched (rises with Verdant) |
| Zhala | 6.54 ⚠ | 4.85 | Ancestral Fury base 4, +0.4/level (was base 1, +0.05 — it never grew at all) |

Zhala's profile is deliberately boom-bust — she wins ~22% of lobbies while
averaging mid-table — the all-in scaling seer against Gorrath's steady
top-four. An opening-cast version of Fury was tried and rejected at 30.3%
win rate; the spell stays off battle start.

**War Council:** old Spymaster ("2 free rerolls") was strictly dominated
once Haggler existed — taken 3% of the time. It now reads *"Your spies widen
the camp: +2 offer slots"*, the only Command node that widens selection at
tier 4. Remaining fork skews are tracked in `TODO.md`.

No purchasable unit sits outside the ±8% win-delta flag (Sunforged Champion
rides the line at +8.0%). The negative outliers still printed by the
harness (Thornbark −26% etc., n<100) measure boards that *stalled mid-line*
at run end — a diagnosis of the board, not the card, now that those forms
cannot be bought.

## 6. What was deliberately left alone

- **Honored edge +10%** over the power-matched control (flag 8%): an earned
  milestone should feel strong; fun-first. Tracked in `TODO.md` with the
  right lever named (flatten rewards, not thresholds) if it ever needs it.
- **Capstone rate 86%** against the old 30–50% target: with ten points the
  target was wrong, not the game. Finishing a build *is* the longer
  campaign's promise. Harness target moved to 60–95%.
- **Archetype spread** (aggro rivals outperform greedy ones): lobby texture,
  identical for every seat; not player-facing unfairness.

## 7. Acceptance criteria (all met)

1. No War Tier code, data, UI, save field or test remains; a War-Tiers-era
   save loads with progression intact and no ladder.
2. Every camp offer is a line root or a non-line unit; every promoted form
   is reachable only via Promote. `tests/camp.test.ts` pins the rule.
3. Buying never leaves a placeholder card in the hand.
4. Median run 19–23 rounds, p95 ≤ 26, measured at 800+ lobbies.
5. Faction band within 4.2–4.8 and hero band within ~4.0–5.0 on two seeds.
6. Full vitest suite green; `npm run sim` clean of new regressions.

*— End of Design Notes 10 —*
