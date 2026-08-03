# BANNERFELL — Design Notes 03: feeling your power

Companion to `GAME_DESIGN.md`, `DESIGN_NOTES_01/02.md`. Where this conflicts with earlier docs, this wins — including one correction to Design Notes 01 (§3 below).

Playtest theme this round: **the game is working but not *showing* it.** Hero spells fire invisibly, boons apply invisibly, and progression through a line is under-used. Almost everything here is presentation and data; the one systems change (§5) is deliberately smaller than requested, and §5.1 explains why.

---

## 1. The hero must be visible in battle

**Problem:** hero spells cast with no fanfare, so the player's most personal power — the thing their Magic boons feed — is imperceptible.

1. **Hero plaques.** Both heroes appear on the battle screen as small portrait plaques (use `HERO_ART`): yours bottom-left below your board, the enemy's top-right above theirs. Always visible, showing name and remaining spell casts as pips.
2. **Casts come FROM the hero.** On every `spellCast` event: the caster's plaque flares in its faction colour, a beam/streak travels from the plaque to the affected stack(s), and a **spell banner** slides in — spell name plus its rolled numbers ("Rejuvenate — 18 healed", "Chain Lightning — 14 damage across 3 stacks"). The banner is the receipt; the beam is the attribution. Both must be readable at 2× speed (banner min duration ~600ms real time).
3. **Tap the hero to pause and inspect.** Tapping either plaque pauses playback (the replay architecture makes this free) and opens the existing hero sheet: passive, spell with current values, boons taken. Tap-away resumes. This also gives battle a pause button for free — a thing it currently lacks.
4. **Passives get one moment.** Battle-start passives (Berrik's Bulwark grant, Maravel's roots) fire a single labelled pulse at battle start from the plaque, so "why does my front line have extra armour" is answered on screen.

---

## 2. Power must be visible in Muster — stats wear their buffs

**Problem:** boons apply silently to numbers the player never compares. A boon that says "+1 ATK to front-row stacks" changes four numbers nobody was staring at. Magic boons are worst: they buff a spell that (until §1) was itself invisible.

1. **Delta stats.** Anywhere a stack's effective ATK/HP differs from the unit's printed base, render the number in the buff colour (gold-green) instead of white. The InspectSheet gains a breakdown line: `ATK 5 = 3 base + 1 Growth + 1 Overwatch boon`. One tap answers "why is this number big," which is the entire Might branch made visible.
2. **Boons apply with a flourish.** When a boon is picked, don't just close the modal — the affected cards on the board flash and float their change (`+1 ATK`) as the modal closes. If the boon affects future purchases instead ("+2 count when recruited"), float the text over the War Camp instead. The rule: **every boon pick visibly touches the thing it changed, within one second of being chosen.**
3. **Boon strip.** A row of small boon icons under the hero portrait in Muster (tap = hero sheet). Boons currently vanish into a sheet nobody opens; this keeps the run's accumulated identity on screen.
4. **Magic boons preview their math.** The Magic-branch boon card shows the spell's before → after: "Rejuvenate: heals 12 → 18, casts 1× → 2×". Same numbers the battle banner (§1.2) will then prove. Pick → preview → proof is the whole loop that makes Magic feel real.
5. **Battle-conditional effects stay in battle** — Frenzy, Deathcry, battle-start auras belong to §1's presentation, not Muster. Muster shows what is *already true*; battle shows what *triggers*. (This is the one nuance on the original suggestion — showing conditional battle effects as Muster stats would claim power the stack doesn't have yet.)
6. **Spell receipt on the result screen.** One line: "Your spells: 42 healing, 2 casts" / "Enemy spells: 31 damage." Makes the Magic branch auditable across a run.

---

## 3. Board orientation — Design Notes 01 was wrong, fix it

DN01 §1.3 said "back line on top, front line at the bottom, everywhere." The implementation faithfully followed it (`MusterScreen` ~line 347, `BattleScreen` ~line 267) — and it produces a spatial lie: in battle, rows render back-over-front *for both sides*, so the enemy's front line visually bears down on **your back line**. The two front lines never touch. This is exactly the confusion reported in playtesting, and it compounds the §DN02 back-line problem: the layout implies your back row is the wall.

**Corrected rule — the battlefield is a vertical axis:** enemy back (top), enemy front, ── divider ──, **your front, your back (bottom)**. The front lines meet at the divider like a real battle line; your back line is tucked safely at the bottom nearest your thumb. Muster mirrors your half exactly: FRONT LINE on top, BACK LINE below it. Update the row labels' positions, the two code comments citing DN01, and the row-info sheet text. Nothing about targeting changes — this is purely making the picture match the rules.

---

## 4. Projectile trails (confirming scope already specced)

Arcing volley projectiles are already specified in DESIGN_NOTES_02 §3.1 — if that isn't built yet, build it as part of this pack. One extension now that art exists: **the projectile takes its flavour from the attacker** — units tagged with a `projectile` field in data (`'bolt' | 'arrow' | 'spark' | 'harpoon'`, defaulting by faction: Vanguard bolts, Verdant pale-green arrows, Stormtide lightning-lashed harpoons/sparks, mercs plain arrows) tint and shape the streak. It's one CSS class per flavour, not a particle system. Melee keeps the lunge; the two must stay instantly distinguishable.

