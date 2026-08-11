# Tracked debt

Things that are correct today and will silently become wrong when something
else lands. Each entry names the trigger, the work, and the test that fails
when the trigger fires — an entry with no failing test is a note, not a TODO.

## Re-point War Tiers 6 and 7 when the economy moves again

**Status:** partly discharged. Starting banner HP moved 30 → 50 to lengthen a
run, the tripwire below fired, and **Tier 4 (Thin Rations) was re-pointed from
-5 to its authored -8 in the same change** — 50 → 42 HP, exactly as DN09
specified. That is the process working; it is not something to redo.

**Still outstanding:** the income ceiling is still 10 (DN09 was written against
18) and War Chests still do not exist.

**Trigger:** a change to `BASE_INCOME_CAP`, or War Chests landing.

**Why:** DN09 specified three tier rules against DN08's numbers, but DN09
shipped first. They are currently set as proportions of the *live* baselines so
the ladder's shape is right today. When the baselines move, the proportions
stop meaning what they were authored to mean.

| Tier | Rule | DN09 spec | State | Re-point to |
| --- | --- | --- | --- | --- |
| 4 | Thin Rations | 50 → 42 HP | ✅ `playerHp: -8` on a 50 banner | done — this is the authored value |
| 6 | Their War Chests | rivals' gold talents pay twice | `rivalIncomeTalentMult: 2` | re-check against real War Chests — the multiplier may be the wrong lever once the talents exist |
| 7 | Long Supply Lines | 18 → 15 ceiling | `playerIncomeCap: -3` on a 10 baseline | `playerIncomeCap: -3` on 18, then re-measure |

Tier 7 is the one that has already moved once: DN09's ratio gave -2, it bit for
barely a point at 900 lobbies, and the designer re-pointed it at a
15 → 13-equivalent. Whatever DN08 makes the ceiling, re-measure rather than
re-deriving the ratio.

**Do it in the same change as DN08 §5, not after.** A tier ladder tuned against
a dead economy is worse than no ladder, because it reads as authored.

**The test that fails:** `tests/tiers.test.ts` → "the DN08 substitutions are
pinned to today's baselines". It now asserts `START_HP === 50` and
`BASE_INCOME_CAP === 10` and points back here. It has already earned its keep
once: raising the banner to 50 turned the suite red and named this file, which
is how Tier 4 got re-pointed in the same change rather than months later.
