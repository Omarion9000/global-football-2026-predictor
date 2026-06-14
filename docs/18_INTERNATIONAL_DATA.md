# 18 — National-team data pipeline

Phase 9A introduces national-team match data to the project, alongside (not
replacing) the Phase 8A Premier League corpus and Phase 8B/8C backtest layer.
This document covers the source, the licence, the filter, the schema
additions, and how to reproduce the corpus + load it into Neon.

> Real club names live in EPL paths. Real national-team names live here. The
> deployed public UI continues to render the fictional mock tournament — no
> public surface names real teams or carries restricted-mark branding.

## 1. Source and licence

- **Source**: [github.com/martj42/international_results](https://github.com/martj42/international_results), file `results.csv`.
- **Licence**: **CC0 1.0 Universal** (Public Domain Dedication). No
  restrictions on use or redistribution.
- **Raw URL**: `https://raw.githubusercontent.com/martj42/international_results/master/results.csv`
- **Columns**: `date, home_team, away_team, home_score, away_score, tournament, city, country, neutral`.
- **Coverage**: 49,477 rows / 200 distinct `tournament` values / **1872 → today**.

Attribution string: `Data: martj42/international_results (CC0)`. Stored in
`data_sources` via migration 0003.

## 2. Filter — "top-tier competitions only"

The corpus carries 37 % friendlies plus a long tail of minor / regional
tournaments. For Phase 9A's competitive-match modelling scope we ingest
**only the 15 top-tier values** below (exact string match, accent-preserving):

```
FIFA World Cup
FIFA World Cup qualification
UEFA Euro
UEFA Euro qualification
Copa América
African Cup of Nations
African Cup of Nations qualification
AFC Asian Cup
AFC Asian Cup qualification
Gold Cup
CONCACAF Nations League
UEFA Nations League
Confederations Cup
Oceania Nations Cup
Oceania Nations Cup qualification
```

Notes:
- The corpus uses the geographic name **"Oceania Nations Cup"**, not the
  confederation abbreviation "OFC". Both qualifier and finals strings use
  "Oceania".
- `Copa América` carries the accent in the corpus. The parser does an
  exact match — no Unicode normalisation.
- Friendlies and second-tier regional tournaments (Asian Games, EAFF, AFF,
  Pacific Games, Gulf Cup, COSAFA, CECAFA, CFU, CONIFA, Olympics, …) are
  **deliberately excluded** to keep rating noise down. The decision is
  reversible — extending `TOP_TIER_TOURNAMENTS` in `parseResults.ts` and
  re-running the loader picks up the new rows idempotently.

**Yield**: ~20,034 matches across the 223 distinct nations that ever played
in any of the 15 included competitions (including historical nations like
Czechoslovakia, German DR, Saarland, Yugoslavia, Vietnam Republic, Yemen DPR).

## 3. Schema additions (migration 0003)

Three structural deltas plus one data registration. All idempotent.

| Change | Detail |
|---|---|
| **Drop UNIQUE on `teams.code`** | ISO 3166-1 alpha-3 codes for national teams (`BEL`, `ETH`, `CHE`, `NOR`, …) collide with existing mock/EPL codes. After the drop, `code` is a display abbreviation; `id` remains the canonical PK. |
| **Add `'INTERNATIONAL'` to `fixtures.stage` CHECK** | The corpus doesn't record granular tournament stage (group vs. R16 vs. final) at the row level, so `INTERNATIONAL` is a catch-all for national-team matches we ingest from this source. |
| **Add `fixtures.tournament text` (NULLABLE)** | Free-text competition name from the corpus. NULL for mock + EPL rows. |
| **Register `data_sources` row** | `provider_name='martj42/international_results'`, CC0 licence note. |

Migration runner:

```bash
pnpm db:migrate:postgres:0003
```

## 4. Canonical team map

`src/lib/data/sources/internationalResults/teamMap.ts` carries the
**`CANONICAL_NATIONS`** array — one entry per nation that appears in the
filtered corpus (223 entries; 213 current + 10 historical / defunct). Each
entry includes:

- `slug` — kebab-case (`belgium`, `man-united`-style for nations: `north-macedonia`, `republic-of-ireland`, …). DB id = `nat-{slug}`.
- `displayName` — corpus-canonical English name.
- `code` — 3-letter abbreviation. ISO 3166-1 alpha-3 for most; FIFA codes for the UK home nations (ENG/SCO/WAL/NIR), Kosovo (KOS), and defunct/transitional entities (TCH for Czechoslovakia, GDR for East Germany, YUG for Yugoslavia, SAA for Saarland, VRP for Vietnam Republic, YDR for Yemen DPR).
- `confederation` — one of `AFC / CAF / CONCACAF / CONMEBOL / OFC / UEFA`.
- `corpusNames` — list of corpus-side names that resolve to this nation (almost always one entry).

**Membership counts (frozen by test):** UEFA 59, AFC 48, CAF 54, CONCACAF 41, CONMEBOL 10, OFC 11.

Historical / transitional confederation moves:
- **Israel**: AFC → UEFA (1994). Classified as **UEFA** (current).
- **Kazakhstan**: AFC → UEFA (2002). Classified as **UEFA** (current).
- **Australia**: OFC → AFC (2006). Classified as **AFC** (current).

The corpus model treats each federation as a single rating series rather than splitting on the confederation change.

**Hard-fail on unmapped names.** An integration test scans the live corpus and asserts every distinct team resolves. Adding any new national team requires extending `CANONICAL_NATIONS` first.

## 5. Loader

`src/lib/data/sources/internationalResults/loader.ts` is pure ingestion logic.
It resolves every team via the canonical map upfront — a single unmapped name
halts the whole load before any partial write — then upserts:

- one `teams` row per distinct nation (`region` from the confederation
  mapping, `code` from the canonical alpha-3, `is_host_nation=false`).
- one `fixtures` row per match, with:
  - `stage='INTERNATIONAL'`
  - `tournament=` the corpus value
  - `venue_name='martj42-international-results'` (provenance marker)
  - `venue_city=` corpus city (falls back to `'Unknown'`)
  - `venue_country=` corpus country (full English name)
  - **`neutral=true`** → `{is_home_for_team_a:false, is_home_for_team_b:false}`
  - **`neutral=false`** → `{is_home_for_team_a:true, is_home_for_team_b:false}` (the corpus's `home_team` is team_a)
- one `match_results` row per match with `status='FULL_TIME'` and
  `finished_at` set to the corpus date at 15:00 UTC.

### Idempotency

| Table | Idempotency key |
|---|---|
| `teams` | `id` PK (`nat-{slug}`) |
| `fixtures` | `id` PK = `intl-{YYYY-MM-DD}-{home-slug}-{away-slug}` |
| `match_results` | natural unique `(fixture_id)` from 0001 |

Re-runs produce all-zero insert counts.

## 6. Reproduce

```bash
# 1. Download the corpus (one-shot — the source ships static CSV)
mkdir -p data/raw
curl -sSL -o data/raw/international_results.csv \
  https://raw.githubusercontent.com/martj42/international_results/master/results.csv

# 2. One-time schema migration
vercel env pull .env.local --environment=production
pnpm db:migrate:postgres:0003

# 3. Load (idempotent)
pnpm intl:load --dry-run   # preview counts
pnpm intl:load             # apply

# 4. Clean up
rm -f .env.local
```

`data/raw/` is gitignored. The loader emits a JSON summary on stdout with
`matchesScanned / teamsSeen / teamsInserted / fixturesInserted /
resultsInserted / distinctTournaments / parsed.rejected`.

## 7. Out of scope for Phase 9A

- **No cron / UI changes.** The public deployed surfaces continue to render
  the mock tournament. The scheduler still reads `MockFixtureSource`.
- **No engine changes.** `MODEL_VERSION = "v0.1.0"`. Phase 9B (or later)
  will write a backtest layer over the loaded national-team data.
- **No model fit at load time.** The model fit window (e.g. `>= 2014-01-01`)
  is a query-time decision the next phase makes — ingest stores everything
  top-tier all-time.
- **No second-tier / friendly ingest.** Reversible if a real model use case
  emerges.
