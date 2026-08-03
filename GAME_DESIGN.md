# BANNERFELL
### A pocket warband roguelike — design document v1.0

**One-line pitch:** Pick a faction, draft an army of unit stacks from a rotating war camp, shape your hero with boon choices, and outlast seven rival warlords in fast automatic battles — from a handful of militia to an unstoppable warband in under 30 minutes.

**Format:** Single-player, mobile-first web game (portrait). Deployed on Railway, playable in any phone browser, installable as a PWA.

**Influences and what we take from each:**

| Influence | What Bannerfell borrows |
|---|---|
| Hearthstone Battlegrounds | Lobby of 8 heroes, shop/draft economy (gold, reroll, freeze, tier-up), paired auto-battles each round, hero HP attrition, scouting opponents, "watch my warband get stronger" |
| Might & Magic (HoMM) | Armies as **unit stacks with counts**, unit **upgrade lines** (Militia → Footman → Champion), front/back battlefield rows, heroes with **boon choices** at level-up, classic stack-damage math |
| World of Warcraft | Strong **faction identity** — each faction has its own races, mechanic, spell school, color language, and heroes; you *belong* to your faction for the run |

---

## 1. Design pillars

1. **A full power fantasy in one sitting.** Every run goes from 4 militia to a legendary warband in 15–30 minutes. No run ever exceeds ~30 minutes; the round count is hard-capped.
2. **Decisions in the camp, drama in the battle.** All strategy happens in the untimed Muster phase. Battles resolve automatically — the player watches, learns, and adjusts. No input is ever required mid-battle.
3. **Factions you can pledge to.** Choosing a faction should feel like choosing Horde vs Alliance, not picking a deck archetype. Every faction has a distinct mechanic, aesthetic, and pair of heroes with different playstyles.
4. **Every run teaches a build.** Boons, unit lines, and shop luck combine so that two runs with the same hero play out differently. Losing should make the player want to try a different branch, not quit.
5. **Phone-first, thumb-only.** Every interaction is a tap or drag in portrait orientation. No hover states, no timers, no precision input.

---

## 2. Core loop

A **run** = one lobby of 8 warlords (you + 7 AI rivals). Each **round** has two phases:

```
┌─────────────── ROUND N ───────────────┐
│                                       │
│  MUSTER (untimed, ~30–60s in practice)│
│   · earn gold, spend at the War Camp  │
│   · recruit / promote / sell stacks   │
│   · reroll or freeze the camp offer   │
│   · raise Camp Tier                   │
│   · on level-up: choose 1 of 3 boons  │
│   · position stacks (front/back rows) │
│   · scout next opponent's board       │
│                                       │
│  BATTLE (auto, ~20–40s, 2× toggle)    │
│   · your board vs paired rival board  │
│   · loser's hero takes damage         │
│   · heroes at 0 HP are eliminated     │
│                                       │
└──────── repeat until 1 remains ───────┘
```

**Run end:** you are eliminated (defeat, with final placement 2nd–8th) or you are the last warlord standing (victory). Either way, the run awards **Renown** toward unlocks (§10).

### 2.1 Pacing math (the 15–30 minute promise)

- Hero HP: **30** for all warlords. Damage taken per loss scales with round (§8.4), so early losses are cheap and late losses are brutal.
- Typical eliminations begin around round 5–6; a full run lasts **11–15 rounds**, hard-capped at **16** (at round 16, Sudden Death: all remaining heroes take 5 damage per round after battle).
- Round budget: Muster ≈ 45s average + Battle ≈ 30s (player can toggle 2× speed, default ON after round 5) ⇒ ~75–90s per round.
- 13 rounds × ~85s ≈ **18 minutes** typical; worst case 16 rounds ≈ 28 minutes. Early elimination ≈ 10 minutes, which is fine — restart friction is near zero (one tap to re-queue).

---

## 3. Factions

Six factions at launch: **three unlocked from the start**, three earned through play (§9). Every faction has: a signature mechanic, a keyword it "owns," ~10 faction units across 5 camp tiers, 2 heroes, a spell school flavor, and a color/shape language for the CSS art direction (§11).

