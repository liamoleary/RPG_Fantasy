# Tracked debt

Things that are correct today and will silently become wrong when something
else lands. Each entry names the trigger, the work, and the test that fails
when the trigger fires — an entry with no failing test is a note, not a TODO.

*(The former entry here — re-pointing War Tiers 6 and 7 against the DN08
economy — was discharged by removal: DN10 deleted the War Tier ladder
entirely, along with `tests/tiers.test.ts` that guarded it.)*

## War Council fork health (DN10 leftovers)

**Status:** open. The DN10 balance pass fixed the one *strictly dominated*
fork option (Spymaster now widens the camp instead of duplicating Haggler's
free rerolls), but the harness still reports only 5/18 forks inside the
30–70% pick band. The worst skews: Haggler over Wider Camp at command T2
(~75/25 in every faction), Grand Marshal over Spymaster at command T4, and
the Echoing spell-cast nodes losing ~80/20 at magic T2.

**Why it can wait:** shares are measured by the harness's softmax policy, not
by humans, and no remaining option is strictly worse — the skew is taste, not
dominance. A proper pass should tune the losing options' payloads (not the
scorer's weights) and re-measure.

**The number that fails:** `npm run sim` → `FORK HEALTH … §8.7 wants ≥80%`.

## The win-delta metric measures selection, not power (DN12 commit 5)

**Status:** open, and it changes what the DN12 §7.10 balance pass can achieve.

DN12 commit 5 was an accidental controlled experiment. It cut the Sunforged
Champion's ATK from 4 to 3 — one number, strictly weaker, nothing else about
the unit touched except gaining a counter-attack worth ~1.6 points. The metric
moved like this, `--runs 4000`, seeds 12345 / 999:

| Champion | ATK | win-delta | n |
|---|---|---|---|
| before (commit 4) | 4 | +20.0% | 672 |
| Bloodlust only | 4 | +21.6% / +21.7% | 672 / 664 |
| Bloodlust **+ the cut** | 3 | **+30.5% / +27.0%** | **170 / 183** |

**Cutting the unit made its win-delta nine points worse, and its sample fell by
three quarters.** Vanguard's own average place did not move at all (4.32).

**The read.** The nerf worked exactly as intended on the board — the harness's
player policy stopped taking the Champion branch of the Footman fork, 672 boards
down to 170. What is left is a self-selected rump: the boards that still build a
Champion after it got worse are the boards where it was already winning. The
metric then reports that rump's win rate as the unit's strength.

So `UNIT WIN-DELTA` is not measuring how strong a unit is. It is measuring how
strong the boards that chose it are, and cutting a unit *raises* the number by
shrinking and enriching that population. This is the same signal the Runelord
entry below has been circling since DN11 — "two rounds of cuts barely moved it"
— stated as a mechanism rather than a suspicion, and now with a controlled case
where the only change was one stat on one unit.

**What it means for §7.10.** The balance pass is asked to bring the Champion and
the Runelord "back under the ±8% flag". On this evidence that is not reachable
by tuning: every cut shrinks n and pushes the delta up. Either the pass changes
what the metric measures (weight by board, or report the delta against boards
that were *offered* the unit rather than boards that took it), or the acceptance
criterion changes. Cutting harder is the one thing that is now known not to work.

**The number that fails:** `npm run sim` → `UNIT WIN-DELTA … Sunforged Champion`
and `… Runelord of the Deep Halls`, both far above +8% and both rising as their
samples fall.

## The Aegis Warden is genuinely overpowered (DN12 commit 6)

**Status:** open, and unlike everything else on this branch it is a REAL power
reading rather than the selection artefact above.

The thrown shield lands at **+18.3% (n 1263)** and **+19.1% (n 1158)**, seeds
12345 / 999. The sample is an order of magnitude larger than the Champion's
(n 167) or the Runelord's (n 378), so this is not a self-selected rump: a
thousand-odd boards took the unit and it won on them.

DN12 §3.4 called this in advance — "total damage across a full board is
enormous, so the decay and the base number are the whole balance job". Measured
on a full seven-stack board, ATK 4:

