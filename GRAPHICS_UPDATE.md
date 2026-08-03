# GRAPHICS UPDATE — painted card art for Bannerfell

**Repo:** `liamoleary/RPG_Fantasy` · **Branch:** `feat/card-art` · **Scope:** presentation layer only.

44 painted card plates now exist — one for every unit in `src/data/factions/*` and every hero in `src/data/heroes.ts`. This document is the implementation brief. Everything needed is in this drop folder; nothing has to be generated or invented.

---

## 0. The rule that governs this whole change

**No game logic changes. No unit ids change. No stats change. No engine files are touched.**

This is a skin. `src/engine/**` must not appear in the diff at all, and `src/data/factions/*.ts` should only gain art references if you choose approach B in §3. If a test fails after this change, something has gone wrong — the existing suites (`tests/battle.test.ts`, `tests/run.test.ts`, `tests/ranks.test.ts`) must all still pass untouched.

---

## 1. What's in the drop

```
_drop/
├─ public/art/units/<unitId>.webp     38 plates, 640×800, ~71KB each
├─ public/art/heroes/<heroId>.webp    6 plates, 640×800
├─ public/art/heroes/<heroId>@2x.webp 6 plates, 928×1160 — hero select / victory
└─ src/data/art.ts                    the manifest
```

Total payload **3.2 MB**. Filenames are the repo's own ids (`vg_militia.webp`, `st_leviathan.webp`, `h_berrik.webp`), so lookup is direct and a missing file is obvious.

**Install:** copy `public/art/` to the repo's `public/art/`, copy `src/data/art.ts` to `src/data/art.ts`. That's the entire asset step.

---

## 2. The manifest contract

`src/data/art.ts` exports `UNIT_ART`, `HERO_ART`, `HERO_ART_2X` (all `Record<string, string>`) and `ART_OBJECT_POSITION`.

Add a build-time guard so art and data can never drift — a unit added later without art should fail loudly, not silently render a blank card:

```ts
// src/data/index.ts (or a new tests/art.test.ts — either is fine, prefer the test)
import { UNIT_ART, HERO_ART } from './art'
for (const u of ALL_UNITS) if (!UNIT_ART[u.id]) throw new Error(`no art for unit ${u.id}`)
for (const h of ALL_HEROES) if (!HERO_ART[h.id]) throw new Error(`no art for hero ${h.id}`)
```

Every plate is a **waist-up crop with the face high in frame**, so the art window wants `object-fit: cover` and `object-position: 50% 8%` (exported as `ART_OBJECT_POSITION`). Do not centre the crop — it decapitates about a third of the roster.

---

## 3. Component changes

### 3.1 `src/ui/StackCard.tsx` — the important one

The card currently renders `<Sigil>` as its visual. Add an art window above the name and demote the sigil to a fallback.

- Insert an art window as the card's top element, filling the card width at a **4:5 aspect ratio** (`aspect-ratio: 4/5`), `overflow: hidden`, with the image at `object-fit: cover; object-position: 50% 8%`.
- Overlay a bottom-up gradient (`linear-gradient(transparent 45%, rgba(6,10,18,.92))`) and put the unit name **on** that gradient, so the name is legible over any plate.
- Keep the count badge, rank pips, ATK/HP chips and row glyph exactly where they are, but lift them above the art with `z-index` — they must stay readable, so give each a dark backing (`rgba(11,17,29,.8)` + 1px faction-tinted border).
- `<Sigil>` stays in the tree as the fallback when `UNIT_ART[unitId]` is undefined or the image fails (`onError`). Do not delete `Sigil.tsx` — it still serves faction icons and any future unit that lands before its art does.
- `state='dead'` should desaturate and dim the plate (`filter: grayscale(1) brightness(.45)`), not hide it.
- `illegal` (placement mode) should dim the whole card as it does now; the art dims with it.

**Faction theming stays entirely in CSS.** `unitColor()` keeps driving the frame; the art is inside the frame, not replacing it. A Vanguard card must still read as blue-and-gold at a glance.

### 3.2 `src/ui/InspectSheet.tsx`

Show the plate large at the top of the sheet — full card width, 4:5, same crop rules — above the existing stats, keyword explanations, promotion line and Banner Rank progress. This is where the art earns its keep: it's the screen where the player decides whether to buy.

In the promotion-line preview, render each form's plate as a small thumbnail in the chain (`vg_militia → vg_footman → vg_champion`). The three Vanguard plates in that line are deliberately **the same man at three ages** — showing them side by side is the single strongest argument the UI can make for promoting.

### 3.3 `src/ui/BattleScreen.tsx`

Battle cards use the same `StackCard`, so they inherit the art automatically. Two things to check:

