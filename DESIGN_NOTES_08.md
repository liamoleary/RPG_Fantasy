# BANNERFELL — Design Notes 08: The Long Campaign

Companion to `GAME_DESIGN.md` and `DESIGN_NOTES_01–07`. Where this conflicts
with an earlier doc's pacing targets — GDD §13's "median run ≤ 14 rounds", and
the run-length ceilings in the balance harness — **this doc wins.** Those
targets were written to protect a short session. That constraint is withdrawn.

---

## 1. The complaint

> "I'm not feeling as if the game's going long enough. I want to be able to
> really feel my board getting powerful. I don't feel like I have enough
> opportunity to really flesh out my boons and get a full board of minions.
> Can we remove the need for a quick game and just focus on optimising total
> fun and feeling like you are deserving your power and win."

Three separate things are being asked for, and only one of them is length:

1. **The run is too short.**
2. **The growth systems never finish.** Boons, board slots, Banner Ranks — the
   player is describing arriving at the end of a run still in the early game.
3. **Power should feel earned.** Not handed over, and not hit by accident.

## 2. What the numbers say

Measured, not estimated. 400 lobbies at standard difficulty, the player driven
by the same rival policy the balance harness uses, on the shipped engine.

```
  rounds survived      median 10    avg 9.9    min 6    max 15
  board slots filled   median 5 / 7            avg 4.5
  units on the board   median 30               avg 32.8
  camp tier reached    median 5 / 5            avg 4.7
  talent points spent  median 5 / 6            avg 4.7
  deepest branch       median 2 / 5            avg 2.6
  Honored stacks       avg 0.17 per run
  gold earned all run  avg 76      unspent at the end: 1.0

  runs that ever filled all 7 board slots        6.5%
  runs that reached a tier-5 talent capstone     1.3%   (43.5% for a player
                                                         who commits to one
                                                         branch and never
                                                         dips — the harness's
                                                         focused policy)
  runs that spent all 6 talent points           23.3%
```

By finishing position:

```
  place    rounds   slots/7   units   camp tier   points   deepest branch
  1st       12.7      5.3      54.3      5.0        5.9        3.1
  2nd       12.6      5.7      47.9      5.0        5.9        3.0
  4th       10.1      4.7      31.8      4.9        4.9        2.7
  6th        8.4      3.9      23.5      4.6        4.0        2.4
  8th        7.1      3.6      18.7      4.1        3.3        2.2
```

**The player is right on every count, and the numbers are worse than the
complaint.** A median run is ten rounds. A median board has five of seven
slots filled and never sees the other two. A median build is two tiers deep in
a five-tier ladder. Winning the whole lobby gets you 3.1 tiers and 5.3 slots.
Honored — the top Banner Rank, the thing the card art and the chevrons are for
— appears roughly once every six runs.

## 3. The diagnosis: the run doesn't end too early, it stops growing too early

This is the finding that decides the shape of the fix. Every growth system in
the game tops out at or before round 8:

| system | where it stops | how it stops |
|---|---|---|
| Gold income | **round 8** | `min(10, 2 + round)` — flat at 10 forever after |
| Camp tier | **~round 8** | 5+6+7+8 = 26 gold buys every tier there is |
| Board slots | never opens | 7 slots from round 1; nothing unlocks |
| Talent points | round 12 | but the median player is dead at round 10 |
| Banner Ranks | unreachable | Honored needs 24 in one stack; a whole board averages 30 |

The median player survives to round 10. The lobby winner survives to 13. So
**the last third of every run is a plateau** — the same ten gold, the same
maxed camp, the same seven slots, buying the same three recruits a round. The
board stops getting stronger and starts getting *replaced*.

That is exactly what "I don't feel my board getting powerful" describes, and
it means **length alone would make it worse.** Twenty rounds on this curve is
eight rounds of growth and twelve rounds of plateau. The curves have to be
stretched to fit the longer run, or the longer run is just a longer flat bit.

## 4. Design goals

1. **A run should last about twice as long, and every extra round should carry
   growth.** Target: a top-half finish plays ~16–18 rounds, up from ~10–12.
2. **The growth systems should finish inside a good run, and only inside a
   good run.** Filling the board, capstoning a branch and fielding an Honored
   stack should each be reachable — and none of them should be automatic.
3. **Power should be spent for, not handed out.** Every new ceiling below is
   something you buy or earn, not something the round counter gives you.
4. **Session length is no longer a design constraint.** GDD §13's "median run
   ≤ 14 rounds" is withdrawn. A run may take half an hour.

Non-goal, stated so it does not creep in: this is not a difficulty increase.
The player wants a longer arc, not a harder one. §4.6 exists to keep the
lengthened run from becoming a slog of unloseable rounds at the end.

## 5. The changes

