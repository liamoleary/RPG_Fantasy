# BANNERFELL — Design Notes 11: Roots & Ruin

Companion to `GAME_DESIGN.md` and `DESIGN_NOTES_01–10`. Builds on the DN10
"Back to the Fun" state (War Tiers removed, base-forms-only camp, 19–23 round
runs, balanced factions). Where this conflicts with an earlier doc, **this doc
wins.** Nothing here reintroduces mid-run rule changes or meta-ladders — the
game stays "pick a banner and play"; everything below happens *inside* one run
because of choices the player made inside that run.

---

## 1. The asks

> "I want more cards that evolve in every clan. I want minions that only
> appear depending on your decisions — if you pick a seed character you start
> getting more seed characters that grow into different trees. I want games to
> go for much longer. And I want breaks from fighting other players: a PVE
> fight against a boss with a different set of characters. Beat the boss and
> some of its cards start showing up in your tavern, with a low chance, and
> you can add them to your warband. The bosses are very hard and there is a
> chance you will fail."

Four asks, one theme: **the run should react to you.** More promotion lines,
lines that *fork*, a camp whose stock is shaped by what you drafted, and a
mid-run trial whose reward is a card pool nobody else at the table has. This
note specifies all four as data + engine + UI, in the DN10 spirit: no rule the
player can't read, no content behind a meta-grind, everything sim-tuned.

The four systems, named:

| # | System | One-liner |
|---|---|---|
| §2 | **Forked lines** | `lineNext` becomes `linePaths[]`; promoting can be a *choice* of what the stack becomes |
| §3 | **The Kinship Camp** | units carry a `kin` tag; owning a kin tilts the offer toward it and unlocks kin-locked cards |
| §4 | **The longer war** | round cap 26 → 30, banner 70 → 80, pacing target median 24–27 |
| §5 | **The Trials** | three PVE boss rounds vs boss-only Courts; win → that Court's cards haunt *your* tavern |

---

## 2. Forked lines — evolution as a decision

### 2.1 The data change

```ts
// before                         // after
lineNext?: UnitId                 linePaths?: UnitId[]   // 1 or 2 entries
```

Every existing line migrates mechanically (`lineNext: x` → `linePaths: [x]`)
and behaves exactly as today. A unit with **two** entries opens the **Path
choice sheet** on Promote: two full-size cards side by side, pick one, the
whole stack transforms (count preserved, halved-intake training per DN04 §1.1
unchanged). The choice is permanent for that stack — but you can run *two*
stacks of the same root down different paths, which is the new toy.

Camp rule from DN10 §3 is untouched and load-bearing: **the camp still only
ever sells line roots.** Every forked form is made at the Promote button,
never bought. Nothing about this system adds shop confusion.

### 2.2 One new forked line per clan (15 new units)

Each clan gains a T1 root that forks at T2 into two identities, each ending in
a T4 apex. Roots are deliberately weak on arrival — the DN10 mandate that
power is *earned* applies doubly to a card whose whole pitch is "this will
become something."

**The Verdant Court — the Seedline** *(the ask, made literal)*

| Tier | Unit | Sketch | Role |
|---|---|---|---|
| 1 | **Whisperseed** | 0/3, any row, muster +3, Growth | A sleeping seed-spirit. It is nothing yet, and it could be anything. |
| 2a | **Oakfather Sapling** | 1/6, front, Growth | → the tank tree |
| 4a | **Oakheart Ancient** | 4/12, front, Guard; battle start: adjacent stacks +1 HP per Growth tick this run | The wall that remembers every Muster it survived |
| 2b | **Blackthorn Sapling** | 3/2, front, Venom 1, Growth | → the killer tree |
| 4b | **Blackthorn Reaper** | 6/6, front, Venom 2, Cleave | Growth ticks also add +1 Venom (cap 5) |

*(A third path — the Willow healer tree — is authored in the appendix as the
first post-ship path; the Path sheet UI supports 2 at launch, 3 later. Ship 2,
prove the sheet, widen after.)*

**The Iron Vanguard — the Forgeline**

