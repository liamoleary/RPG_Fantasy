# Bannerfell — Art Publish + Theme Retune

**For:** Claude Code, working on `liamoleary/RPG_Fantasy`, branch `feat/liamsart-v2`
**Scope:** Phase 2 (wire the art into the UI) and Phase 3 (retune the theme)

> **Phase 0 and Phase 1 are already done — do not redo them.**
> Liam ran `push_liamsart_v2.bat` before starting you. That script cleaned the
> line-ending churn, committed the new art and manifest, and pushed this branch.
> Everything you need is already in the repo you can see. There is no external
> art folder to fetch and nothing to copy in.
>
> Confirm on arrival, then move straight to Phase 2:
> ```bash
> ls public/art/units/*.webp | wc -l          # 41
> ls public/art/heroes/*.webp | wc -l         # 12
> ls public/art/_unassigned/*.webp | wc -l    # 11
> git log --oneline -1                        # chore(art): ... hand-drawn v2 style
> ```

---

## 0. Read this first — one surprising fact

**The card art is in the repo and nothing displays it.**

`public/art/` holds the plates. `src/data/art.ts` exports `UNIT_ART`, `HERO_ART`,
`HERO_ART_2X` and `ART_OBJECT_POSITION`. Verify for yourself:

```bash
grep -rn "UNIT_ART\|HERO_ART\|ART_OBJECT_POSITION" src --include=*.ts --include=*.tsx | grep -v "src/data/art.ts"
```

That returns **nothing**. No component imports the manifest, and `styles.css` has no
art or portrait rules. Units render as procedural `<Sigil>` shapes (`src/ui/Sigil.tsx`).

This was true before the art was replaced and is still true now. Getting art on screen
for the first time is the substance of this task — Phase 2 below. Do not treat the
already-committed asset swap as the job and report success.

---

## 1. What is on the branch

58 plates in a hand-drawn cel-shaded style (rough ink linework on the character,
lineless painterly backgrounds), replacing the previous oil-painted style.

| Path | Count | Notes |
|---|---|---|
| `public/art/units/*.webp` | 41 | 928×1152, named by repo unit id |
| `public/art/heroes/*.webp` | 6 | 928×1152 |
| `public/art/heroes/*@2x.webp` | 6 | 1856×2304 native |
| `public/art/_unassigned/*.webp` | 11 | art with no unit in the game yet |

The manifest was diffed against the previous one: **41 unit ids in, 41 out, zero lost,
zero added.** Every id previously referenced still resolves.

### Naming note

Art filenames are the **repo unit id** (`vg_militia`), not the art-pipeline id
(`vanguard_militia`). The mapping lives in `Bannerfell_Art/make_drop.py` on Liam's
machine — not in this repo. Several names differ between the two systems by design
(art `merc_sellsword` → repo `mc_roadwarden`, art `stormtide_clan_whelp` → repo
`st_raider`). Trust the id, not the name.

---

## 2. Decisions needed from Liam — do not guess

**2a. Two Verdant slots were mapped provisionally.** The game has `vd_glade`
("Spirit of the Glade", T3 back) and `vd_warden` ("Verdant Warden", T4 back). Neither
name exists in the art roster. Currently assigned:

- `vd_glade` ← `verdant_dryad_songweaver`
- `vd_warden` ← `verdant_silverbow_sentinel`

Both are plausible on tier and row but neither is confirmed. Other candidates sit in
`_unassigned/`: `verdant_moonarcher`, `verdant_moonlit_stagrider`, `verdant_wildclaw_druid`.
Ask before treating these as final.

**2b. 11 plates have no unit in the game.** They are in `public/art/_unassigned/` and
referenced by nothing, so they are inert and safe to leave. They fall in two groups:

