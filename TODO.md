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
Deep Halls` and `… Sunlance Ballistier` above +8%.

## Honored edge rides slightly hot

**Status:** accepted for now. Power-matched, the side with more Honored
stacks wins +10% over the Veteran control (flag is 8%). DN10 already raised
the default thresholds ([12,24]→[14,28] etc.) which pulled end-of-run Honored
adoption from 81% to 68%. The remaining edge is the milestone feeling earned
— fun-first, per the DN10 mandate. If a future pass wants it flatter, flatten
the *rewards* (frenzyPlus/growthPlus magnitudes), not the thresholds.

**The number that fails:** `npm run sim` → `RANKS … Honored edge over the
control` above +8%.
