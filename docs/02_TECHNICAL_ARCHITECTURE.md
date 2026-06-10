# 02 — Technical Architecture

## 1. Architectural intent

The system is designed around one non-negotiable rule:

> The statistical prediction engine is fully isolated from the React UI layer. The UI never computes a prediction. It only renders predictions that have been produced by the engine and persisted to the database.

Every other architectural decision flows from that rule. It keeps the engine portable (it can be invoked from a cron job, an API route, or a script), keeps it testable (pure functions over typed inputs), and prevents accidental coupling between rendering concerns and probabilistic computation.

## 2. Layered overview

```
+----------------------------------------------------+
|                    Presentation                    |
|   Next.js App Router · React Server Components     |
|   Tailwind CSS · Recharts · shadcn-style primitives|
+----------------------------------------------------+
                        |
                        v
+----------------------------------------------------+
|                    Application                     |
|   Server Actions · Route Handlers · Query layer    |
|   Reads predictions and fixtures from Postgres     |
+----------------------------------------------------+
                        |
                        v
+----------------------------------------------------+
|                  Prediction Engine                 |
|   lib/model · lib/simulation · lib/normalization   |
|   Pure TypeScript · No React · No I/O at core      |
+----------------------------------------------------+
                        |
                        v
+----------------------------------------------------+
|                     Data Layer                     |
|   Supabase / PostgreSQL · Row-Level Security       |
|   Append-only predictions · Fixtures · Teams       |
+----------------------------------------------------+
                        ^
                        |
+----------------------------------------------------+
|             Ingestion and Scheduling               |
|   Vercel Cron · API adapters · Mock data adapter   |
|   lib/scheduler · lib/data                         |
+----------------------------------------------------+
```

## 3. Technology choices

| Concern              | Choice                                | Rationale                                                         |
|----------------------|---------------------------------------|-------------------------------------------------------------------|
| Framework            | Next.js (App Router)                  | Server Components, route handlers, first-class Vercel deployment  |
| Language             | TypeScript (strict)                   | Type-safe model contracts between engine, DB, and UI              |
| Styling              | Tailwind CSS                          | Rapid, consistent visual system without bespoke CSS infrastructure|
| Database             | PostgreSQL via Supabase               | Relational integrity, RLS, generous free tier, JS client          |
| Charts               | Recharts                              | React-native, sufficient for the data-journalism aesthetic        |
| Tests (engine)       | Vitest                                | Fast, TS-first, ergonomic for pure-function model code            |
| Hosting              | Vercel                                | Native Next.js, scheduled jobs via Cron, zero-config deploys      |
| Scheduling           | Vercel Cron                           | Triggers prediction runs at fixed UTC intervals                   |

The Vercel Workflow product is a candidate for the prediction lifecycle (T-3h → FT) if the orchestration ever needs durable retries or pause/resume semantics. v1 uses simple Cron because the lifecycle is short-lived and idempotent.

## 4. Source layout

```
src/
  app/                       Next.js routes (server components by default)
  components/                Presentational React components only
  lib/
    model/                   Ratings, form, xG approximation, Poisson matrix
    simulation/              Monte Carlo match and tournament simulators
    data/                    Adapters: mock first, then real sports APIs
    normalization/           Map external feeds to internal canonical types
    scheduler/               Cron handlers, run-type dispatch
    types/                   Shared domain types (Team, Match, Prediction)
    utils/                   Pure helpers (date math, Poisson PMF, RNG)
  mock/                      Static fixtures used before real APIs land
supabase/                    SQL migrations and RLS policies
docs/                        Architecture and product documentation
```

## 5. Engine isolation contract

The engine exposes a single conceptual entry point per `run_type`:

```ts
// lib/model/predict.ts (conceptual)
export function predictMatch(input: PredictionInput): PredictionOutput
```

Rules:

- `lib/model`, `lib/simulation`, `lib/normalization`, `lib/utils` MUST NOT import anything from `react`, `next`, `@/components`, or `@/app`.
- The engine consumes plain typed inputs and returns plain typed outputs. It performs no network I/O and no database writes.
- Persistence of engine output is the responsibility of `lib/scheduler` (and, for ad-hoc runs, server actions in the app layer).
- A lint rule or import-boundary check should enforce this in CI once the codebase exists.

## 6. Data model (high level)

The schema is append-only for predictions. No prediction is ever updated in place.

- `teams` — canonical team identity, FIFA code, current rating, region.
- `matches` — fixtures (round, group, venue, kickoff UTC, status, scores).
- `predictions` — append-only. One row per `(match_id, run_type, model_version, scheduled_for)`, plus `executed_at` (when the run actually ran) and a `data_snapshot` reference (the inputs used). Stores probability vector, expected goals, top-N scorelines, confidence, and any engine `warnings`. `run_type` values are exactly `T_MINUS_3H | T_MINUS_1H | T_ZERO | HT | FT`.
- `model_runs` — metadata for each scheduled invocation: trigger, duration, status, error.
- `accuracy_reviews` — FT evaluation: Brier score, log-loss, scoreline correctness, calibration bucket.
- `data_sources` — registry of ingestion adapters and licensing terms, with the canonical column set defined in `docs/04_DATA_AND_LEGAL_POLICY.md` §4.3: `provider_name`, `endpoint`, `data_type`, `license_terms_notes`, `attribution_required`, `allowed_usage`, `rate_limits`, `fetched_at`, `added_at`, `reviewed_at`.

Detailed schema lives in `supabase/` once migrations are authored.

## 7. Prediction lifecycle flow

1. A Vercel Cron job fires every N minutes and asks the scheduler which matches are due for each `run_type` (`T_MINUS_3H`, `T_MINUS_1H`, `T_ZERO`, `HT`, `FT`).
2. For each due match, the scheduler invokes the appropriate engine entry point with the relevant inputs (ratings, recent form, lineup if available, in-play state if applicable).
3. The engine returns a `PredictionOutput`. The scheduler writes a new row into `predictions` — never an update.
4. The UI reads the most recent row per `(match_id, run_type)` for display, and the full history for the detail view.
5. At FT, the scheduler additionally writes an `accuracy_reviews` row comparing the most recent prediction at each marker against the observed result.

## 8. Data ingestion

A `data/` adapter interface abstracts external sources:

```ts
interface FixtureSource {
  listMatches(window: DateRange): Promise<RawMatch[]>
  getLineup(matchId: string): Promise<RawLineup | null>
  getLiveState(matchId: string): Promise<RawLiveState | null>
}
```

v1 ships with a `MockFixtureSource` backed by `src/mock/`. Real adapters are added behind the same interface so the rest of the system does not change. Normalisation from `RawX` to internal canonical types happens in `lib/normalization`.

## 9. Rendering strategy

- Schedule and match-detail pages are Server Components. They query Postgres directly via a typed query layer.
- Live status (countdown, in-play markers) is hydrated as a small Client Component with a polling or revalidation hook.
- Recharts visualisations live inside Client Components and receive already-computed prediction payloads as props.

## 10. Deployment

- Hosted on Vercel.
- Environment variables for Supabase and any sports API live in Vercel project settings; never committed.
- Database migrations applied via the Supabase CLI in a CI step.
- Cron schedules defined in project configuration; a single cron entrypoint fans out to the appropriate lifecycle handler.

## 11. Observability

- Structured logging on every cron run (`model_runs` table + console).
- Errors in the engine throw typed exceptions; the scheduler records the failure and the run is retried on the next cron tick.
- An internal `/admin` view (gated, not public) summarises recent runs, failures, and accuracy trends.