- *Needs game data to exist:* `vanguard_aegis_warden` (a new Shieldmaiden tier-2),
  `merc_siege_ogre`, `merc_ironbound_sentinel`, `merc_hedge_poisoner`,
  `stormtide_bloodrage_berserker`, `stormtide_stormhowl_totem`, `stormtide_duskfang_scout`,
  `stormtide_squall_harpooner` (orc variant), `verdant_moonarcher`,
  `verdant_moonlit_stagrider`, `verdant_wildclaw_druid`.
- Adding any of them means a new `UnitDef` in `src/data/factions/*.ts` — stats, keywords,
  tier, row, `lineNext`, sigil, tags — which is a **game design change, not an art change.**
  Out of scope here. Flag it, do not invent stats.

**2c. Three manifest ids have art but no unit** — `vg_ballistier`, `vd_matriarch`,
`st_stormspear`. This is pre-existing (true before this change too). They are exported
from `UNIT_ART` and referenced by no `UnitDef`. Harmless, but worth telling Liam that
three T4 line-tops were drawn and never wired into the roster.

---

## 3. Phase 2 — put the art on screen

This is the substance of the task. Art is 4:5 portrait, waist-up, face high in frame.
`ART_OBJECT_POSITION = '50% 8%'` exists precisely so faces are not centre-cropped —
**use it on every art surface; never `object-position: center`.**

Suggested approach — adapt if the components disagree:

1. **New component `src/ui/UnitArt.tsx`.** Props `{ unitId, className }`. Looks up
   `UNIT_ART[unitId]`, renders an `<img>` with `loading="lazy"`, `decoding="async"`,
   `object-fit: cover`, `object-position: var(--art-pos)`. **Falls back to `<Sigil>` when
   the id is missing from the manifest** — this matters, because the three orphan ids in
   §2c and any future unit will otherwise render a broken image.

2. **`StackCard.tsx`** — the battle/muster card. Art as the card's background layer with
   the existing stat furniture (`RankPips`, atk/hp, row glyph) composited on top. Keep
   `unitColor()` driving the border so faction reads at a glance. Stats must stay legible
   over bright art: put a scrim behind the numbers (bottom-up gradient from `--panel` at
   ~85% alpha), not a flat overlay across the whole plate — the art is the point.

3. **`InspectSheet.tsx`** — the detail view. Largest art surface; use the full plate here.

4. **`MusterScreen.tsx`** (21KB, the biggest UI file) — recruitment cards. Check how it
   renders unit tiles before editing; it likely uses `StackCard` and may need nothing.

5. **Heroes** — `HERO_ART` / `HERO_ART_2X` via `srcset` (`1x` and `2x`) wherever heroes
   appear.

**Performance:** 41 plates at ~140KB each is ~6MB. Do not let the muster screen fetch
all of them eagerly. `loading="lazy"` plus explicit `width`/`height` (or `aspect-ratio: 4/5`)
to prevent layout shift. `public/sw.js` exists — check whether it precaches `/art/**`
and whether that is wanted; a service worker pulling 6MB on first load is a bad
first-run experience on mobile.

---

## 4. Phase 3 — retune the theme to match the art

The current theme was built for the old dark oil-painted style and will actively fight
the new art. Concrete evidence, sampled from the 58 delivered plates:

| | Current UI | New art (measured) |
|---|---|---|
| Darkest common value | `#0c0d13` near-black, blue-biased | `#483030` warm brown |
| Dominant neutrals | `#1b1e2c`, `#333852` cold slate | `#a8a8c0`, `#9090a8`, `#787890` lavender-grey |
| Outline colour | n/a | warm dark brown / maroon — **the art contains no pure black** |
| Overall value | very dark | bright, open midtones |

A cold near-black chrome around warm lavender art reads as two different products. The
fix is to warm the neutrals and lift them slightly — keep it dark so the bright plates
pop like a gallery wall, but move the hue from blue to plum.

### Proposed tokens — `src/ui/styles.css` `:root`

