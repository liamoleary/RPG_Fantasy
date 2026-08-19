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

## Honored edge rides slightly hot

**Status:** accepted for now. Power-matched, the side with more Honored
stacks wins +10% over the Veteran control (flag is 8%). DN10 already raised
the default thresholds ([12,24]→[14,28] etc.) which pulled end-of-run Honored
adoption from 81% to 68%. The remaining edge is the milestone feeling earned
— fun-first, per the DN10 mandate. If a future pass wants it flatter, flatten
the *rewards* (frenzyPlus/growthPlus magnitudes), not the thresholds.

**The number that fails:** `npm run sim` → `RANKS … Honored edge over the
control` above +8%.