The War Camp offer is weighted **70% your faction / 30% Mercenaries** (a shared neutral pool, §5.5), so faction identity stays strong while every run still varies.

### 3.1 The Iron Vanguard *(unlocked at start)*
- **Fantasy:** Dwarf-and-human legion; shield walls, cannons, oaths. WoW-Alliance / dwarven vibe.
- **Signature mechanic — Bulwark:** armor points that absorb damage before HP; many effects grant or scale off Bulwark.
- **Playstyle:** slow, defensive scaling; wins long battles by not dying.
- **Colors/shapes:** steel blue + gold; square shields, hammer icons.

### 3.2 The Verdant Court *(unlocked at start)*
- **Fantasy:** Elves, treants, and wild spirits of a sacred forest. Night-elf / druid vibe.
- **Signature mechanic — Growth:** stacks gain permanent +ATK/+HP at end of each Muster phase they've survived; Verdant effects accelerate Growth.
- **Playstyle:** snowballing stats; weak early, terrifying if left alone.
- **Colors/shapes:** deep green + moonlight silver; leaf and crescent motifs.

### 3.3 The Stormtide Clans *(unlocked at start)*
- **Fantasy:** Orc and troll clans riding storms; shamans, wolves, war drums. Horde vibe.
- **Signature mechanic — Frenzy:** effects trigger when a stack takes casualties and survives (+ATK, extra attacks); embraces taking damage.
- **Playstyle:** aggressive tempo; wants fights bloody and fast.
- **Colors/shapes:** storm teal + blood red; jagged lightning, fang motifs.

### 3.4 The Gravebound Host *(unlockable — 300 Renown)*
- **Fantasy:** Undead legion; necromancers, skeletons, plague. Scourge vibe.
- **Signature mechanic — Deathcry & Raise:** on-death effects, plus summoning skeleton stacks from units that die on either side.
- **Playstyle:** attrition and board refill; sacrifices its own units for value.
- **Colors/shapes:** bone white + necrotic purple; skull and rune motifs.

### 3.5 The Arcane Conclave *(unlockable — 600 Renown)*
- **Fantasy:** Mage academy; constructs, elementals, living spells. Kirin-Tor vibe.
- **Signature mechanic — Spellweave:** the hero's spell casts trigger bonus effects on Conclave units; boons that add extra casts are premium here.
- **Playstyle:** hero-centric; the army is a conduit for an ever-bigger spell.
- **Colors/shapes:** violet + arcane cyan; hexagons, orbiting glyphs.

### 3.6 The Emberhorde *(unlockable — 1000 Renown)*
- **Fantasy:** Demons and cultists pouring from a burning rift. Legion vibe.
- **Signature mechanic — Sacrifice:** pay hero HP or consume friendly units for outsized power; the riskiest, highest-ceiling faction.
- **Playstyle:** all-in gambles; converts your own HP bar into tempo.
- **Colors/shapes:** ember orange + charcoal black; flame and horn motifs.

---

## 4. Heroes and boons

Each faction ships **2 heroes** (12 total; 6 available at launch with the 3 starting factions). A hero = **Passive** + **Battle Spell** (auto-cast, §8.5) + access to the **Boon Tree**.

### 4.1 Level-ups and boon choices (the Might & Magic moment)

The hero gains a level at the **start of Muster on rounds 2, 4, 6, 8, 10, and 12** — six level-ups per full run. Each level-up presents **a choice of 3 boons drawn from three branches**; the player picks exactly one:

- **Might branch** — army stats and combat keywords (e.g., "+1 ATK to all front-row stacks", "Your Tier 1–2 units gain +2 count when recruited").
- **Magic branch** — upgrades the hero's Battle Spell (more power, extra casts, added effects).
- **Command branch** — economy and camp (e.g., "Rerolls cost 0 for the rest of this Muster, once per round", "Camp Tier upgrades cost 2 less").

Each offer contains one boon from each branch (draw from a per-branch pool of ~10 generic boons + 2 hero-specific boons seeded into relevant branches). Boons taken are removed from the pool. **Boon rarity scales with round** — round 10–12 offers include "capstone" boons that define builds.