```css
--bg:         #171320;   /* was #0c0d13 — warm plum-black, not blue */
--panel:      #241d30;   /* was #1b1e2c */
--panel-2:    #322843;   /* new: raised surface / card face */
--line:       #4a3a52;   /* was #333852 — warm, echoes the art's ink */
--ink:        #f3ede4;   /* was #e8e6f0 — warm cream, matches art highlights */
--ink-dim:    #a99bb4;   /* was #9a9ab5 */
--gold:       #efc76b;   /* was #e8c05a — brighter, matches the art's gold */
--danger:     #e0685f;   /* was #d9534f */
--good:       #6fc98f;   /* was #5cb87f */
--stroke-ink: #4a2f38;   /* NEW: the warm maroon the art outlines with — use for
                            card borders instead of pure black or cold slate */
--art-pos:    50% 8%;    /* NEW: mirrors ART_OBJECT_POSITION for CSS-side use */
--fx-radius:  10px;      /* was 4px — the art is chunky and rounded */
```

### Faction colours — `src/data/factions/*.ts`

Same hues, raised chroma to sit with the brighter plates. Do not change the hue family;
faction identity depends on it.

```
vanguard   primary #5b86b8 → #6f9ed0   secondary #e0b352 → #f0c96b   accent #8fb6e2 → #a9c9ea
verdant    primary #4f9d69 → #5fb87c   secondary #cfe3d4 → #d8ead9   accent #8fdc9f → #9fe8ad
stormtide  primary #2f9296 → #3aa9ad   secondary #c2392f → #d9564a   accent #54d6d1 → #6ae3de
merc       unitColor() hardcodes #8a8fa6 in StackCard.tsx — leave drab on purpose;
           mercenaries are meant to read as unheraldic next to the great factions.
```

Per-faction `shape` is `2px` / `4px` / `14px`. Consider `6px` / `10px` / `18px` to match
the chunkier art, keeping the relative ordering that distinguishes the factions.

The `ink` value inside each faction's `colors` (`#08181a`, `#0d1622`, `#0b1710`) is
near-black. If it is used for text or borders over art, move it toward `--stroke-ink`.
Check usage before changing — it may be doing something else.

**Do all of this via the CSS custom properties, not scattered literals.** If hardcoded
hex values are found outside `:root` and the faction defs, hoist them to tokens as part
of the change — otherwise the next theme pass has the same problem.

---

## 5. Acceptance checks

- [ ] `npm run build` clean; `npx tsc --noEmit` clean.
- [ ] `npm test` (vitest) passes — the engine tests should be untouched by this work.
      If an engine test breaks, something was changed that should not have been.
- [ ] `grep -rn "UNIT_ART" src --include=*.tsx` now returns **at least one component**.
- [ ] Every one of the 38 live units shows a plate in muster and battle. No broken images.
- [ ] The three orphan ids (§2c) and any unknown id fall back to `<Sigil>`, not a broken
      image icon.
- [ ] Faces are not cropped — verify `object-position` is applied on every art surface.
- [ ] Atk/hp/rank stay legible on the brightest plates. Check `vg_champion` (glowing
      orange hammer), `st_leviathan`, `vd_ancient` — these are the worst cases.
- [ ] Muster screen does not fetch all 41 plates on load (check the network panel).
- [ ] Screenshot muster + battle + inspect at mobile width and post them in the PR.

## 6. Commit shape

Three commits on `feat/liamsart-v2`, so the theme can be reverted without losing the art:

1. `chore(art): replace card art with hand-drawn v2 style` — assets + manifest only.
2. `feat(ui): render unit and hero art on cards, muster and inspect` — Phase 2.
3. `style(theme): retune palette to match the v2 art` — Phase 3 tokens.

Open a PR from `feat/liamsart-v2` against the default branch
(`claude/fable-5-game-prototype-w8gpnz`). In the description, list the §2 decisions Liam
still owes an answer on, and note that 11 plates are parked in `_unassigned/`.