### 5.1 Attrition — the run is longer because it is survivable, not because it is slower

Rounds are not added; deaths are made to take longer. Today: `START_HP = 30`,
banner damage is `ceil(round / 2) + Σ(tiers of the winner's survivors)`, capped
at 15. At round 8 a typical loss costs 12–15 — a third to a half of your total
health. Three bad rounds ends a run, which is why the median is ten.

- **`START_HP` 30 → 50.**
- **Damage ramps instead of flat-capping.** `ceil(round / 3) + tierSum`, capped
  at `min(20, 4 + round)`. Early losses cost 5–8 (you are still building and a
  bad round should not be fatal); late losses cost 16–20 (by then you have a
  board worth losing).
- **`HARD_CAP_ROUND` 16 → 26**, Sudden Death from round 22, and its bite grows:
  `5 + (round - 22) * 3` rather than a flat 5, so a stalemate still resolves
  inside two or three rounds.

The intent is a run that forgives the early game and does not forgive the late
one. That, on its own, is worth saying out loud: **the early game becoming
low-stakes is a feature here, not a side effect.** It is the "build your board"
phase the complaint is asking for.

### 5.2 Economy — uncap income, and give late gold somewhere to go

Income caps at 10 at round 8 and never moves again. That is the plateau's
engine. Two changes:

- **`income = min(18, 3 + round)`** — reaches its ceiling at round 15 instead
  of round 8, and the ceiling is 80% higher. A twenty-round run earns ~250 gold
  against today's ~172 over sixteen.
- **Warband Standards: a repeatable sink once the camp is maxed.** Tier 5 is
  currently the end of the camp's ladder and arrives around round 8. After it,
  a **Standard** costs `12 + 4 × (standards raised)` and grants a choice of:
  - **Banner** — one more board slot (up to the §5.3 cap)
  - **Muster** — +1 permanent count to every stack of one line you field
  - **Provision** — +2 income for the rest of the run
  This is the single largest addition in the doc and the one that most directly
  answers "deserving your power": late gold buys permanent, visible, chosen
  power instead of a fourth copy of a unit you already have.

### 5.3 The board — slots you open, not slots you are given

Seven slots, 6.5% of runs fill them. Adding slots without economy makes that
worse, so this lands with §5.2 and not before.

- **Nine slots at maximum: 4 front + 5 back**, up from 4 + 3. (DN06's eighth
  slot is the first of these; the ninth is new here.)
- **You start with six** — 3 front, 3 back — and open the rest:
  - 7th at **camp tier 3**
  - 8th at **camp tier 5**
  - 9th from a **Banner Standard** (§5.2)

Starting *below* today's seven is deliberate. A board that is full from round 1
because you cannot afford to fill it teaches nothing; a board that visibly
grows is the thing being asked for. The early game gets tighter and more
readable, and "my board got bigger" becomes an event that happens three times a
run rather than never.

DN07 §6.1 already requires the grid to hold eight slots at ≥86px on a 390pt
screen, and it does — every cell has always been sized as a quarter of its row.
A five-slot back line needs the same treatment and no more.

### 5.4 Talents — ten points, and a ladder you can actually climb

Six points across a five-tier ladder, and the median player spends five of them
to reach tier 2. The ladder was built to be walked and almost nobody walks it.

- **`LEVEL_UP_ROUNDS` [2, 4, 6, 8, 10, 12] → [2, 3, 5, 6, 8, 9, 11, 12, 14, 16]
  — ten points**, spread so the cadence stays roughly every other round rather
  than clumping.
- Ten points across three branches with a five-tier ladder means a capstone
  (5) plus a solid second branch (4) plus a dip, or three branches at 3–4. Both
  are builds. Neither is everything, which is the point — **fleshing out your
  boons should mean choosing a shape, not filling a checklist.**
- The tier-4 forks stay. With ten points a player reaches them reliably instead
  of theoretically, which is also the only way the fork-health problem in §7
  ever gets real data.

### 5.5 Banner Ranks — make the top one reachable, and add a top above it

Honored needs 24 units in a single stack. A whole median board is 30 units.
Average Honored stacks per run: 0.17. The chevrons on the card, the rank
panel in the inspect sheet and the promotion art are all built for a thing
that essentially does not happen.

- **Lower the thresholds** by roughly a third: 3-muster lines `[12, 24] → [8,
  16]`, 2-muster `[8, 16] → [6, 12]`, 1-muster `[4, 8] → [3, 6]`.
- **Add a third rank, Legendary**, at double the Honored threshold (16 → 32 for
  a 3-muster line). Reachable only in a long run with a committed line, which
  makes it the trophy the current Honored was trying to be.
