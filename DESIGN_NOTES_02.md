# BANNERFELL — Design Notes 02: ranged legibility and the Cover keyword

Companion to `GAME_DESIGN.md` and `DESIGN_NOTES_01.md`. Same rule as before: where this conflicts with the GDD, this wins.

---

## 1. The problem, diagnosed in the code

Playtest report: *"my back line is being killed for no reason."*

It isn't a bug. `chooseTarget` in `src/engine/battle.ts` works exactly as the GDD specifies: melee must chew through the front row, but **Volley picks a fully random enemy stack in any row** (`ctx.rng.pick(foes)`), **Siege hunts the highest-Bulwark stack anywhere**, and hero spells ignore rows entirely. Ten of the 38 units carry Volley, so about a quarter of every enemy board shoots over the wall.

The bypass itself is correct and stays. If the back row were safe, the dominant strategy in every lobby would be one cheap tank in front of six glass cannons, and every front-row unit past the first would be dead weight. Ranged pressure is what makes Bulwark, the Shieldmaiden, and the front/back decision mean anything.

What's actually wrong is two things sitting on top of a correct rule:

1. **It's illegible.** The battle playback doesn't visually distinguish a volley from anything else, so a back-row death reads as random HP loss — correct design perceived as a bug. In Might & Magic you *watch the arrow arc over the wall*; that's why it never feels unfair there.
2. **There's no counterplay.** Nothing the player buys or positions protects a specific back-row stack. Unavoidable damage is what feels bad — not damage.

The fix: keep the rule, show the rule, and make it outplayable through positioning. **No taunt keyword** — the front row already *is* taunt against melee, and taunt-vs-ranged would delete Volley's identity.

---

## 2. NEW KEYWORD — Cover X

> **Cover X:** the first X times each battle a volley targets a back-row stack this unit is covering, this stack is struck instead.

### 2.1 Exact rules (engine)

- **Coverage map.** The board is 4 front slots over 3 back slots, offset like bricks: back slot `b` is covered by front slots `b` and `b+1`. (Equivalently: front slot `f` covers back slots `f-1` and `f`, clamped to 0–2.)
- **Resolution.** In `chooseTarget`, after a volley attacker has picked its target: if the target is in the back row, and a covering front-row stack is alive with Cover charges remaining, the attack is **redirected** to that coverer and one charge is consumed. If both covering slots qualify, the one with more remaining charges intercepts (ties: lower slot index). Emit a `cover` event carrying attacker, original target, and interceptor — the UI needs all three.
- **Charges** are per-battle (`coverLeft`, reset in battle setup like Bulwark), not per-round scaling — a big late-game Cover wall should require investment, not time.
- **Siege ignores Cover.** Siege already ignores Bulwark; it is the designed counter to the protection package. This creates a clean triangle: Volley beats open back lines, Cover beats Volley, Siege beats Cover.
- **Spells ignore Cover.** Spells are the hero's domain; hero-level protection is boon territory, not unit territory.
- **The redirected hit resolves normally** against the coverer (Bulwark applies, casualties trigger Frenzy, etc.). No retaliation — volley never provokes it.
- **Melee is untouched.** Cover changes volley resolution only.

### 2.2 Who gets it (data changes)

Keep it scarce — Cover is a Vanguard-flavoured tool with one neutral copy, not a universal keyword:

| Unit | Change |
|---|---|
| `vg_shieldmaiden` (T3) | + **Cover 2** — the natural home; she's already the Guard/Bulwark unit |
| `mc_pikewall` (T3) | + **Cover 1** — the neutral option every faction can hire |
| `vg_colossus` (T5) | + **Cover 2** — the late-game wall covers the artillery behind it |

And one new **Might-branch boon**, any hero can draw it: **Overwatch** — *"Your front-row stacks gain Cover 1."* This is the build-around version: a full Overwatch front line blanks four volleys a battle.