| Tier | Unit | Sketch | Role |
|---|---|---|---|
| 1 | **Forge Apprentice** | 1/3, back, muster +3; end of Muster: +1 Bulwark to a random friendly front stack | An anvil-boy with a bucket of rivets |
| 2a | **Runesmith** | 1/5, back; her Bulwark grants become +2 and she picks the *lowest*-Bulwark stack | → the support path |
| 4a | **Runelord of the Deep Halls** | 3/8, back, Guard; battle start: all friendly Bulwark +2 | The army wears his runes |
| 2b | **Warsmith** | 3/5, front, Bulwark 1; gains +1 Bulwark whenever any friendly Bulwark absorbs | → the front-line path |
| 4b | **Anvilborn Juggernaut** | 5/10, front, Bulwark 3, Cleave | A man who forged himself into the wall |

**The Stormtide Clans — the Whelpline**

| Tier | Unit | Sketch | Role |
|---|---|---|---|
| 1 | **Storm Whelp** | 1/2, any, muster +3, Frenzy | A storm-egg hatchling. What you feed it decides what it becomes. |
| 2a | **Wind Drake** | 3/3, back, Volley | → the sky path |
| 4a | **Tempest Wyvern** | 6/5, back, Volley; Frenzy: its next attack splits across 2 targets | Chain-lightning with wings |
| 2b | **Deepmaw Pup** | 2/5, front, Frenzy | → the jaws path |
| 4b | **Deepmaw Alpha** | 5/9, front, Frenzy: +2 ATK (not +1), Lifesteal | It eats what bites it |

All numbers above are **sketches for the harness, not commitments** — DN10 §5
discipline applies: tune via `npm run sim` until each clan stays in the
4.2–4.8 band and no path is an auto-pick over its sibling (§6).

### 2.3 Fork an existing line in every clan (3 more units)

One mid-form per clan gains a second path, so veterans meet the system inside
a line they already know:

- **Footman** → Sunforged Champion *or* **Bannerguard Sentinel** (T4, front,
  Guard; adjacent stacks +1 Bulwark — the defensive twin to the Champion's
  Cleave offense).
- **Moonshade Archer** → Moonbow Matriarch *or* **Moonshade Nightblade** (T4,
  front, Charge, Venom 2 — the archer steps out of the treeline).