- **Flatten the per-rank payoff as the ranks get easier.** The harness already
  flags Honored at +9.0% power-matched edge with a "raise thresholds or flatten
  rewards" warning; making Honored *easier* without touching its reward would
  make that worse. Roughly: keep the total power of Veteran+Honored where it is
  today, and let Legendary carry the flourish.

### 5.6 Camp tier — unchanged

Tier 5 in ~26 gold by round 8 is fine now that §5.2 gives gold somewhere to go
afterwards and §5.3 hangs board slots off tiers 3 and 5. The camp ladder does
not need to be longer; it needs to stop being the only thing gold buys.

### 5.7 Pacing inside the round — already shipped

The round loop lost its dead page in the commit that referenced this doc: the
result screen between every battle and the next Muster is gone, replaced by a
verdict stamped over the final board that advances itself after 2.2 seconds.
That was the same problem at a smaller scale — a run that is going to be twice
as long cannot afford a page you always dismiss on every round. Recorded here
so the `DN08` references in `OutcomeFlash.tsx` and `store.ts` have a home.

## 6. What we are explicitly not doing

- **Not adding rounds by slowing the lobby down.** No extra Muster phases, no
  "rest rounds", no rounds without a battle. Length comes from surviving
  longer, which is a thing the player does, not a thing the clock does.
- **Not raising difficulty.** §5.1 makes the early game *more* forgiving.
- **Not touching the battle engine.** Every change here is run-scope: HP,
  damage, income, slots, level-up cadence, rank thresholds. The exchange loop,
  targeting, keywords and Apex are untouched.
- **Not making the board bigger than 9.** Four rows of five would break DN07's
  card anatomy on a 390pt screen and the front/back read that DN03 §3 fixed.
- **Not adding a second currency.** Warband Standards are bought with gold.

## 7. The thing that will spoil this if it is not fixed first

The balance harness, run today at 600 lobbies:

```
  FACTION      avg place   win%
  verdant           2.80    32.5%    target 4.2–4.8
  stormtide         5.10     2.4%
  vanguard          5.57     2.8%

  12 units with a >8% win-delta against their tier baseline
  fork health: 6 of 18 forks inside 30–70% (§8.7 wants ≥80%)
```

**Verdant wins a third of all lobbies; Vanguard and Stormtide win under 3%
each.** A longer run compounds an advantage rather than diluting it — more
rounds means more time for a stronger faction to snowball, and every number in
§2 gets *further* apart between the good faction and the bad ones.

So the honest sequencing is: **the length work in §5 will make the game feel
worse, not better, if it ships on top of this balance.** Either the faction
spread comes inside 4.2–4.8 first, or the two land together. I would not ship
§5 alone.

This is a bigger piece of work than everything else in this document and it is
not specified here; it needs its own pass with the harness.

## 8. Acceptance criteria

Measured with the balance harness and the run-arc script, both at standard
difficulty, 400+ lobbies.

1. **Length.** Median rounds survived by the player ≥ 16 (from 10). Median
   lobby length ≤ 24 rounds, p95 ≤ 26.
2. **The board fills.** ≥ 60% of runs field every slot they have opened, and
   ≥ 35% open all nine (from: 6.5% fill seven).
3. **Builds finish.** Median deepest branch ≥ 4 of 5 (from 2). ≥ 50% of runs
   reach a tier-5 capstone under the *spread* policy, not just the focused one
   (from 1.3%).
4. **Ranks happen.** ≥ 60% of runs finish with at least one Honored stack (from
   ~15%); ≤ 15% reach Legendary. Honored's power-matched edge back under +8%.
5. **Gold stays tight.** Average unspent gold at the end of a run ≤ 4. If the
   §5.2 uncap leaves players sitting on gold, the sink is too weak.
6. **Growth never flatlines.** For every round from 1 to the median run length,
   the player's average board power at round N must exceed round N−1 by a
   measurable margin. This is the criterion that actually encodes the
   complaint, and the only one that catches "we made it longer and flatter".
7. **Balance holds.** Faction average placement inside 4.2–4.8, no unit with a
   >8% win delta, per §7.
8. No engine changes; all existing tests pass; new tests for the changed
   curves.

## 9. Commits

1. `feat(balance): faction pass — bring the spread inside 4.2–4.8` (§7 — first,
   and not optional)
2. `feat(run): longer campaign — 50 HP, ramped damage, sudden death at 22`
3. `feat(camp): uncap income and add Warband Standards`
4. `feat(board): nine slots, opened by camp tier and Standards`
5. `feat(talents): ten points on the same ladder`
6. `feat(ranks): reachable Honored, add Legendary, flatten the curve`
7. `chore(sim): run-arc harness + the §8 acceptance table`

Commits 2–6 each move a curve, so each one should be measured on its own before
the next lands — the harness run is three seconds and the failure mode here is
six changes that are individually fine and collectively a different game.

*— End of Design Notes 08 —*
