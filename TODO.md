# Tracked debt

Things that are correct today and will silently become wrong when something
else lands. Each entry names the trigger, the work, and the test that fails
when the trigger fires — an entry with no failing test is a note, not a TODO.

## Re-point War Tiers 4, 6 and 7 when DN08 §5 lands

**Trigger:** DN08 "The Long Campaign" changes the economy baselines — starting
banner HP 30 → 50, income ceiling 10 → 18, and real War Chests.

**Why:** DN09 specified three tier rules against DN08's numbers, but DN09
shipped first. They are currently set as proportions of the *live* baselines so
the ladder's shape is right today. When the baselines move, the proportions
stop meaning what they were authored to mean.

| Tier | Rule | DN09 spec | Ships as | Re-point to |
| --- | --- | --- | --- | --- |
| 4 | Thin Rations | 50 → 42 HP | `playerHp: -5` on a 30 baseline | `playerHp: -8` on 50 |
| 6 | Their War Chests | rivals' gold talents pay twice | `rivalIncomeTalentMult: 2` | re-check against real War Chests — the multiplier may be the wrong lever once the talents exist |
| 7 | Long Supply Lines | 18 → 15 ceiling | `playerIncomeCap: -3` on a 10 baseline | `playerIncomeCap: -3` on 18, then re-measure |

Tier 7 is the one that has already moved once: DN09's ratio gave -2, it bit for
barely a point at 900 lobbies, and the designer re-pointed it at a
15 → 13-equivalent. Whatever DN08 makes the ceiling, re-measure rather than
re-deriving the ratio.

**Do it in the same change as DN08 §5, not after.** A tier ladder tuned against
a dead economy is worse than no ladder, because it reads as authored.

**The test that fails:** `tests/tiers.test.ts` → "the DN08 substitutions are
pinned to today's baselines". It asserts `START_HP === 30` and
`BASE_INCOME_CAP === 10` and points back here. Changing either baseline without
re-pointing the tiers turns the suite red.
