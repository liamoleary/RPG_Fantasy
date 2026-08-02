# BANNERFELL

A pocket warband roguelike. Pick a faction, draft an army of unit stacks from a rotating war camp,
shape your hero with boon choices, and outlast seven rival warlords in fast automatic battles.

Mobile-first, portrait, installable as a PWA. One run ≈ 20 minutes.

Built from `GAME_DESIGN.md` — this repo implements **M0 through M2** of the milestone plan
(three factions, six heroes, full boon system, archetype rivals, real screens, mid-run resume).

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

Other scripts:

| Command | What it does |
|---|---|
| `npm test` | Engine test suite (vitest, 38 tests) |
| `npm run sim -- --runs 2000` | Headless balance harness (§13 of the GDD) |
| `npm run build` | Typecheck + production bundle into `dist/` |
| `npm start` | Serve `dist/` with the Express server on `$PORT` |
| `npm run serve` | Build then serve — what the container does |

---

## Deploying to Railway

The repo ships everything Railway needs: a `Dockerfile`, a `railway.json` with a health check,
and a server that binds `process.env.PORT`. There is no database, no volume and no secret.

**Set it up once:**

1. Go to [railway.com/new](https://railway.com/new) → **Deploy from GitHub repo** → pick
   `liamoleary/rpg_fantasy`.
2. Railway detects `railway.json` and builds with the Dockerfile. No build/start command to type —
   `railway.json` already sets `node server/index.js` and health check `/healthz`.
3. Leave **Watch Paths** empty and set the deploy branch to `main`
   (Settings → Source → Branch). Every push to `main` then redeploys automatically.
4. Settings → Networking → **Generate Domain**. Pick port `8080` if it asks.
5. Open the domain on your phone → Share → **Add to Home Screen** for the PWA.

**Verify a deploy:** `curl https://<your-domain>/healthz` → `{"ok":true,"service":"bannerfell"}`.

If you'd rather use the CLI:

```bash
npm i -g @railway/cli
railway login
railway link          # select the project
railway up            # one-off deploy from your working copy
```

### Prompt for setting Railway up

Paste this into Railway's assistant, or use it as your own checklist:

> Create a new Railway project from the GitHub repo `liamoleary/rpg_fantasy`, deploying from the
> `main` branch. The repo has a root `Dockerfile` and a `railway.json`, so use the Dockerfile
> builder and take the start command and health check from `railway.json` — do not override them.
> The app is a static single-page game served by Express; it listens on `process.env.PORT` and
> defaults to 8080. It needs no environment variables, no database, no volume and no secrets.
> After the first successful build, generate a public domain on port 8080, enable automatic
> redeploys on every push to `main`, and confirm the deploy is healthy by checking that
> `GET /healthz` returns HTTP 200 with `{"ok":true,"service":"bannerfell"}`.

---

## Architecture

Two rules from the design doc are load-bearing and are enforced throughout:

**1. The engine is pure and seeded.** Nothing under `src/engine/` calls `Date.now()` or
`Math.random()`. All randomness flows through the injected mulberry32 RNG in `engine/rng.ts`.
Same state + same seed ⇒ identical result, every time. That is what makes battles replayable,
bugs reproducible, and the balance harness possible.

**2. The UI replays event logs; it never computes outcomes.** `simulateBattle` returns a
`BattleEvent[]`, and every event that changes the board carries a `snap` of the stacks it touched.
`BattleScreen` is a projector: apply the snapshot, play a flourish. If an animation looks wrong,
the bug is in the renderer or the log — never ambiguous.

```
src/
├─ engine/          PURE game logic — never imports from ui/
│  ├─ battle.ts     simulateBattle + the event log
│  ├─ camp.ts       offers, rerolls, tiers, recruit/promote/sell
│  ├─ run.ts        round loop, pairing, hero damage, elimination
│  ├─ rivals.ts     archetype policies (same economy rules as the player)
│  ├─ boons.ts      pools, offers, eligibility
│  └─ rng.ts        seeded RNG — ALL randomness goes through here
├─ data/            factions, units, heroes, boons, mercs, name banks
├─ ui/              React components, screens, CSS/SVG art
├─ state/           Zustand store + localStorage persistence
└─ main.tsx
server/index.js     Express static server + /healthz
scripts/sim.ts      headless balance harness
tests/              vitest — engine only
```

All content is **data, not code**. Adding a seventh faction means adding a file under
`data/factions/` and listing it in `data/index.ts` — no engine or UI changes.

---

## Balance

`npm run sim -- --runs 2000` runs headless lobbies and prints placement tables. Current state
at 1500 lobbies, Standard difficulty:

| Metric | Target | Actual |
|---|---|---|
| Faction average placement | 4.2 – 4.8 | 4.36 / 4.55 / 4.59 ✅ |
| Hero average placement | 4.0 – 5.0 | 4.15 – 4.90 ✅ |
| Median run length | ≤ 14 rounds | 13 ✅ |
| 95th percentile run length | ≤ 16 rounds | 15 ✅ |
| Full headless run | < 50 ms | ~3 ms ✅ |

Two mechanics were retuned against the harness during the build, both because the original
formulation did not scale across a 13-round run:

- **Bulwark** now soaks `bulwark × alive count` per attack, mirroring the `atk × alive count`
  damage formula. As a flat value it was decisive at round 2 and worthless by round 12, which
  left the Iron Vanguard bottom of every table.
- **Growth** grants HP every Muster but ATK only every *other* Muster. Ungated ATK growth
  compounds with stack count and the Verdant Court ran away with the lobby (3.35 avg placement).

**Known gap:** the per-unit win-delta table still flags outliers (Hired Bowman +16%, Verdant
Warden +12%; Footman and Bloodfang Reaver at −16% and −19%). The negative flags are largely a
metric artifact — a board still holding an unpromoted tier-2 line unit at run end is a board that
already fell behind — but the positive ones are real signal and want a data pass. The metric
compares each unit against its own tier so that tier-5 units don't trivially top the chart.

---

## What is and isn't built

**Done (M0–M2):**
- Full combat engine: pooled-HP stack damage, retaliation, initiative cycles, all 12 keywords,
  hero passives, scheduled battle spells, the 200-exchange safety cap
- Iron Vanguard, Verdant Court, Stormtide Clans + the neutral mercenary pool (38 units)
- 6 heroes, 40 boons across Might / Magic / Command, capstones gated to round 10+
- War Camp economy: gold curve, rerolls, freeze, camp tiers with the skip discount,
  promotions, selling
- 8-warlord lobby, four rival archetypes, random pairing with no-repeat and ghost boards
- Muster / Battle / Result / Run-over screens, scouting, tap-to-move positioning
- Mid-run resume, Renown, difficulty settings, reduced-motion support, PWA install

**Not yet (M3–M4):**
- Gravebound Host, Arcane Conclave, Emberhorde (the unlock-track factions) and their heroes
- Feats, the unlock reveal ceremony and cosmetic sigils — Renown accrues but only gates
  the second hero of each starting faction
- Sound, and the full animation polish pass

**Deliberate deviations from the design doc**, both for phone reliability:

- Positioning is **tap-to-pick, tap-to-place** rather than drag. Drag competes with page scroll on
  a phone and misfires; two taps never do. `Auto-arrange` covers the common case in one press.
- Extra spell casts extend the cast schedule at the same cadence rather than firing back-to-back,
  so "one extra cast" pays off in long fights and quicken-cadence boons pay off always. This keeps
  the two Magic-branch levers doing different things.