- **Performance.** Up to 14 stacks on screen with per-event animation. Give every battle-screen `<img>` `decoding="async"` and `loading="eager"` (they're above the fold and already preloaded, see §4). Animate `transform`/`opacity` only — never `filter` or `box-shadow` inside the attack loop, and never re-mount the `<img>` on an event, or Safari will re-decode mid-battle.
- **Hit flash** should be an overlay div over the art, not a filter on the image.

### 3.4 `src/ui/HomeScreen.tsx`

Hero select currently uses faction icons. Use `HERO_ART_2X[heroId]` for the selected hero as a large portrait, and `HERO_ART` for the unselected cards. Locked heroes render the plate at `filter: grayscale(1) brightness(.4)` with the Renown cost over it — seeing the art you haven't unlocked yet is the point of an unlock track.

### 3.5 `src/ui/ResultScreen.tsx` and `src/ui/Ladder.tsx`

- Result: show the winning board's plates in the damage summary.
- Ladder: rival banner chips get a small circular crop of their hero's plate (`border-radius: 50%`, `object-position: 50% 5%`). Eliminated rivals go greyscale.

---

## 4. Performance budget — non-negotiable, this is a phone game

- **Preload the next battle's plates** during Muster: for the scouted opponent's board, inject `<link rel="preload" as="image">` for each unit's art. The battle must never show a blank frame while an image decodes.
- **Preload your own board's plates** on first Muster render.
- Everything else is `loading="lazy"`.
- Camp offer cards are below the fold on small phones — lazy is correct there, but add `fetchpriority="high"` to the three visible ones.
- Add `public/art/**` to the service worker's cache list in `public/sw.js` so a second run is instant and the PWA works offline. 3.2 MB is an acceptable cache footprint; do not inline any of it as base64.
- Target: no measurable change to time-to-interactive on the Home screen, and no dropped frames during battle playback on a mid-range phone.

---

## 5. Notes on the art you should know

**Nothing is baked into the plates.** No names, numbers, frames, borders or icons — every plate is raw illustration, full bleed. All text and chrome stays CSS. This means rebalancing a unit, renaming it, or changing its keywords never requires re-rendering art.

**Upgrade lines share a face on purpose.** `vg_militia → vg_footman → vg_champion` is the same man three times, growing into his armour. `st_raider → st_reaver → st_warlord` is the same orc. Surface this wherever a line is shown.

**Two plates are approximate matches**, flagged honestly so you don't think they're bugs: `vd_warden` (Verdant Warden) uses a druid mid-transformation into a forest cat, and `vd_glade` (Spirit of the Glade) uses a singing dryad. Both fit their role and faction; neither is a literal read of the name. Everything else is bespoke to its unit.

**`h_grommash` should be renamed.** "Warchief Grommash" is too close to a Blizzard character name, and `GAME_DESIGN.md` §15 rules out importing their IP. The art is painted as **Warchief Gorrath Tidebreaker**. Renaming the display name is a one-line data change; the id can stay `h_grommash` if you'd rather not touch it, but the string the player sees should change.

**Eight spare plates exist** in `Bannerfell_Art/01_master/` and aren't in this drop — a bloodrage berserker, a storm totem, a goblin wolf scout, an ironbound sentinel, a hedge poisoner, a siege ogre, an elf moonarcher and a stag-rider. If you add units later, check those first before generating anything new.

---

## 6. Acceptance criteria

1. All existing tests pass, unchanged. `src/engine/**` does not appear in the diff.
2. A new test asserts every unit id and hero id resolves to an entry in `UNIT_ART` / `HERO_ART`.
3. Every card in the game shows its plate: Muster board, camp offers, inspect sheet, battle (both sides), result, ladder, hero select.
4. A unit whose art fails to load falls back to its `<Sigil>` without a broken-image icon or layout shift.
5. Count badge, ATK/HP, rank pips and row glyph are all legible over every plate — check `vg_colossus` and `st_leviathan`, whose art is brightest at the edges.
6. Faction colour still reads instantly on the frame; a Vanguard card and a Stormtide card are distinguishable at thumbnail size with the art present.
7. Battle playback holds frame rate on a mid-range phone at 2× speed with a full board.
8. `prefers-reduced-motion` still suppresses animation; art is static, not animated.

---

## 7. Suggested commit sequence

1. `chore: add card art assets and manifest` — the drop, no code changes.
2. `feat(ui): art window on StackCard with sigil fallback` — the core change, everything else inherits it.
3. `feat(ui): plates in inspect sheet, hero select, ladder and result`
4. `perf(ui): preload battle art, cache in service worker`
5. `chore: rename Warchief Grommash to Gorrath Tidebreaker`

Ship after 2 if you want to see it on your phone early — the game is fully playable with only `StackCard` updated.

---

## 8. Regenerating or extending the art

The art pipeline lives in `_Games/Bannerfell_Art/`, outside this repo:

- `tools/roster.py` — art briefs + stats, the source of truth
- `tools/build_prompts.py` → `prompts/`
- `tools/batch_generate.py` — parallel render on Nano Banana Pro
- `tools/make_drop.py` — rebuilds this drop folder and `art.ts` from the id map
- `ART_DIRECTION.md` — the locked style rules and the failure modes to avoid

To add art for a new unit: add it to `roster.py`, add the id pair to `MAP` in `make_drop.py`, run build-prompts → batch-generate → make-drop, then copy the two outputs in again.