- **Squall Harpooner** → Stormspear Tidecaller *or* **Squallcaller Windspeaker**
  (T4, back; Frenzy triggers on *any* friendly stack also grant that stack
  +1 Init this battle — tempo support twin to the Tidecaller's nuke).

Total new purchasable/promotable units in §2: **18** (15 + 3). Every clan's
"evolving cards" count goes from 2 lines to **4 forked journeys**.

---

## 3. The Kinship Camp — the offer follows your decisions

### 3.1 The rule (readable in one sentence)

**Recruit a kin, and its kin come looking for you.** Units may carry a `kin`
tag; while you own at least one stack of a kin, the camp offer tilts toward
that kin, and *kin-locked* units become able to appear at all.

```ts
kin?: 'seed' | 'forge' | 'beast' | 'bone' | 'glass' | 'cinder'
kinLocked?: boolean   // never offered unless you own a stack sharing its kin
```

### 3.2 Numbers (harness knobs, all in `data/kinship.ts`)

- The DN-era 70/30 faction/merc split is untouched.
- Within the faction share, units sharing an owned kin roll at **×2 weight**.
- `kinLocked` units are excluded from the pool entirely until unlocked; once
  unlocked they join the roll at normal weight for their tier.
- Owning more stacks of a kin does not stack the multiplier (×2, not ×2ⁿ) —
  the tilt is a flavor current, not a forced archetype.

### 3.3 The kin-locked cards (9 new units, 3 per clan)

These are the "minions that only appear depending on your decisions." Each
clan gets three units that **only exist in runs where you drafted the kin
root** — cheap, mid, and late:

**Seed kin (Verdant — own any Seedline stack):**
- T1 **Sporeling Drift** (0/2, any, muster +4, Growth; Deathcry: +1 Growth
  tick to a random friendly Growth stack) — the forest floor stirs.
- T3 **Mycel Shambler** (2/8, front; end of Muster: +1 count if you own 3+
  Growth stacks) — the network feeds it.
- T5 **The Grafted King** (7/13, front, Guard; battle start: gains the Growth
  bonuses of your *tallest* tree stack) — every tree you grew, in one crown.

**Forge kin (Vanguard — own any Forgeline stack):**
- T1 **Bellows Gnome** (0/3, back; +1 gold next Muster, max +1) — a second
  economy trickle that only forge-runs see.
- T3 **Cindersteel Golem** (3/7, front, Bulwark 2; Siege attacks against it
  absorb 2 extra) — the anti-cannon wall.
- T5 **The Waking Anvil** (6/14, front, Bulwark 4; battle start: converts all
  friendly Bulwark into +1 ATK each, then restores it) — armor becomes wrath.

**Beast kin (Stormtide — own any Whelpline stack):**
- T1 **Kennel Whelps** (1/1, front, muster +5, Frenzy) — the pack grows.
- T3 **Ridge Matriarch** (3/6, front; other beast-kin stacks +1 ATK) — the
  pack has a mother.
- T5 **The Sky-Eater** (8/10, back, Volley, Frenzy; Frenzy: also strikes the
  enemy back row) — the storm has a stomach.

*(`bone` / `glass` / `cinder` kins belong to §5's Boss Courts — boss cards
you add to the warband tilt future offers toward their Court, so a Trial
victory keeps paying.)*

### 3.4 UI

- A camp card that appeared because of kin shows a small **kin thread icon**
  (tooltip: "Drawn to your Whisperseed"). No hidden math — the player must be
  able to see the system breathing, per the DN09/DN10 legibility rule.
- Kin-locked units are listed on the faction's roster screen as silhouettes
  with the unlock line ("Appears while you field the Seedline") — discovery
  is teased, never wiki-gated.

---

## 4. The longer war

DN10 measured median 21 rounds. With three Trial rounds inserted (§5) and the
deeper rosters above, the campaign lengthens honestly — more decisions, not
more padding:

| Knob | DN10 | Now |
|---|---|---|
| Starting banner HP | 70 | **80** |
| Hard round cap | 26 | **30** |
| Sudden Death bite | 11 | **12** (same share of a banner) |
| Level-up rounds | 2–20 (10 pts) | 2–20 (10 pts) **+1 pt per Trial won** (max 13) |
| Income ceiling | 12 | **12** (unchanged — DN10 got this right) |
| Pacing target | median 19–23 | **median 24–27, p95 ≤ 30** |

The extra length has a job: room to walk a forked line to its apex *and*
field a Trial reward. The DN08 principle stands — a longer run must finish
its systems, not stretch them.

---

## 5. The Trials — the PVE break, and the Boss Tavern

### 5.1 The shape

At the end of **rounds 8, 15 and 21** (data: `data/trials.ts`), the battle
phase is not a rival pairing. A Trial banner interrupts the ladder:

> **THE BONE COURT MARCHES.** All warlords face the Pale King tonight.

- **Every surviving warlord fights the same boss board** with their own
  warband (rivals resolve it headless, same rules — the lobby stays fair and
  the ladder can shuffle on a Trial everyone struggled with).
- The battle uses the existing engine unchanged: authored boss board + boss
  hero with passive + scheduled spell, `simulateBattle` as-is, event log
  replayed with a Trial dressing (dark backdrop, the Court's colors).
- **Scouting works**: the pairing banner shows the boss board during Muster,
  exactly like scouting a rival. Preparing *for* the Trial is the strategy
  beat — repositioning against the Pale King is the point of the break.

### 5.2 Hard means hard (and failure is real)

- Boss boards are **authored data tuned by the harness**, not scaled copies
  of the player (DN10 killed mirror-scaling for good reasons; they stay
  dead). Target win rates at Standard, measured over 800+ lobbies:
  **Trial 1 ≈ 60%, Trial 2 ≈ 50%, Trial 3 ≈ 40%.**
- **Losing a Trial deals full banner damage by the normal formula** (round
  term + surviving boss stack tiers, standard cap). At round 21 that is
  near-lethal, and a warlord limping into a Trial can absolutely die there.
  There is no pity floor — that is what "a chance you will fail" costs.
- **Winning deals no damage and opens the Boss Tavern (§5.4).** A tie is a
  loss (the Court holds the field).
- Difficulty settings tune Trials the same way they tune rivals — authored
  per-difficulty boss boards, never stat cheats on the fly.

### 5.3 The three Boss Courts (boss-only sets, ~6 units + 1 boss each)

New character sets, deliberately *not* built from the three playable-faction
mechanics — Courts preview the darker keywords the launch set already
supports (Deathcry, Summon, Venom, Lifesteal, Siege):

**Trial 1 — THE BONE COURT** *(round 8 — the dead test your foundations)*
- Boss: **The Pale King** — Passive: the first Bone stack wiped each battle
  is re-summoned at half count. Spell: *Grave Toll* — every stack on both
  sides loses 1 unit (casts at start + every 8 exchanges).
- Units: Grave Retainers (T1 front swarm, Deathcry: raise 1 into a nearby
  Bone stack), Barrow Archers (T2 back, Volley), Cairn Wight (T3 front,
  Lifesteal), Ossuary Golem (T4 front, Bulwark 2, Siege-immune flavor),
  Plague Bell (T3 back, Venom aura), Bone Colossus (T5 front, Cleave).

**Trial 2 — THE GLASS CONCLAVE** *(round 15 — magic tests your midgame)*
- Boss: **The Archivist of Glass** — Passive: enemy hero spells cast one
  exchange later. Spell: *Refraction* — deals X to the enemy's highest-ATK
  stack, doubled if it acted this cycle (start + every 6).
- Units: Glass Homunculi (T1, any, muster swarm), Prism Sentinels (T2 front,
  Bulwark that does not decay while the Archivist lives), Rune Chanters (T3
  back, grant an extra spell cast), Mirror Wraith (T4, copies your
  highest-tier stack's ATK), the Lens Colossus (T5 back, Siege Volley).

**Trial 3 — THE CINDER COURT** *(round 21 — the fire tests everything)*
- Boss: **The Mother of Cinders** — Passive: each exchange, both sides' top
  unit takes 1 burn. Spell: *Immolate* — X damage to the largest enemy
  stack; her own lowest stack loses 2 units (start + every 5). She feeds.
- Units: Ashen Cultists (T1 swarm, Deathcry: +1 ATK to a Cinder stack),
  Flameborn Hounds (T2, Charge), Cinder Shrikes (T3 back, Volley, Venom-as-
  burn), Furnace Fiend (T4 front, Lifesteal, Cleave), Rift Behemoth (T5
  front — the hardest single stack in the game).

*(Design note: the GDD's locked factions — Gravebound, Conclave, Emberhorde —
were always headed to these three fantasies. The Courts are their **debut as
antagonists**. If those factions ever ship as playable, the Courts remain the
boss-flavored cousins, not the same rosters — no content is spent, only
foreshadowed.)*

### 5.4 The Boss Tavern (the reward)

Beat a Court, and for the rest of the run **its cards drift into your camp**:

- Each offer slot rolls a flat **8% chance** (data knob) to be a card from a
  Court you have defeated, *instead of* its normal faction/merc roll.
  Multiple defeated Courts split the 8%.
- Boss-set purchasables are a curated subset (~4 per Court, T2–T5 spread,
  cost the standard 3g, no promotion lines) — including one **signature
  rare** per Court at a further-reduced roll (Bone: *Grave Retainers*;
  Glass: *Mirror Wraith*; Cinder: *Furnace Fiend*). Rare means seen, wanted,
  and missed — most winning runs will field one or two Court cards, not an
  army of them.
- Court cards carry the Court's kin (`bone`/`glass`/`cinder`), so fielding
  one tilts the 8% toward that Court (§3) — a run can lean into its trophy.
- Rivals who beat the Trial draw from the same pool with the same odds —
  seeing the Pale King's retainers across the board at round 12 is the
  lobby-texture payoff.
- UI: Court cards use the Court's frame colors in the camp — a trophy should
  look like one. The run-summary screen lists Trials won and Court cards
  fielded.

### 5.5 What Trials are not

- Not a mode, not a tier, not a meta-ladder — every run contains the same
  three Trials at the same rounds, printed on the ladder strip from round 1
  (three skull pips), so the rhythm is legible from the first game.
- Not optional, and not skippable — they are the war's weather. The
  *decision* space is how hard you prepare for them versus the rival you
  might fight next round.
- Not an engine fork — no new phase type beyond "pairing is a boss board,"
  no mid-battle input, determinism per seed preserved (Trial seed derives
  from run seed + round, same discipline as everything else).

---

## 6. What this asks of the harness

New `npm run sim` columns, with bands that gate merge like DN10 §7:

1. **Path health:** per forked line, pick-share between siblings within
   **35/65**, and neither path outside the ±8% win-delta flag.
2. **Kin adoption:** share of runs fielding each kin root, and win-delta of
   kin-locked units ≤ +8% (they are spice, not a hidden best deck).
3. **Trial table:** per-Trial player win rate at Standard within ±5% of the
   60/50/40 targets, two seeds; per-faction Trial win spread within 10 pts
   (no clan may be structurally bad at bosses).
4. **Boss Tavern:** win-delta of "fielded ≥1 Court card" ≤ +10% over
   power-matched control (trophy edge rides warm like the Honored edge, and
   the same DN10 fun-first tolerance applies — flag, don't panic).
5. **Pacing:** median 24–27 rounds, p95 ≤ 30, measured at 800+ lobbies.
6. Faction band 4.2–4.8 and hero band 4.0–5.0 **re-verified** — 18 new units
   and three Trials will move DN10's numbers; the balance pass re-runs.

---

## 7. Acceptance criteria

1. `linePaths` migration is invisible: every existing line behaves
   identically; a save from DN10 loads clean.
2. Promoting a 2-path root opens the Path sheet; both outcomes preserve
   count and training arithmetic; two stacks of one root can walk different
   paths in one run.
3. The camp never offers a non-root line form (DN10 §3 test extended to all
   new lines) and never offers a kin-locked unit whose kin you don't own.
4. Kin tilt is visible on the card (thread icon + tooltip) and inspectable
   on the roster screen (silhouette + unlock line).
5. Trials fire at their authored rounds for every surviving warlord; losing
   applies full-formula banner damage (elimination possible); winning opens
   that Court's tavern pool at the authored rate and grants +1 talent point.
6. Scouting shows the boss board during the Trial's Muster.
7. All §6 harness bands met on two seeds; full vitest suite green;
   determinism per seed holds across Trial rounds.
8. No Blizzard/Ubisoft IP in any new name or text; all new content is data
   under `src/data/` — no engine special-cases per unit.

## 8. Commits (branch `feat/roots-and-ruin`)

1. `feat(engine): linePaths migration + Path choice on promote` (+ tests)
2. `feat(data): forked lines for all three clans (18 units) + path sheet UI`
3. `feat(engine+data): kinship weighting, kin-locked pool, kin UI threads`
4. `feat(engine): trial rounds — boss pairing, damage, talent grant, seeds`
5. `feat(data): the three Boss Courts — boards, bosses, spells, tavern pools`
6. `feat(ui): trial banner, court frames, boss scouting, run-summary trophies`
7. `chore(sim): path health, kin adoption, trial table, boss-tavern columns`
8. `balance: full pass to §6 bands` (the numbers commit, DN10-style)

## Appendix A — placeholder art shipped with this note

Thirteen Nano Banana Pro placeholders live in
`Bannerfell_Art/_placeholders_dn11/` (style-referenced to the locked v2
plates; **placeholders only** — final plates follow the ART_DIRECTION.md
review loop):

`vd_whisperseed` · `vd_oakheart_ancient` · `vd_blackthorn_reaper` ·
`vg_forge_apprentice` · `vg_runelord` · `vg_anvilborn_juggernaut` ·
`st_storm_whelp` · `st_tempest_wyvern` · `st_deepmaw_alpha` ·
`boss_pale_king` · `boss_glass_archivist` · `boss_mother_of_cinders` ·
`court_grave_retainers`

Appendix B (deferred): the Willow third path for the Seedline; a fourth
Trial slot for runs that reach round 27+; playable Court factions.

*— End of Design Notes 11 —*
