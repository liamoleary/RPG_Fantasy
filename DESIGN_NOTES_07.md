# BANNERFELL — Design Notes 07: The Storybook UI (art-first rework + Daybreak theme)

Companion to `GAME_DESIGN.md`, `DESIGN_NOTES_01–06`, and `PLAN_ART_AND_THEME.md`. Relationship to that last one, precisely: **its Phase 2 component work (`UnitArt.tsx`, sigil fallback, `object-position`, lazy-loading rules) stands and is required by this doc. Its §4 "plum-dark retune" theme is superseded by §4 below.** Where anything else conflicts, this doc wins.

---

## 1. Art review verdict, and the real problem

The v2 hand-drawn set is reviewed and **locked as the game's style**. It's the right call for this product: warm ink outlines (the darkest colour in the whole set is a maroon-brown, ~`#452b3d` — there is no black anywhere), cel shading, big faces, pastel skies. Critically, it's *built* for small sizes in a way the oil paintings never were — bold linework survives shrinking; rendered brushwork doesn't.

But the complaint is still correct, because **the current UI was designed around 24px procedural sigils, not paintings.** Cards are a frame-heavy furniture stack (name bar, stat row, badges, borders) with a small art window inside. At phone width that leaves the art ~80px — postage stamps of artwork that deserves the whole stamp album. Wiring art into the old card anatomy (Phase 2 as written) would improve things and still under-deliver.

So this is a layout inversion, not a skin: **the card IS the art, and the UI is what little floats on top of it.**

## 2. Card anatomy v2 — one component, three sizes