---

## 5. Promotion lines — more of them, but not universal

**Request considered: every unit gets a 3-form line.** Pushing back, with the counter-proposal below.

### 5.1 Why not universal

- **Banner Ranks already are the universal progression.** Every stack, no exceptions, walks base → Veteran → Honored. A universal 3-form promotion line would be a *second* universal three-step track stapled to the same units — the two systems would compete for the same gold and the same emotional beat, and Ranks (DN01's best idea) would lose.
- **Lines are special because they're scarce.** The Militia→Footman→Champion arc lands because it's *the* story of the faction. Thirty-eight of those stories is none of them.
- **It triples the art and balance surface** (38 → ~114 forms) while flattening unit identity — the Mule Cart and the Leviathan do not want to be growth arcs.

### 5.2 What we do instead — every faction gets exactly two full 3-form lines

One melee line, one ranged line, per faction. The melee lines already exist. The ranged lines currently stop at T2 — so they each get a **new T4 top form**, and the promotion decision stays interesting all game:

| Faction | Melee line (exists) | Ranged line (completed by this pack) |
|---|---|---|
| Vanguard | Militia → Footman → Sunforged Champion | Crossbow Levy → Arbalest → **Sunlance Ballistier** (NEW) |
| Verdant | Sapling Warden → Thornbark Sentinel → Elderbark Colossus | Dryad Skirmisher → Moonshade Archer → **Moonbow Matriarch** (NEW) |
| Stormtide | Clan Raider → Bloodfang Reaver → Stormfang Warlord | Tide Slinger → Squall Harpooner → **Stormspear Tidecaller** (NEW) |

New unit baselines (sim-tune from here; T4 promote cost 7g per GDD §5.2):

| id | Unit | Tier | ATK/HP | Init | Muster | Row | Keywords |
|---|---|---|---|---|---|---|---|
| `vg_ballistier` | Sunlance Ballistier | 4 | 6/4 | 5 | +1 | back | Volley |
| `vd_matriarch` | Moonbow Matriarch | 4 | 5/4 | 6 | +1 | back | Volley, Growth |
| `st_stormspear` | Stormspear Tidecaller | 4 | 5/5 | 6 | +1 | back | Volley, Frenzy |

Each also needs a Banner Rank block in data (follow the faction's pattern; sim-check). They appear in the camp offer pool at Tier 4 like any T4, so the line can be *entered* late as well as promoted into. Mercs deliberately get no lines — hired help doesn't grow.

**Sim guardrails:** ranged-line adoption rate, and the DN02 volley-balance columns re-run — three new strong Volley units shifts the ranged mix, so this lands *after* Cover (or in the same branch), not before.

### 5.3 Art continuity — the line IS one person (rule now enforced, and two fixes)

New hard rule in ART_DIRECTION (§art already updated): **every form in a line is generated using the previous form's art as a character reference. Same individual, same species, same gender, visibly older/grander.** The audit found two breaks in the current live set, both now re-painted:

- `vd_moonshade` (Moonshade Archer): was a male elf mid-line between two female dryad forms → **regenerated** as the same dryad from `vd_dryad`, matured.
- `st_harpooner` (Squall Harpooner): was an orc mid-line between two troll forms → **regenerated** as the same troll from `st_slinger`, hardened.

All five plates (2 regens + 3 new units) are in the art drop: `public/art/units/{vd_moonshade, st_harpooner, vg_ballistier, vd_matriarch, st_stormspear}.webp`, with `src/data/art.ts` regenerated to include the three new ids. The InspectSheet promotion-line preview (GRAPHICS_UPDATE §3.2) is where this pays off — verify it shows all three faces aging in sequence.

---

## 6. Acceptance criteria

1. Watching one battle at 1×, a viewer can say what each hero cast, at whom, and what it did — without opening any sheet.
2. Tapping either hero plaque pauses the battle and shows their kit; resuming is one tap.
3. After picking any boon, something on screen visibly changes within one second; buffed stats render in the buff colour with a tap-through breakdown.
4. Muster shows FRONT LINE above BACK LINE; battle shows the two front lines meeting at the divider. The DN01-citing comments are corrected.
5. Volley projectiles arc with per-faction flavour; melee lunges. Distinguishable at 2×.
6. Each faction has two complete 3-form lines; promotion previews show the same character maturing across all three forms.
7. All existing tests pass; new-unit data passes the art-manifest test; sim re-run posts the §5.2 guardrail columns.

## 7. Suggested commits

1. `fix(ui): battlefield orientation — front lines meet at the divider` (small, ship first)
2. `feat(ui): hero plaques, spell banners, cast FX, tap-to-pause`
3. `feat(ui): delta stats, boon apply flourish, boon strip, magic previews, spell receipts`
4. `feat(data): complete the three ranged promotion lines + art hookup`
5. `feat(ui): flavoured volley projectiles` (with or after the DN02 branch)
6. `chore(sim): line-adoption + re-run volley columns; report numbers`

*— End of Design Notes 03 —*
