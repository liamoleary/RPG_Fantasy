# BANNERFELL — Playtest Launch Plan

Companion to `GAME_DESIGN.md` and `DESIGN_NOTES_01–04`. This is an infrastructure spec, not a game-design doc: it turns the single-player client into a playtest service with **accounts, server-saved progress, feedback capture, and run telemetry**, all on the existing Railway deployment. Where it conflicts with earlier docs (notably GDD §12's "localStorage only"), this wins.

**One correction to a common assumption first: Railway does not save user data by itself.** It runs the server and (today) serves static files; anything a player earns lives in their browser's localStorage and dies with a cleared cache. Persistence requires a database. This plan uses **Railway's managed Postgres** (one-click addon; `DATABASE_URL` env var appears automatically) — chosen over SQLite-on-a-volume because it survives redeploys and service moves, supports concurrent writes safely, and Railway backs it up.

---

## 1. Accounts — zero-friction, no passwords, no PII

Testers must reach the tavern in seconds. Model: **device accounts with link codes.**

- **First visit:** the client calls `POST /api/account` → server creates an account row and returns `{ accountId, token, linkCode }`. The token (a 128-bit random secret, not a JWT) is stored in localStorage and sent as `Authorization: Bearer` on every call. The player picks a **display name** (pre-filled from a fantasy name-bank; profanity-filtered; max 20 chars). No email, no password, no personal data — there is nothing to breach.
- **Playing on a second device:** Settings shows **"Link this account — code: BRAVE-STAG-41"** (three-word-and-number format, regenerable, single-use, 15-minute expiry). Entering it on another device via `POST /api/account/link` transfers the token to that device and invalidates the code. This is account recovery too: losing every linked device loses the account, and for a playtest that is an acceptable trade for zero-friction onboarding — say so in the FAQ.
- **Server hygiene:** tokens hashed at rest (SHA-256); rate-limit account creation by IP (5/hour) so the endpoint can't be farmed; a `lastSeen` timestamp for pruning dead accounts later.

## 2. Save sync — the server owns your legend, the device owns your run

Split the save exactly along the existing `persist.ts` seam:

- **Server-authoritative (synced):** `renown`, `unlocks`, `feats`, `stats` — the meta-progression. Synced via `GET /api/save` on boot and `PUT /api/save` after every run end, level unlock, and feat award. Payload is the existing versioned JSON; server stores it as `jsonb` with a `saveVersion` and `updatedAt`.
- **Device-local (NOT synced):** `activeRun` and `settings`. A mid-run snapshot every phase would hammer the API for no benefit — a run is 20 minutes on one device, and cross-device *mid-run* handoff is out of scope. Run resume keeps working exactly as it does today.
- **Conflict rule:** last-write-wins, but the server rejects a `PUT` whose `renown` is *lower* than stored unless it carries the `runDelta` flag (i.e. it came from an actual run-end write) — this stops a stale device from silently wiping progress, without building real merge machinery. On rejection the client refetches and reapplies its delta.
- **Offline (PWA):** queue the pending `PUT` in localStorage and flush on reconnect. The game must remain fully playable offline; sync is a background courtesy, never a gate. **Never block play on any API call.**
- **Migration:** on first authenticated boot, existing localStorage progress is pushed as the initial server save — current testers (Liam) lose nothing.

## 3. Feedback widget — capture the moment, not a memory

A small **banner-and-quill button**, present on the Muster screen and prominent on the Result screen ("How was that run?").

- **Form:** 1–5 star rating, one free-text box, optional category chips (`Fun` / `Confusing` / `Too hard` / `Too easy` / `Bug` / `Idea`). Two taps to submit. Never mandatory, never a popup interrupt.
- **Auto-context attached silently:** accountId, display name, app `BUILD_ID`, and a game-state snapshot — phase, round, hero, faction, boons taken, board (unit ids + counts + ranks), gold, HP, placement so far, current battle seed. When the category is `Bug`, also the last 50 battle-log events, compressed. A tester writes "my cleric did nothing???"; the snapshot tells us she was rooted by Bramble Coil the whole fight.
- **Storage:** one `feedback` table row per submission (`jsonb` context). `POST /api/feedback`, rate-limited 10/hour/account.

## 4. Run telemetry — the data that makes feedback actionable

At every run end the client fires one `POST /api/runs` summary: hero, faction, placement, rounds survived, final board composition, boons picked per branch, camp tier curve, promotions made, ranks earned, apex fires, damage dealt/taken totals, run duration, and the lobby's rival archetypes. One row per run, `jsonb` details.

This is the difference between "the elves feel weak" (shrug) and "Verdant is placing 5.4 average across 60 runs and nobody picks the stag line" (actionable). It is also how we'll validate every DN02–04 sim prediction against *real humans*.

**Privacy note (put it in the FAQ):** telemetry is gameplay-only — no device info beyond a coarse user-agent string, no location, no tracking outside the game. Display names are the only human-entered data anywhere in the system.

## 5. Getting the data out — the Liam ⇄ designer loop

- `GET /api/admin/export?key=<ADMIN_KEY>` → one JSON bundle: accounts (id, name, renown, runs), all runs, all feedback. `&format=csv` gives three CSVs zipped. `ADMIN_KEY` is a long random Railway env var; the endpoint 404s (not 403s) on a wrong key.
- `GET /api/admin/summary?key=…` → tiny HTML dashboard: testers, runs today, placement by hero/faction, star-rating histogram, latest 20 comments. Enough to check the pulse from a phone without exporting.
- **The loop:** every few days Liam downloads the export, drops it in the `_Games` folder, and I (design side) turn it into the next `DESIGN_NOTES_XX.md` — triaged feedback, telemetry findings, balance changes for the sim harness to verify. That loop is the actual purpose of this entire document.

## 6. Versioning and the update path

- Embed `BUILD_ID` (git SHA + date) at build time; every API call sends it. Server exposes `GET /api/version`; the client checks on boot and on visibility-change, and shows a **"New version — tap to update"** toast (skips waiting service worker + reload) when behind. Stale PWAs silently running old balance is the classic playtest data-poisoner — this prevents it.
- Feedback and runs are tagged with `BUILD_ID`, so "is this complaint from before the fix?" is always answerable.

## 7. Hardening (playtest-appropriate, no more)

- Same-origin API only (no CORS), Express JSON body limit 64KB, per-token rate limits, `helmet` headers, parameterised queries throughout.
- Payload validation on every endpoint (zod or hand-rolled guards): unknown fields dropped, sizes capped, save payloads schema-checked against `SAVE_VERSION`.
- Trust model: **scores are self-reported by clients** — a motivated friend can cheat their renown. Accepted for a playtest; do not build anti-cheat, do build the assumption into how we read leaderboards (there is no leaderboard yet — see §9).
- Migrations as plain SQL files run on boot (`CREATE TABLE IF NOT EXISTS` …). Tables: `accounts`, `saves`, `link_codes`, `feedback`, `runs`.

## 8. Rollout checklist

1. Add Railway Postgres to the project; confirm `DATABASE_URL` present in the service.
2. Set `ADMIN_KEY` env var (long random string).
3. Deploy; hit `/healthz` (now also reports DB connectivity) and `/api/version`.
4. Play one full run on a phone: account auto-created, name picked, run logged, feedback submitted, progress visible in `/api/admin/summary`.
5. Link-code test: open on a second device, enter code, confirm same renown.
6. Kill the tab mid-run; reopen — run resumes (local), meta intact (server).
7. Send friends the URL + the three-line FAQ (no passwords; link code moves your account; feedback button please).

## 9. Explicitly out of scope (so it stays a playtest, not a product)

Leaderboards, real-time anything, email, password reset, GDPR tooling, moderation queues, account deletion UI (Liam can delete rows by hand), analytics dashboards beyond §5, and anti-cheat. Every one of these is a rabbit hole; none makes the feedback loop better this month.

---

## 10. Acceptance criteria

1. A fresh phone reaches the faction-select screen in under 10 seconds with no signup step; the account exists server-side with the chosen name.
2. Meta-progression survives: clear site data (or use another device via link code) → renown, unlocks and feats return from the server.
3. The game is fully playable with the API down or offline; sync resumes without data loss when it returns.
4. Every completed run creates one `runs` row; every widget submission creates one `feedback` row with full context; both carry `BUILD_ID`.
5. The admin export returns the complete dataset; the summary page renders on a phone.
6. A stale client gets the update toast within a minute of a deploy.
7. Existing tests pass; new tests cover: account create/link (incl. expiry + single-use), save PUT/GET round-trip, the stale-write rejection rule, feedback/run validation caps, and admin-key gating.
8. No password fields exist anywhere; no PII beyond display name is stored.

## 11. Suggested commits

1. `feat(server): Postgres wiring, migrations, healthz DB check`
2. `feat(server): accounts + link codes + bearer auth + rate limits`
3. `feat(app): server save sync with offline queue and migration from localStorage`
4. `feat(app): feedback widget with auto-context capture`
5. `feat(app): run telemetry`
6. `feat(server): admin export + summary page; BUILD_ID + update toast`
7. `docs: tester FAQ (three lines) on the Home screen`

*— End of Launch Plan —*
