# 17 — Real EPL data pipeline

Phase 8D wires the project to its first real-data sources. **Production cron
behaviour is unchanged this phase** — it continues to schedule predictions
from the mock catalog (`src/mock/`). The public UI continues to render
fictional teams. Real club names appear in the database (via the new
ingest / backfill scripts) and in this document; they never appear in
deployed product surfaces.

## 1. Sources

| Source | Used for | Free tier? | Auth |
|---|---|---|---|
| [football-data.org](https://www.football-data.org/) v4 API | Current-season fixtures + finished results | yes (10 req/min) | `X-Auth-Token` |
| [football-data.co.uk](https://www.football-data.co.uk/) season CSVs | Historical backfill (2015-16 .. 2024-25, 3,800 matches) | yes (one-shot download) | none |

Both sources are registered in `data_sources` once 0002 is applied (football-data.org explicitly; the corpus is a one-shot download, not an integrated adapter).

Attribution strings:
- `Data: football-data.org (free tier)`
- `Historical match results & closing odds: football-data.co.uk (Joseph Buchdahl)`

## 2. Schema dependency — migration 0002

The pre-Phase-8D schema's `fixtures.stage` CHECK only permitted tournament stages (`GROUP`, `R16`, `QF`, `SF`, `F`, `THIRD_PLACE`). League matches needed a new value. `supabase/migrations/0002_add_league_stage.sql` widens the CHECK to also permit `'LEAGUE'`, and registers the football-data.org adapter row in `data_sources`. Both statements are idempotent (`DROP CONSTRAINT IF EXISTS` then `ADD`; `INSERT … ON CONFLICT DO NOTHING`).

The migration runner (`scripts/apply-postgres-migration.ts`) now accepts a positional filename:

```bash
# Original behaviour — defaults to 0001_init.sql
pnpm db:migrate:postgres

# Phase 8D — apply the new migration
pnpm db:migrate:postgres:0002
```

There is no `schema_migrations` ledger. Operators pick which file to apply; idempotency is the migration file's responsibility. Re-running 0002 is safe.

## 3. Environment variables

Two server-only secrets:

| Variable | Purpose | Scope |
|---|---|---|
| `POSTGRES_URL` (and optionally `POSTGRES_URL_NON_POOLING`) | Neon Postgres connection | Production |
| `FOOTBALL_DATA_API_KEY` | football-data.org X-Auth-Token | Production |

Set both in Vercel project settings (Production environment). **Never** prefix either with the client-exposed env namespace — that would embed the value in the JavaScript bundle. The client (`src/lib/data/sources/footballData/client.ts`) imports `server-only` as a build-time backstop, and the ESLint UI boundary forbids `@/lib/data/sources/*` from any `src/components/**` source.

For local invocation, the standard pattern:

```bash
vercel env pull .env.local --environment=production
# ... run scripts ...
rm -f .env.local
```

`.env.local` is in `.gitignore` and is the operator's responsibility to remove after each use.

## 4. Adapter shape

```
src/lib/data/sources/footballData/
├── client.ts        # server-only fetch wrapper, X-Auth-Token, 429 retry
├── teamMap.ts       # canonical slug ↔ corpus name ↔ API name (34 clubs)
├── sync.ts          # syncEplSeason(apiClient, sql, opts) — pure ingest logic
└── backfill.ts      # backfillHistoricalCorpus(matches, sql, opts) — pure
```

The scripts (`scripts/sync-epl.ts`, `scripts/backfill-results.ts`) are thin
runners that load env, build the API/SQL clients, and call into the pure
functions above. Both scripts use `tsx --conditions=react-server` so the
`import 'server-only'` chain resolves to its empty re-export rather than
throwing.

### 4.1 sync:epl

```bash
pnpm sync:epl --dry-run   # preview counts, no writes
pnpm sync:epl             # apply
pnpm sync:epl --season=2024
```

Output: a single JSON object with `teamsSeen / teamsInserted / fixturesWritten / finishedFixturesWritten / resultsInserted / skipped{InPlay,Paused,Postponed,Cancelled}`.

Write policy (V1; mirrors the table in `sync.ts`):

| API status | mapping | action |
|---|---|---|
| `SCHEDULED` | → DB `SCHEDULED` | **write fixture** |
| `TIMED` | → DB `SCHEDULED` | **write fixture** |
| `FINISHED` | → DB `FULL_TIME` | **write fixture + match_results** |
| `IN_PLAY` | → DB `IN_PROGRESS` | **skip** (no mid-match state) |
| `PAUSED` | → DB `HALF_TIME` | **skip** (no mid-match state) |
| `POSTPONED` | → DB `POSTPONED` | **skip with counted warning** (mapped but excluded from V1 write policy) |
| `CANCELLED` | → DB `CANCELLED` | **skip with counted warning** (mapped but excluded from V1 write policy) |
| `SUSPENDED` | — | **HARD-FAIL** (genuinely unknown) |
| `AWARDED` | — | **HARD-FAIL** (genuinely unknown) |
| anything else | — | **HARD-FAIL** |

`FINISHED` matches with `score.fullTime.home === null` (or `away === null`) also hard-fail — refuse rather than silently writing `0-0`.

### 4.2 history:backfill

```bash
pnpm history:backfill --dry-run
pnpm history:backfill
```

Reads `data/processed/matches.json` (built by `pnpm history:build` in Phase 8A) and inserts every match into the same canonical schema:

- One `teams` row per distinct club (UEFA region, derived 3-letter TLA).
- One `fixtures` row per match, with `stage='LEAGUE'`, `status='FULL_TIME'`, `venue_name='football-data-co-uk-corpus'` (the marker is a deliberate provenance grep target), `venue_country='ENG'`.
- One `match_results` row per match with `status='FULL_TIME'` and `finished_at` set to the corpus date at 15:00 UTC (the corpus does not carry kickoff times).

## 5. Idempotency

| Table | Idempotency mechanism |
|---|---|
| `teams` | `id` PK; deterministic value `epl-{slug}` |
| `fixtures` | `id` PK; deterministic value `epl-{YYYY-MM-DD}-{home-slug}-{away-slug}` |
| `match_results` | natural key — `fixture_id UNIQUE` column (in 0001) |
| `data_sources` | `UNIQUE (provider_name, endpoint, data_type)` |

Every insert uses `INSERT … ON CONFLICT … DO NOTHING`. Re-running either script produces all-zero counts.

## 6. Reproduce end-to-end

```bash
# One-time per database
vercel env pull .env.local --environment=production
pnpm db:migrate:postgres:0002

# Anytime — populates real EPL data
pnpm sync:epl --dry-run        # peek
pnpm sync:epl                  # apply

# Anytime — backfills the historical corpus (requires the Phase 8A corpus on disk)
pnpm history:fetch             # if not already
pnpm history:build             # if not already
pnpm history:backfill --dry-run
pnpm history:backfill

rm -f .env.local
```

## 7. Out of scope for Phase 8D

- **No cron rewiring.** The scheduler still reads from `MockFixtureSource`. Wiring it to read from real DB fixtures requires its own phase (8F-ish: real `FixtureSource`).
- **No UI changes.** The public surfaces (`/`, `/matches/[fixtureId]`) still render `mockFixtures` / `mockTeams` via `src/lib/data/uiReadModel.ts`. Surfacing real EPL matches in the deployed product would itself touch product copy + the restricted-marks vocabulary.
- **No in-play polling.** `IN_PLAY` and `PAUSED` are deliberately skipped.
- **No predictions on real fixtures.** The engine path doesn't change. Predictions remain mock-only this phase.