No Verdant or Stormtide units get Cover. Protection is Vanguard identity; the other factions answer ranged pressure their own way (Verdant outheals it, Stormtide out-tempos it), and mercs sell the budget copy.

### 2.3 Banner Rank hook (optional, nice)

`vg_shieldmaiden` Honored reward becomes: *"Cover charges +2."* This replaces her current Honored reward only if the sim shows it isn't a downgrade; otherwise leave as is.

---

## 3. Legibility (UI — this half matters as much as the keyword)

1. **Volleys arc.** Volley attacks get a distinct animation: a projectile that arcs visibly *over* the front row from attacker to target (a CSS-animated dot/streak along a curved path is enough — this is readability, not spectacle). Melee keeps its lunge. A player must be able to tell the two apart with the sound off at 2× speed.
2. **Cover reads as a save.** On a `cover` event: the volley arc bends to the interceptor, the coverer flashes its shield, and a floating label — the same float system as damage numbers — says **"Covered!"**. The saved back-row stack briefly glows. This moment is the entire payoff of the feature; if the player can't see the save, Cover doesn't exist.
3. **Remaining charges visible.** A small shield-dot pip per remaining Cover charge on the card (both in Muster and battle), same visual family as rank pips but clearly distinct.
4. **Scout sheet shows the threat.** `ScoutSheet` (in `MusterScreen.tsx`) gets one line under the hero row: **"Ranged threat: N volley stacks, M siege"**, computed from the scouted board. This is what turns "my shaman died randomly" into "I saw 3 volleys coming and stood my Shieldmaiden in front of my shaman."
5. **Keyword text updates.** The keyword glossary and inspect sheet get Cover's plain-language text, and Volley's text gains: *"Volleys can strike any row — Cover units can intercept them."*

---

## 4. Balance guardrails (sim harness)

Add to `scripts/sim.ts` output:

- **Deaths by row** — % of battles in which at least one back-row stack is wiped, before/after Cover.
- **Volley unit win-delta** after the change; if Volley units fall off the pick table, Cover charges are too cheap — first lever is reducing Overwatch to specific-hero pools, second is dropping Colossus to Cover 1.
- **Cover carrier win-delta** — Shieldmaiden must stay inside the GDD §13 ±8% band; she's now doing two defensive jobs.

Expected effect size: modest. Cover 2 on one unit blanks two of the ~6–10 volleys a mid-game battle throws; it's a positional answer, not immunity.

---

## 5. Tests (engine)

New cases in `tests/battle.test.ts` (or a new `cover.test.ts`):

1. Volley at a covered back stack redirects to the coverer and consumes a charge.
2. Charges deplete: the (X+1)th volley goes through to the original target.
3. A dead coverer intercepts nothing.
4. Siege at a covered back-row stack is **not** redirected.
5. Spell damage (Chain Lightning) at a covered stack is **not** redirected.
6. Coverage map: back slot 2 is covered by front slots 2 and 3, and by nothing else.
7. Determinism: same seed, same battle, with Cover in play.

---

## 6. Acceptance criteria

1. All existing tests pass; new Cover tests pass; sim runs clean with the new columns.
2. In a battle at 1× speed, a first-time viewer can point at a volley and say which unit fired it and who it hit; a Cover save is unmistakable.
3. Scouting shows the ranged-threat line for every opponent.
4. Cover charges are visible on the card in both Muster and battle.
5. Shieldmaiden, Pike Wall, Colossus and the Overwatch boon are the only sources of Cover.
6. `feat/card-art` note: if the art branch is merged first, the Cover pips must stay legible over painted plates (same backing-chip treatment as rank pips).

---

## 7. Out of scope, deliberately

- No taunt keyword, no melee targeting changes, no volley targeting weighting — random stays random; the answer is interception, not aim control.
- No new faction mechanics; Verdant/Stormtide answers to ranged pressure already exist in their kits.
- No hero-spell protection (a future boon can do this if spells over-dominate late lobbies).

*— End of Design Notes 02 —*