`StackCard` is rebuilt so the plate fills the card edge-to-edge (full-bleed, `aspect-ratio: 4/5`, `border-radius: 16px`, 2px `--stroke-ink` border — the art's own maroon ink, so frames look drawn rather than manufactured). Everything else is an overlay:

- **Count badge** top-right, **rank chevrons** top-left, both as compact ink-outlined chips.
- **ATK/HP** as one pill bottom-left, scrim *behind the pill only* — never a gradient across the plate; the art is the point.
- **Charge meters / Cover pips** (DN02/04) as slim edge markers.
- **No name on board-size cards.** The art is the identity — that's what "you can't tell what they are" was really complaining about; a 9px name label never fixed it. Names live on camp cards, inspect, and battle banners.
- Faction reads from a coloured inner keyline + the badge tint (`unitColor()` survives), not from heavy chrome.

Three canonical sizes, one component: **board** (grid-fitted, ~86–100px wide), **camp** (~160px, name plate on the scrim), **showcase** (inspect/recap, full width). Nothing else may invent a card layout.

## 3. Screen-by-screen — where the pixels come from

Measured against a 390×844 viewport (safe-areas on):

- **Muster board:** rows go edge-to-edge — horizontal page padding drops from ~16px to 8px, inter-card gap from ~10px to 6px, row labels shrink to overline captions. Board cards grow ~30% by area with zero information loss (stats moved onto the plate, name deleted, empty slots become thin dashed ghosts).
- **War Camp becomes a hand.** The camp stops being a cramped row of tiles and becomes a **bottom sheet of large swipeable cards** — ~160px wide, 2.5 visible with the next peeking (the peek *is* the scroll affordance). Buy = drag up onto the board (per the drag plan; ghost shows the DN04 truthful buy text) or tap → sheet. This is where purchase decisions happen, so it gets the biggest always-visible art in Muster. Reroll/Freeze/Tier-up dock beside the hand; Fight stays pinned (DN04 §5).
- **Battle:** the two boards get the space the camp vacated (no camp in battle) — cards render one size up from Muster board size. Hero portrait bottom-centre per DN04 §9. Damage floats and banners scale with the bigger cards.
- **Inspect/scout:** already speced as showcase art (GRAPHICS_UPDATE §3.2 / DN04 §8); unchanged, now consistent via the shared component.
- **Legend recap (DN06):** showcase-size cards in the final-board parade — this screen is why the anatomy has a third size.
- **8th slot note (DN06):** the board grid must accept 4+4 without cards shrinking below 86px — at 8px/6px spacing a 390pt screen holds 4×90px cards exactly. Verified feasible; the constraint is codified in §6 acceptance.

## 4. The Daybreak theme — the app joins the art's world

The current chrome is a cold near-black built for oil paintings in a dark tavern. The v2 art lives in daylight: measured dominant neutrals are warm lavender-greys (`#8a8a93`, `#aaa3b6`), skies in slate-blue and sage (`#5b7695`, `#79aca3`), highlights in cream (`#dac998`), and every line drawn in warm maroon. Putting that art in near-black chrome reads as two different products — PLAN_ART_AND_THEME saw this and proposed warming the dark theme; **this doc goes further: the app goes light.** The whole product becomes the storybook page the art was drawn on — that pale, warm look of the contact sheets is *why* the new art reads as cute, and the app should feel like that everywhere.

```css
:root {
  --page:      #ece7ef;  /* warm lavender-white — the storybook page          */
  --panel:     #f6f2ea;  /* cream card/panel face (from the art's highlights) */
  --panel-2:   #ddd5e2;  /* recessed surface: camp sheet, ladder strip        */
  --ink:       #3a2b38;  /* primary text — the art's own dark maroon-brown    */
  --ink-dim:   #7d6f80;  /* secondary text                                    */
  --stroke-ink:#452b3d;  /* every border/outline — matches the drawn linework */
  --gold:      #d9a441;  /* tier/cost accent (unchanged hue, reads on light)  */
  --danger:    #c9483f;  --good: #3e9463;
  --radius:    16px;     /* chunky, matches the art's rounded forms           */
  --shadow:    0 2px 10px rgba(69,43,61,.18);  /* soft ink-tinted, no black   */
}
```

- **Battle deepens, one step.** During battle only, the page shifts to `--panel-2`-dark (`#4a4152` region) so combat FX (glows, lightning, damage floats) keep their punch — dawn in camp, dusk on the battlefield. All DN03/04 FX must be checked against both grounds.
- **Faction colours:** keep PLAN_ART_AND_THEME's raised-chroma values (they were sampled from this art); on Daybreak they're used as *fills behind ink outlines* (chips, keylines, path-bars) rather than glows on black.
- **Text contrast:** `--ink` on `--page` is ~10:1; every token pair used for text must hold ≥4.5:1 — check `--gold` (cost numbers get an ink outline or darker `#a87718` variant for text use).
- **Rule from PLAN_ART_AND_THEME retained:** all colour via tokens; any hex literal found outside `:root`/faction defs gets hoisted as part of this work.

## 5. Migration and scope discipline

- Build order: land Phase 2 (art wiring, per the existing plan) on `feat/liamsart-v2` first if not already done — this doc's card anatomy replaces that phase's *StackCard layout details* but keeps its component/fallback/perf rules verbatim.
- The Daybreak swap is one commit late in the sequence, entirely in tokens + the battle-ground shift, revertable without touching layout.
- No engine files. No data files beyond faction colour values. All existing tests must pass untouched.
- `prefers-color-scheme` is ignored for now (the game has one look); `prefers-reduced-motion` rules from DN03/04 still hold.

## 6. Acceptance criteria

1. On a 390×844 viewport: board cards ≥86px wide with 8 slots, camp-hand cards ≥150px wide with 2.5 visible, no page scroll in Muster (DN04 §5 holds).
2. A screenshot of the Muster screen is ≥60% artwork by area (measure it — the previous UI was under 15%).
3. Every unit is identifiable at board size by its art alone with names hidden — spot-check the ten most-similar pairs across factions.
4. Stat pills, count badges and rank pips pass legibility on the five brightest plates *and* on Daybreak's light ground.
5. No black pixels in the chrome: every border, shadow and text uses the ink tokens; battle's deepened ground is the only dark surface.
6. All art surfaces use `UnitArt` with the sigil fallback and `--art-pos`; the network panel shows lazy loading still working; sw.js pre-cache decision from PLAN_ART_AND_THEME is documented in the PR.
7. Screenshots of Muster, Battle, Inspect and Recap at 390px posted in the PR, on both grounds.

## 7. Commits (continuing on `feat/liamsart-v2` after its Phase 2)

1. `feat(ui): full-bleed card anatomy — board/camp/showcase sizes, stats-on-plate`
2. `feat(ui): muster layout — edge-to-edge board, camp hand bottom sheet`
3. `feat(ui): battle layout scale-up on vacated space`
4. `style(theme): Daybreak tokens + battle ground shift; hoist stray hex literals`
5. `chore: screenshot pass + PR with §6 evidence`

*— End of Design Notes 07 —*