| stack | one swing | hops landed | arc total | x one swing | stacks hit twice |
|---|---|---|---|---|---|
| 4 | 16 | 10/14 | 57 | 3.56x | 3/7 |
| 8 | 32 | 13/14 | 121 | 3.78x | 6/7 |
| 11 | 44 | 14/14 | 166 | 3.77x | 7/7 |
| 14 | 56 | 14/14 | 214 | 3.82x | 7/7 |

Two things fall out. The multiplier is capped near **3.8x** — the geometric
ceiling of x0.75 is 4x and flooring every hop keeps it under — so the arc
cannot run away; doubling ATK doubles the total rather than compounding it.
And **"2 full passes" is a cap the arithmetic rarely reaches**: below 11 units
the decay hits zero first, and at a typical 4-unit T4 only three of seven
stacks are struck twice.

**The lever.** §6 fixes the decay at x0.75 and the passes at 2, so ATK is the
only knob, and it is close to linear in the total. It shipped at 4 rather than
a Champion's 5 for exactly this reason. On these numbers 3 is the obvious next
try, and unlike the Champion this unit's sample is big enough that a cut should
show up honestly rather than through the selection effect.

**Not cut in commit 6** because §7.10 owns balance and one seed pair is a
reading rather than a pass. It is the strongest candidate on the branch for an
actual tuning change.

**The number that fails:** `npm run sim` → `UNIT WIN-DELTA … Aegis Warden`
above +8%.

## Runelord win-delta: read before acting (DN11)

**Status:** open, deliberately not acted on. The Runelord of the Deep Halls
reads **+19.8% win-delta (n=302)** at 4000 lobbies, far past the ±8% flag. Two
rounds of cuts barely moved it — halving the Runesmith's grant took it 21.5% →
19.2%, halving the Runelord's own took it → 18.8% — which is why the number
was checked before being cut into a third time.

> **Re-measured after DN12 commit 2** (`--runs 4000`, seeds 12345 / 999). The
> Colossus and Shieldmaiden lines gained roots, which took `vg_shieldmaiden`
> and `vg_colossus` out of the camp and left the Vanguard counter with nothing
> at T2 or T5 (see the entry below). The Runelord went the wrong way — **+28.3%
> (n=384) and +27.7% (n=363)** — and the Sunlance Ballistier followed it,
> **+9.5% → +13.3%** while its sample nearly halved, 1607 → 908. The Champion
> moved the other way on its own, +21.7% → +18.3%, with no stat change.
>
> This is the same rarity signal the table below already describes, arriving
> now for a second unit: the Ballistier got rarer and its delta rose. Nothing
> here was cut in response, per the reasoning below — the lever is the camp
> hole, not the Runelord's payload, and the path-share column still has to land
> before either is touched.
>
> **Running figures**, seed 12345 at 4000 lobbies, so the entry is never read
> against a stale snapshot:
>
> | after commit | Champion | Runelord | Ballistier | Colossus | Vanguard |
> |---|---|---|---|---|---|
> | 1 (baseline) | +21.7% n882 | +19.8% n302 | +9.5% n1607 | — | 4.36 |
> | 2 roots | +18.3% n727 | +28.3% n384 | +13.3% n908 | +8.0% | 4.34 |
> | 3 deflect | +17.8% n729 | +27.1% n387 | +14.1% n911 | +8.9% | 4.29 |
> | 4 raise | +20.0% n672 | +27.1% n387 | +13.6% n908 | +8.0% | 4.32 |
> | 5 bloodlust + cut | +30.5% n170 | +27.5% n386 | +13.3% n908 | +7.9% | 4.32 |
> | 6 aegis fork | +29.4% n167 | +28.7% n378 | +13.3% n905 | +8.0% | 4.32 |
>
> Commit 4 gave the Champion's fork twin a heal and a Raise and the Champion
> went UP, +17.8% → +20.0%, while its sample fell 729 → 672. A third instance
> of the same signal: boards moved to the Bannerguard, the Champion got rarer,
> and the rarer branch reads higher. The Bannerguard itself stayed inside the
> ±8% flag after both gifts.

**The read.** Printed side by side, the fifteen T4 line tops span **+21.7% to
−11.5%**, so "apexes all ride high" is false as a class effect and the delta is
not pure survivorship. But the Runelord is not a lone outlier either: the
single highest is **Sunforged Champion at +21.7% (n=882)** — a legacy form DN10
balanced and shipped, recorded there as "+8.0%, riding the line".

