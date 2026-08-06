-- Launch Plan §7: "Migrations as plain SQL files run on boot (CREATE TABLE IF
-- NOT EXISTS …). Tables: accounts, saves, link_codes, feedback, runs."
--
-- Every statement here is idempotent, because the runner replays the whole file
-- on every boot rather than keeping bookkeeping state. Adding a column later
-- means a new numbered file using ADD COLUMN IF NOT EXISTS.
--
-- No PII beyond display_name lives anywhere in this schema (§10.8).

CREATE TABLE IF NOT EXISTS accounts (
  id           text PRIMARY KEY,
  display_name text NOT NULL,
  -- SHA-256 hex digests, one per linked device (§1). Plural because a link code
  -- grants a *second* device access without evicting the first; the raw tokens
  -- exist only on the devices that hold them.
  token_hashes text[] NOT NULL DEFAULT '{}',
  build_id     text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen    timestamptz NOT NULL DEFAULT now()
);
-- Bearer auth looks an account up by hash on every call, so it needs an index.
CREATE INDEX IF NOT EXISTS accounts_token_hashes_idx ON accounts USING gin (token_hashes);

CREATE TABLE IF NOT EXISTS saves (
  account_id   text PRIMARY KEY REFERENCES accounts (id) ON DELETE CASCADE,
  save_version int NOT NULL,
  -- Denormalised out of `data` so the §2 stale-write rule and the §5 summary can
  -- compare renown without unpacking jsonb on every row.
  renown       int NOT NULL DEFAULT 0,
  data         jsonb NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS link_codes (
  code       text PRIMARY KEY,
  account_id text NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  -- Single-use: set on redemption, checked on every attempt (§1).
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS link_codes_account_idx ON link_codes (account_id);

CREATE TABLE IF NOT EXISTS feedback (
  id         bigserial PRIMARY KEY,
  -- Feedback outlives the account it came from: deleting a tester by hand (§9)
  -- must not silently delete what they told us.
  account_id text REFERENCES accounts (id) ON DELETE SET NULL,
  rating     int,
  categories text[] NOT NULL DEFAULT '{}',
  message    text NOT NULL DEFAULT '',
  build_id   text,
  context    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feedback_created_idx ON feedback (created_at DESC);

CREATE TABLE IF NOT EXISTS runs (
  id          bigserial PRIMARY KEY,
  account_id  text REFERENCES accounts (id) ON DELETE SET NULL,
  hero_id     text NOT NULL,
  faction_id  text NOT NULL,
  placement   int,
  rounds      int,
  duration_ms int,
  build_id    text,
  details     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS runs_created_idx ON runs (created_at DESC);
-- §5's summary groups by hero and faction; both are hot paths on the dashboard.
CREATE INDEX IF NOT EXISTS runs_hero_idx ON runs (hero_id);
CREATE INDEX IF NOT EXISTS runs_faction_idx ON runs (faction_id);
