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

## Honored edge rides slightly hot

**Status:** accepted for now. Power-matched, the side with more Honored
stacks wins +10% over the Veteran control (flag is 8%). DN10 already raised
the default thresholds ([12,24]→[14,28] etc.) which pulled end-of-run Honored
adoption from 81% to 68%. The remaining edge is the milestone feeling earned
— fun-first, per the DN10 mandate. If a future pass wants it flatter, flatten
the *rewards* (frenzyPlus/growthPlus magnitudes), not the thresholds.

**The number that fails:** `npm run sim` → `RANKS … Honored edge over the
control` above +8%.