The fork pairs are the sharpest cut of it. Each pair costs exactly the same to
reach — same root, same tier, same two promotions:

| pair | rarer branch | commoner branch |
|---|---|---|
| Footman fork | Champion **+21.7%** (n 882) | Bannerguard **+4.1%** (n 5148) |
| Forgeline | Runelord **+19.8%** (n 302) | Anvilborn **+4.7%** (n 4666) |
| Whelpline | Deepmaw Alpha −2.3% (n 847) | Tempest Wyvern +7.6% (n 2505) |

Vanguard's two pairs show the rare branch reading ~4–5× the common one at
identical cost. Stormtide's pair inverts, so rarity is not a law — but in both
Vanguard cases the two highest deltas in the game are Vanguard apexes, and
Vanguard is the strongest faction (4.36). That points at something structural
about how Bulwark scales in long battles rather than at a Runelord bug.

**Why it can wait:** acting now would be cutting a card on a number that has
already proved unresponsive to cuts, while the same number brands an accepted
legacy unit higher. The evidence that would settle it is the §6.1 path-share
column landing in commit 7: if the Runesmith branch is auto-picked over the
Warsmith branch, the Runelord edge is real and commit 8 cuts it. If the branches
split inside 35/65 while the delta stays high, the metric is measuring which
boards reach a rare form, and the lever is Vanguard's Bulwark curve instead.

**The number that fails:** `npm run sim` → `UNIT WIN-DELTA … Runelord of the
Deep Halls` above +8%, and `PATH HEALTH` (commit 7) outside 35/65 for the
Forgeline.

## The Vanguard camp has no T2 and no T5 (DN12)

**Status:** open, opened by DN12 commit 2. DN10 §3 sells only line roots, so
giving the Shieldmaiden and Colossus lines roots took both units off the
counter. What is left sellable in the Vanguard pool is:

| | |
|---|---|
| T1 | Militia, Crossbow Levy, Mule Cart, Shield Girl, Cairn Whelp, Forge Apprentice |
| T2 | — |
| T3 | Battle Cleric |
| T4 | Cannon Crew |
| T5 | — |

Verdant and Stormtide still cover T1–T5 with something of their own. Vanguard
is the only faction where reaching camp tier 2 unlocks nothing it can buy, so
the tier weighting (`1 / (1 + (campTier - unitTier) × 0.35)`) spends those
rolls on T1s.

**Why it matters more than a shifted distribution.** This is the most likely
cause of the Runelord and Ballistier deltas above: gold that used to buy a
Shieldmaiden at T2 now flows into the two lines whose roots are still cheap,
and both lines end in a flagged form. It also invalidates the DN10 rationale
still written on `vg_shieldmaiden` — she was moved to T2 precisely so the camp
had a Vanguard body at that tier.

**Why it can wait:** DN12 §7.10 makes the last commit a balance pass, and this
is exactly what that pass is for. It cannot be fixed by tuning, though — the
hole is structural. Closing it means a new Vanguard root at T2 and at T5, or
re-tiering something already sellable, and that is a data decision rather than
a dial.

**The number that fails:** `npm run sim` → `UNIT WIN-DELTA … Runelord of the
Deep Halls`, `… Sunlance Ballistier` and `… Mountain Colossus` above +8%.

The Colossus joined that list in commit 3, +8.0% → +8.9% (n 6776), when The
Bulwark gained its Deflect charge — a stronger mid-form hands the capstone more
boards in better shape. Vanguard drifted 4.34 → 4.29 in the same commit, still
inside 4.2–4.8. Both are the camp hole showing through a second time: the line
is the only door to the Colossus now, so everyone who has one walked it.

## Honored edge rides slightly hot

**Status:** accepted for now. Power-matched, the side with more Honored
stacks wins +10% over the Veteran control (flag is 8%). DN10 already raised
the default thresholds ([12,24]→[14,28] etc.) which pulled end-of-run Honored
adoption from 81% to 68%. The remaining edge is the milestone feeling earned
— fun-first, per the DN10 mandate. If a future pass wants it flatter, flatten
the *rewards* (frenzyPlus/growthPlus magnitudes), not the thresholds.

**The number that fails:** `npm run sim` → `RANKS … Honored edge over the
control` above +8%.