Rule of thumb for Claude Code: boons must change *decisions*, not just numbers — at least half of each branch pool should alter what the player wants to buy or how they position.

### 4.2 Launch heroes (starting factions)

**Iron Vanguard**
1. **Thane Berrik Oathmantle** — *Passive:* your front-row stacks start battle with +3 Bulwark. *Spell:* **Shield Line** — grant the lowest-HP friendly stack +X Bulwark (casts at battle start and every 6 attack exchanges).
2. **Marshal Yseult the Unbroken** — *Passive:* the first time each battle a friendly stack would be wiped, it survives with 1 unit. *Spell:* **Rallying Horn** — all friendly stacks +X% ATK for the next 4 exchanges.

**Verdant Court**
1. **Archdruid Sylvaen** — *Passive:* Growth triggers grant +1 extra HP. *Spell:* **Rejuvenate** — heal the most-wounded friendly stack by X (revives fallen units up to starting count).
2. **Thornqueen Maravel** — *Passive:* when a friendly stack survives a battle, it permanently gains +1 count (max once per stack per battle). *Spell:* **Bramble Coil** — root the enemy's highest-ATK stack for X exchanges (it cannot attack).

**Stormtide Clans**
1. **Warchief Gorrath Tidebreaker** — *Passive:* your stacks' first Frenzy trigger each battle also grants +1 ATK permanently. *Spell:* **Chain Lightning** — deal X damage split across the 3 highest-count enemy stacks.
2. **Seeress Zhala of the Nine Winds** — *Passive:* battle spells cast one extra time per battle. *Spell:* **Ancestral Fury** — a random friendly stack immediately attacks twice.

*(Unlock-faction heroes follow the same template; Claude Code designs them during Milestone 3 using the faction mechanic — e.g., Gravebound heroes key off Deathcry/Raise, Conclave heroes off Spellweave, Emberhorde heroes off Sacrifice.)*

---

## 5. Units and stacks (the army system)

### 5.1 Stacks, not copies

A board slot holds a **stack**: one unit type + a **count**. This is the Might & Magic heart of the game:

- Recruiting a unit you already own **adds to the stack's count** instead of taking a new slot.
- Each unit type has a **muster size** — how many individuals one purchase adds. Cheap units come in companies (Militia: +4 per purchase); elite units come alone (Dragon: +1).
- A stack's damage output = **unit ATK × alive count** (§8.2). Its durability = unit HP × count, tracked as (full units alive + wound on the top unit) — classic HoMM math.
- Counts have no hard cap; the economy caps them naturally.
- Between battles, **stacks fully restore** to their pre-battle counts. Casualties are dramatic in battle but never permanent — runs stay friendly and math stays predictable. (Boons/effects that grant *permanent* count are explicit about it.)

### 5.2 Upgrade lines (promotions)

Most units belong to a **line** of 2–3 forms, e.g. Vanguard: *Militia → Footman → Sunforged Champion*. During Muster the player can **Promote** a stack:

