-- War Tiers (Design Notes 09 §7.4): every run row records the tier it was
-- climbed at, so the dashboard can slice win rate and faction spread by tier.
--
-- Idempotent like everything in this directory: the runner replays every file
-- on every boot and there is no bookkeeping table.
--
-- DEFAULT 1 is the whole backfill. Every run recorded before this column
-- existed was played on the ladder's bottom rung by definition, so the default
-- is not a placeholder — it is the correct value for all of them.
ALTER TABLE runs ADD COLUMN IF NOT EXISTS tier int NOT NULL DEFAULT 1;

-- §7.2 wants per-tier columns in the report; grouping by tier is the hot path.
CREATE INDEX IF NOT EXISTS runs_tier_idx ON runs (tier);