- **Requirements:** Camp Tier ≥ the target form's tier, and a flat gold cost (T2 form: 3g, T3 form: 5g, T4+: 7g).
- Promotion upgrades **every unit in the stack at once** (count preserved) and upgrades its keyword set. This is the "watch my warband transform" moment — big visual flourish.
- Promoted stacks keep accumulating count when you buy the base unit (the recruits "train up" into the stack's current form).

### 5.3 Unit stat template

```
Unit {
  id, name, faction, tier (1–5),
  atk, hp, init (1–10, higher attacks earlier),
  musterSize,          // units gained per purchase
  row: 'front'|'back'|'any',
  keywords: [...],     // see §8.3
  ability?: {...},     // triggered effect, data-driven
  lineNext?: unitId,   // promotion target
}
```

All purchases cost **3 gold** regardless of tier (Battlegrounds model — tier gating happens via Camp Tier, not price). Selling a stack refunds **1 gold per 3g spent on it** (floor 1).

### 5.4 Launch rosters

Full stat tables live in `data/factions/*.ts` and are Claude Code's to tune via the sim harness (§13); the GDD fixes the **shape**: per faction ~10 units — T1×3, T2×2, T3×2, T4×2, T5×1 — with at least two upgrade lines and every faction keyword represented by T2. Reference roster for the Iron Vanguard to set the tone and scale:

| Tier | Unit | ATK/HP | Init | Muster | Row | Notes |
|---|---|---|---|---|---|---|
| 1 | Militia | 1/2 | 4 | +4 | front | Line: → Footman → Sunforged Champion |
| 1 | Crossbow Levy | 1/1 | 5 | +3 | back | Volley. Line: → Arbalest |
| 1 | Mule Cart | 0/4 | 1 | +1 | any | Ability: +1 gold next Muster (max +2/round) |
| 2 | Footman | 2/4 | 4 | +3 | front | Bulwark 1 |
| 2 | Arbalest | 3/2 | 5 | +2 | back | Volley |
| 3 | Shieldmaiden | 2/6 | 3 | +2 | front | Bulwark 2, Guard (adjacent stacks +1 Bulwark) |
| 3 | Battle Cleric | 2/3 | 6 | +2 | back | Ability: heal lowest-HP friendly stack each exchange |
| 4 | Sunforged Champion | 4/6 | 5 | +1 | front | Bulwark 2, Cleave |
| 4 | Cannon Crew | 6/3 | 2 | +1 | back | Volley, Siege (ignores Bulwark) |
| 5 | Mountain Colossus | 8/14 | 3 | +1 | front | Bulwark 4, Guard; battle-start: +1 Bulwark to all allies |

Verdant Court and Stormtide follow the same skeleton with their mechanics (Verdant: Growth carriers, a healer line, a treant tank line; Stormtide: Frenzy carriers, a wolf-rider Charge line, shaman back row that grants extra attacks).

### 5.5 Mercenary pool (neutral, 30% of offers)

~8 unaligned units (T1–T5) providing generic tools every faction sometimes needs: a taunt wall, a cheap Charge unit, a Venom assassin, a gold generator, a late-game bomb. Mercenaries never have faction keywords — they fill gaps but never outscale a faction build.

---

## 6. The board

- **7 slots: 4 front row, 3 back row.** Front row absorbs melee; back row can only be hit by melee once the front row is empty, but Volley/Siege units and spells reach it anytime.
- `row: front|back|any` restricts placement; drag to reorder/re-row during Muster.
- Position matters: attack targeting (§8.2) checks opposing columns first, and several keywords (Guard, Cleave) are adjacency-based. That's enough spatial texture without becoming a tactics grid.

---

## 7. Economy (the War Camp)

| Lever | Rule |
|---|---|
| Income | Round 1: 3 gold; +1 per round; capped at **10** base income (round 8+). Unspent gold does **not** carry over (spend-it-or-lose-it keeps Muster decisive) |
| Recruit | 3 gold per purchase (adds musterSize count) |
| Camp offer | Camp Tier + 2 slots shown (T1: 3 slots … T5: 7), weighted 70/30 faction/mercenary, unit tiers ≤ Camp Tier |
| Reroll | 1 gold |
| Freeze | Free — locks current offer for next round (tap again to unlock) |
| Camp Tier up | T2: 5g, T3: 6g, T4: 7g, T5: 8g; cost drops 1 per round you don't buy it (Battlegrounds discount model) |
| Promote | §5.2 |
| Sell | §5.3 |

The gold curve is deliberately Battlegrounds-familiar: veterans of that game should feel at home instantly, and its economy is battle-tested for "shop every round stays interesting."

---

## 8. Combat engine

The engine is a **pure, deterministic function**: `simulateBattle(boardA, boardB, heroA, heroB, seed) → BattleResult` where `BattleResult = { winner, survivorsA, survivorsB, damageToLoser, events: BattleEvent[] }`. The UI never computes combat — it **replays the event log** with animations. This separation is the single most important architectural decision in the project (§12.3).

### 8.1 Battle flow

1. **Battle start:** trigger battle-start abilities and hero passives; both heroes queue their spell casts (§8.5).
2. **Exchanges:** repeat until one side has no stacks (or 200-exchange safety cap → tie, both heroes take half damage):
   - The alive stack with the highest Init that has attacked least this cycle acts next (ties: alternate sides, then random-by-seed).
   - It attacks a target (§8.2); on-hit/on-casualty/on-death triggers fire; scheduled hero spells fire between exchanges.
3. **Battle end:** compute damage to loser (§8.4); emit summary event.

### 8.2 Attacks and stack damage (HoMM math)

- Melee attacker targets: opposing front-row stack in the mirrored column if present → else random front-row stack → else (front empty) back row. Volley targets a random enemy stack in any row; Siege prefers the highest-Bulwark target.
- Damage dealt = `atk × aliveCount`, minus target Bulwark absorption (Bulwark soaks that many points per incoming attack, then is reduced by 1).
- Damage applies to the target stack's pooled HP top-down: whole units die, remainder wounds the top unit. Example: 7 damage into a stack of 3/2 HP units → 3 units die, 1 damage carried on the next.
- **Retaliation:** the defender immediately strikes back once per exchange with `atk × aliveCount-after-casualties` (Volley attackers don't provoke retaliation; some keywords modify this). Retaliation is what makes counts and casualty order feel like Might & Magic.

### 8.3 Keyword glossary (launch set — 12)

**Bulwark X** (armor per attack, decays 1) · **Charge** (acts first on cycle 1 regardless of Init) · **Volley** (ranged, no retaliation against it) · **Siege** (ignores/targets Bulwark) · **Guard** (adjacency buff aura) · **Cleave** (excess kill damage hits adjacent stack) · **Venom X** (target loses X units at its next action) · **Lifesteal** (heals own stack's wound) · **Deathcry** (on-death effect) · **Growth** (end-of-Muster permanent stats) · **Frenzy** (on-survive-casualties trigger) · **Summon** (adds a stack mid-battle if a slot is open).

Keywords are data-driven flags handled in one place in the engine — adding a keyword must never require touching the UI.

### 8.4 Hero damage and elimination

`damageToLoser = ceil(round / 2) + sum of tier of winner's surviving stacks`, capped at **15**. A tie deals half (rounded down) to both. At 0 HP a warlord is eliminated; their banner shatters on the lobby ladder. With 30 HP this yields the right arc: rounds 1–4 losses sting (2–6), rounds 8+ losses are near-lethal (10–15), eliminations cascade from round 6 on, matching the pacing model in §2.1.

### 8.5 Hero spells in battle

Spells auto-cast on a schedule (typically battle start + every N exchanges, per spell), fully determined by boons taken — the player's Magic-branch choices *are* their combat agency. Spell power X scales with hero level + Magic boons. All casts appear in the event log like any other action.

---

## 9. Rivals (the AI lobby)

Seven AI warlords fill the lobby, each with a visible faction, hero, and name (generated from faction name-banks). Rivals must feel like *players*, not HP piñatas:

- **Real boards, fake brains.** Each rival runs the same economy rules as the player each round, driven by a simple **archetype policy** (aggro-tempo / greedy-scaling / balanced / economy — assigned at lobby creation, plus per-faction preferences). Policies decide: tier-up vs recruit vs promote, which offer slot to buy (scored by synergy tags), and positioning (template-based).
- Rivals draft from their own faction's pool with the same 70/30 weighting and take boons on the same schedule (scored greedily by archetype).
- **Difficulty tuning knob:** rival policy quality (scoring noise), *never* stat cheats. Three difficulty settings at launch: Skirmish (high noise), Standard, Warlord (low noise + smarter positioning).
- **Pairing:** each round, alive warlords pair randomly with a no-repeat-last-opponent rule; odd counts fight a "ghost" of the most recently eliminated board (Battlegrounds model).
- **Scouting:** during Muster, the player can view the next opponent's current board and hero — one tap on the pairing banner.

---

## 10. Meta-progression (unlocks only)

Runs are self-contained; nothing makes future runs *stronger*. Renown makes them *wider*:

- **Renown per run:** placement-based (1st: 100, 2nd: 70, 3rd–4th: 50, 5th–6th: 30, 7th–8th: 15) + small bonuses for feats (first win with a faction, win without losing a battle, etc.).
- **Unlock track:** Gravebound Host (300), Arcane Conclave (600), Emberhorde (1000); second heroes of starting factions at 150/200/250; cosmetic banner sigils and camp themes sprinkled between.
- **Feats** (achievements) unlock **alternate boons** into the pool — build variety as the reward, not power.
- Stored in `localStorage` (versioned JSON, schema in §12.5). No accounts at launch; a future `/api/save` sync is a stretch goal.

---

## 11. UI / UX and art direction

### 11.1 Screens

1. **Home** — big "New Run" button, faction/hero select (locked cards show Renown cost), Renown bar, feats list, settings.
2. **Muster** — the main screen. Top: lobby ladder strip (8 banner chips with HP, tap to inspect) + pairing banner (tap to scout). Middle: your board (two rows, drag to move). Bottom: War Camp offer cards + gold + reroll/freeze/tier-up buttons. Hero portrait (tap for spell/boons taken). Level-up modal: three boon cards, pick one.
3. **Battle** — both boards face off vertically (enemy top, you bottom); stacks slide/strike/shake per event log; floating damage numbers; count badges tick down; hero spell banners. Controls: 2× speed toggle and "Skip to result."
4. **Result / Elimination / Victory** — damage summary, updated ladder; on run end: placement, Renown earned with animated bar, unlock reveals, "Run it back" button.

### 11.2 Art direction (stylized CSS/SVG, zero image assets)

- **Unit stacks are heraldic cards:** faction-colored frame, a bold inline-SVG sigil per unit (shield, leaf, fang, skull, glyph, flame — built from a small shared icon library), big count badge, ATK/HP chips. Promotions upgrade the frame (bronze → silver → gold trim) with a burst animation.
- **Faction theming is systemic:** each faction defines CSS custom properties (two colors, an accent, a border-radius/shape token) consumed everywhere — camp, cards, spell banners. Switching faction visibly reskins the run.
- **Motion sells the fantasy:** CSS transforms/keyframes only (no canvas): attack lunges, Bulwark shimmer, Growth pulse, Frenzy shake, death shatter. Respect `prefers-reduced-motion`.
- Dark background always (tavern-at-night), high-contrast text, minimum 44px tap targets, safe-area insets for notched phones.

---

## 12. Technical architecture

### 12.1 Stack

- **TypeScript everywhere.** Vite + **React 18** for UI, **Zustand** for state. No canvas, no game framework — DOM/CSS/SVG covers this game.
- **Server:** minimal Node + Express serving the built `dist/` (SPA fallback to `index.html`), listening on `process.env.PORT`. The game is fully client-side at launch; the server exists so Railway has something to run and to leave room for a future save-sync API.
- **PWA:** manifest + service worker (cache-first for the app shell) so Liam can "Add to Home Screen" and play offline.

### 12.2 Repo layout

```
bannerfell/
├─ src/
│  ├─ engine/          # PURE game logic — no imports from ui/ ever
│  │  ├─ battle.ts     # simulateBattle + event log
│  │  ├─ camp.ts       # offers, rerolls, tiers, promote/sell
│  │  ├─ run.ts        # round loop, pairing, damage, elimination
│  │  ├─ rivals.ts     # archetype policies
│  │  ├─ boons.ts      # pools, offers, application
│  │  └─ rng.ts        # seeded RNG (mulberry32); ALL randomness flows through it
│  ├─ data/            # factions, units, heroes, boons, mercs, name-banks
│  ├─ ui/              # React components, screens, animations
│  ├─ state/           # Zustand stores; persistence (localStorage)
│  └─ main.tsx
├─ server/index.ts     # Express static server
├─ tests/              # vitest — engine only
├─ scripts/sim.ts      # headless balance harness (§13)
├─ Dockerfile          # or Nixpacks; either is fine for Railway
└─ railway.json / README.md
```

### 12.3 Two non-negotiable rules

1. **The engine is pure and seeded.** Given the same state + seed, every function returns identical results. No `Date.now()`, no `Math.random()` inside `engine/` — only the injected RNG. This makes battles replayable, bugs reproducible, and the balance harness possible.
2. **The UI replays event logs; it never computes outcomes.** `BattleEvent` is a tagged union (`attack`, `casualties`, `bulwarkAbsorb`, `spellCast`, `summon`, `death`, `battleEnd`, …). If an animation looks wrong, the bug is in the renderer or the log — never ambiguous.

### 12.4 Deployment (Railway)

- Repo root Dockerfile: build (`npm ci && npm run build`) → run (`node server/index.js`). Railway auto-deploys from the GitHub repo; expose `PORT`; no database, no volumes, no env secrets at launch. Health check: `GET /healthz` → 200.

### 12.5 Persistence schema (localStorage)

```ts
{ version: 1,
  renown: number,
  unlocks: string[],          // faction/hero/cosmetic ids
  feats: Record<string, true>,
  stats: { runs, wins, bestPlacementByHero: Record<string, number> },
  settings: { speedDefault, reducedMotion, difficulty },
  activeRun?: SerializedRunState }  // resume mid-run after app close — a phone essential
```

Migrations keyed off `version`. `activeRun` is saved at the end of every phase so a phone lock/refresh never loses a run.

---

## 13. Balance harness (how the game gets good without a QA team)

`scripts/sim.ts` runs headless lobbies (8 AI policies, no UI) and prints per-faction/hero/archetype winrates, average placement, run length distribution, and unit pick-vs-win deltas over N thousand runs. Targets:

- Every faction's average placement within **4.2–4.8** at Standard difficulty; every hero within 4.0–5.0.
- Median simulated run ≤ 14 rounds; 95th percentile ≤ 16.
- No unit with a >8% win-delta when drafted (screams auto-pick).

Claude Code should run the harness after any data change and treat regressions like failing tests. This is the project's superpower: balance passes become a loop of "tweak data → run 5,000 sims → read table," which an agent is exceptionally good at.

---

## 14. Build milestones (for Claude Code)

**M0 — Scaffold (foundation):** Vite/React/TS/Express/Dockerfile boots on Railway; blank screens routed; seeded RNG + engine package with unit tests running in CI.

**M1 — The core is fun on paper:** full engine (camp, battle, run loop, hero damage) for **Iron Vanguard only** vs simple rivals; debug UI (plain lists/buttons, no art); vitest coverage of combat math incl. retaliation, Bulwark, casualty carry-over; sim harness runs end-to-end. *Exit test: a scripted full run completes headless in <50ms.*

**M2 — A real game with 3 factions:** all three launch factions + mercenaries + 6 heroes + boon system; archetype rivals; real Muster/Battle/Result screens with drag positioning and event-log battle playback; mid-run resume. *Exit test: Liam plays a full run on his phone via Railway and it feels like a game.*

**M3 — Identity and depth:** the three unlockable factions + their heroes; Renown, unlock track, feats, alternate boons; scouting; difficulty settings; polish pass on boon pools using the harness.

**M4 — Polish and juice:** full CSS/SVG art direction, animations, sound (optional WebAudio bleeps), PWA install flow, 2×/skip controls, reduced-motion support, balance pass to §13 targets, victory/defeat ceremonies.

Ship after M2; M3/M4 land as updates — the unlock system is designed so content can arrive incrementally.

---

## 15. Handoff notes to Claude Code

- This document is the source of truth for *shape*; exact numbers (unit stats, boon values, spell scaling) are yours to tune **via the sim harness**, not by feel. Keep §2.1 pacing and §13 targets as acceptance criteria.
- Build vertically (M1's ugly-but-complete loop) before widely (more factions). The game must be fun with grey boxes first.
- All content — units, heroes, boons, keywords, rival policies — is **data, not code**. Adding faction #7 one day should mean adding files to `data/`, nothing else.
- Names/flavor here are original; do not import Blizzard/Ubisoft IP (no WoW/HoMM names, art, or text).
- When in doubt on a design gap, prefer the Battlegrounds convention for economy questions and the Might & Magic convention for combat questions.

*— End of design document —*
