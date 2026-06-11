# 05 — Build Roadmap

This roadmap is a sprint-by-sprint execution plan. The order is fixed by `CLAUDE.md`: documentation, then scaffolding, then types and mock data, then the engine, then persistence, then scheduling, then the UI, then real data, then the accuracy dashboard. V2+ work happens only after Phase 8 ships.

Each phase has the same structure: **Goal · Deliverables · Files likely touched · Acceptance criteria · What must NOT be done in this phase · Suggested Claude Code prompt.** A phase only starts when the previous phase's acceptance criteria are met.

Schema field names follow `CLAUDE.md`: every prediction row carries `run_type`, `model_version`, `scheduled_for`, `executed_at`, and a `data_snapshot` reference.

---

## Phase 0 — Documentation (current)

**Goal.** Establish the documentation foundation, the architectural rules, and the binding policies before any code is written.

**Deliverables.**
- `docs/01_PRODUCT_BRIEF.md` — vision, users, experience, non-goals.
- `docs/02_TECHNICAL_ARCHITECTURE.md` — layers, data flow, schema overview.
- `docs/03_MODEL_SPEC.md` — inputs, ratings, xG, Poisson, Monte Carlo, evaluation.
- `docs/04_DATA_AND_LEGAL_POLICY.md` — permitted and prohibited data and imagery.
- `docs/05_BUILD_ROADMAP.md` — this document.
- `docs/06_CLAUDE_CODE_RULES.md` — binding rules for AI-assisted contributions.
- `docs/07_DESIGN_SYSTEM.md` — colour, typography, spacing, motion, accessibility tokens consumed by Phase 1 Tailwind config and every later UI phase.
- `README.md` — public-facing project overview.
- `CLAUDE.md` — session-start rules for Claude Code.

**Files likely touched.** `docs/*.md`, `README.md`, `CLAUDE.md`.

**Acceptance criteria.**
- All eight documents above exist and are internally consistent.
- `CLAUDE.md` is concise enough to be read at the start of every session.
- No application code, no `package.json`, no `node_modules`.

**What must NOT be done in this phase.**
- No Next.js app scaffold.
- No package installation.
- No source files under `src/`.
- No Supabase migrations.

**Suggested Claude Code prompt.**
> "Phase 0 review. Read every file under `docs/`, `README.md`, and `CLAUDE.md`. Report any contradictions between documents, any rule in `CLAUDE.md` not reflected in `docs/06_CLAUDE_CODE_RULES.md`, and any prohibited content. Do not modify files."

---

## Phase 1 — Scaffolding and lint boundaries

**Goal.** Stand up an empty Next.js + TypeScript skeleton with the exact folder structure and the engine-isolation lint rule wired up. No product features.

**Deliverables.**
- Next.js App Router project with `tsconfig.json` set to `"strict": true`.
- Tailwind CSS configured with the colour, typography, spacing, radius, and motion tokens from `docs/07_DESIGN_SYSTEM.md` (theme extensions plus CSS variables on `:root` so non-Tailwind contexts can consume the same tokens).
- Folder skeleton under `src/`:
  ```
  src/
    app/
    components/
    lib/
      model/        (index.ts with TODO)
      simulation/   (index.ts with TODO)
      data/         (index.ts with TODO)
      normalization/(index.ts with TODO)
      scheduler/    (index.ts with TODO)
      types/        (index.ts with TODO)
      utils/        (index.ts with TODO)
    mock/
  ```
- Vitest configured; one smoke test in `src/lib/utils` passes.
- ESLint configured with an import-boundary rule that forbids `src/lib/model/**`, `src/lib/simulation/**`, `src/lib/normalization/**`, and `src/lib/utils/**` from importing `react`, `next/*`, `@/components/**`, or `@/app/**`.
- `package.json` scripts populated (`dev`, `build`, `start`, `test`, `lint`, `typecheck`).
- `CLAUDE.md` "Commands" section updated with the now-real commands.
- CI workflow that runs `pnpm install`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

**Files likely touched.** `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `next.config.*`, `tailwind.config.*`, `postcss.config.*`, `.eslintrc.*`, `eslint.config.*`, `vitest.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/lib/**/index.ts`, `src/lib/utils/__tests__/smoke.test.ts`, `.github/workflows/ci.yml`, `CLAUDE.md`.

**Acceptance criteria.**
- `pnpm dev` boots an empty page locally.
- `pnpm test` runs Vitest green.
- `pnpm lint` fails on a deliberate violation (a temporary `import React from 'react'` inside `src/lib/model/index.ts`), proving the boundary rule works.
- CI passes on a PR.
- No domain logic in any file.

**What must NOT be done in this phase.**
- No domain types beyond placeholders.
- No mock fixture data.
- No engine functions, even stubs that compute.
- No database client, no Supabase migrations.
- No UI beyond the default scaffolded page.

**Suggested Claude Code prompt.**
> "Phase 1 — scaffold the Next.js App Router project with strict TypeScript and Tailwind, create the `src/lib` directory skeleton with index TODOs, configure Vitest with one passing smoke test in `src/lib/utils`, and add the import-boundary lint rule enforcing engine isolation. Update `CLAUDE.md`'s Commands section. Stop when `pnpm dev`, `pnpm test`, and `pnpm lint` all work and the boundary rule fails on a deliberate violation."

---

## Phase 2 — Types and mock data

**Goal.** Define the canonical domain types and a complete mock tournament so the rest of the system can be developed offline.

**Deliverables.**
- `src/lib/types/` modules:
  - `team.ts` — `Team`, `TeamRating`, `Region`.
  - `match.ts` — `Match`, `MatchStage`, `MatchStatus`.
  - `prediction.ts` — `RunType` (`'T_MINUS_3H' | 'T_MINUS_1H' | 'T_ZERO' | 'HT' | 'FT'`), `PredictionInput`, `PredictionOutput`, `ScorelineMatrix`, `DataSnapshotRef`.
  - `form.ts` — `FormSummary`.
  - `lineup.ts` — `LineupStrength`.
  - `inPlay.ts` — `InPlayState`.
  - `index.ts` — re-exports.
- `src/mock/`:
  - 48 placeholder teams (fictional IDs, region tags, starting Elo).
  - Full 2026 group stage + knockout bracket as fixtures with kickoff times in UTC and venue placeholders.
  - Snapshot of ratings and form per team at "tournament start."
- `src/lib/data/fixtureSource.ts` — `FixtureSource` interface.
- `src/lib/data/mockFixtureSource.ts` — `MockFixtureSource` reading `src/mock/`.
- `scripts/print-schedule.ts` — prints the full tournament schedule grouped by day.

**Files likely touched.** `src/lib/types/**`, `src/mock/**`, `src/lib/data/fixtureSource.ts`, `src/lib/data/mockFixtureSource.ts`, `scripts/print-schedule.ts`, `package.json` (script entry).

**Acceptance criteria.**
- `tsc --noEmit` is clean.
- `pnpm tsx scripts/print-schedule.ts` prints every match grouped by day with kickoff in UTC.
- All types are imported via `@/lib/types` and not redeclared anywhere.
- `MockFixtureSource.listMatches(window)` returns the right matches for a given date range.
- Lint boundary rule still passes — no model code yet.

**What must NOT be done in this phase.**
- No statistical computation. No ratings update, no Poisson, no Monte Carlo.
- No database client.
- No UI components.
- No real API adapters.

**Suggested Claude Code prompt.**
> "Phase 2 — author the domain types under `src/lib/types`, build a complete 48-team mock 2026 tournament fixture set under `src/mock/`, implement the `FixtureSource` interface with a `MockFixtureSource`, and add a `scripts/print-schedule.ts` that prints the full schedule grouped by day. Use placeholder team identifiers; no real team names. Stop when the script prints the full bracket and `tsc --noEmit` is clean."

---

## Phase 3 — Statistical engine

**Goal.** Build the full prediction engine end-to-end against mock inputs. Pure TypeScript, deterministic, fully unit-tested.

**Deliverables.**
- `src/lib/utils/rng.ts` — single seeded RNG utility used by the entire engine.
- `src/lib/utils/poisson.ts` — PMF, CDF, sampling, with tests.
- `src/lib/model/rating.ts` — Elo-style update with importance weighting and goal-difference multiplier.
- `src/lib/model/form.ts` — exponential-decay form summary.
- `src/lib/model/xg.ts` — xG approximation with frozen weights (the regression weights live as a constant per `model_version`).
- `src/lib/model/expectedGoals.ts` — match-level `xgHome` / `xgAway` derivation.
- `src/lib/model/scoreline.ts` — Poisson scoreline matrix with Dixon-Coles correction.
- `src/lib/model/predict.ts` — orchestrates the above into a `PredictionOutput` for a given `run_type`.
- `src/lib/simulation/monteCarlo.ts` — seeded match and tournament simulators.
- Vitest suites under `__tests__/` next to each module, including:
  - Symmetry / monotonicity property tests for the rating update.
  - Sums-to-one check for the scoreline matrix.
  - Convergence test for the Monte Carlo simulator with a fixed seed and documented tolerance.
- `scripts/predict-mock.ts` — runs the engine over the mock fixture set and prints a summary.
- `MODEL_VERSION` constant exported from `src/lib/model/version.ts` (initial value `"v0.1.0"`).

**Files likely touched.** `src/lib/utils/{rng,poisson}.ts`, `src/lib/model/**`, `src/lib/simulation/monteCarlo.ts`, corresponding `__tests__` files, `src/lib/model/version.ts`, `scripts/predict-mock.ts`.

**Acceptance criteria.**
- `pnpm test` green; coverage on `src/lib/model` and `src/lib/simulation` is meaningful (property tests, not just smoke).
- Same inputs + same `rngSeed` produce identical output across runs (verified by a determinism test).
- `pnpm tsx scripts/predict-mock.ts` prints a `PredictionOutput` for every mock match.
- Lint boundary rule still passes: no engine file imports React or Next APIs.
- No DB or network code added.

**What must NOT be done in this phase.**
- No Supabase migrations, no database client, no persistence.
- No Vercel Cron handlers.
- No UI components.
- No real sports-API integration.

**Suggested Claude Code prompt.**
> "Phase 3 — implement the prediction engine under `src/lib/{utils,model,simulation}` per `docs/03_MODEL_SPEC.md`. All randomness must flow through one seeded RNG utility. Each module ships with a Vitest suite that includes at least one property test where relevant, plus a determinism test proving identical seed + inputs yield identical output. Add `scripts/predict-mock.ts` that runs the engine across the mock fixture set. Stop when all tests pass and the script prints predictions for every match. Do not introduce any database, network, or UI code."

---

## Phase 4 — Database and persistence

**Goal.** Persist teams, fixtures, predictions, run metadata, accuracy reviews, and data-source registry in Supabase / PostgreSQL. Predictions are append-only.

**Deliverables.**
- `supabase/migrations/0001_init.sql` (and follow-ups as needed) creating:
  - `teams` — canonical identity, FIFA-like code, current rating, region.
  - `matches` — fixtures (stage, group, venue, `kickoff_utc`, status, scores).
  - `predictions` — one row per `(match_id, run_type, model_version, scheduled_for)` with `executed_at`, `data_snapshot` (JSONB or content-addressed reference), and the full `PredictionOutput`.
  - `model_runs` — invocation metadata: trigger, duration, status, error.
  - `accuracy_reviews` — Brier, log-loss, scoreline hit, calibration bucket per `run_type`.
  - `data_sources` — canonical column set per `docs/04_DATA_AND_LEGAL_POLICY.md` §4.3: `provider_name`, `endpoint`, `data_type`, `license_terms_notes`, `attribution_required`, `allowed_usage`, `rate_limits`, `fetched_at`, `added_at`, `reviewed_at`.
- Unique constraint on `predictions(match_id, run_type, model_version, scheduled_for)` to enforce append-only at the database level.
- RLS policies: public read on `teams`, `matches`, `predictions`, `accuracy_reviews`; writes restricted to the service role used by the scheduler.
- `src/lib/data/db.ts` — typed Supabase client wrapper with helpers:
  - `getMatchesInWindow(range)`
  - `getLatestPrediction(matchId, runType)`
  - `getPredictionHistory(matchId)`
  - `insertPrediction(row)` — refuses if a row with the same key exists.
  - `insertModelRun`, `insertAccuracyReview`.
- `scripts/seed-mock.ts` — loads `src/mock/` into the database for development.
- Vitest integration test against a local Supabase that seeds, reads back fixtures, and inserts a prediction row, asserting duplicate inserts fail.

**Files likely touched.** `supabase/migrations/**`, `supabase/seed.sql` (optional), `src/lib/data/db.ts`, `scripts/seed-mock.ts`, `src/lib/data/__tests__/db.test.ts`, `.env.example`.

**Acceptance criteria.**
- Migrations apply cleanly to a fresh Supabase instance.
- `pnpm tsx scripts/seed-mock.ts` populates a dev database from the mock fixture set.
- The integration test passes: seed → read → insert prediction → duplicate insert fails by constraint.
- `UPDATE predictions …` is not used anywhere in the codebase (lint-grep check or code review).

**What must NOT be done in this phase.**
- No `UPDATE` statements against `predictions`, ever.
- No scheduler / cron handlers yet.
- No UI components.
- No real API adapters.

**Suggested Claude Code prompt.**
> "Phase 4 — author the Supabase migrations for `teams`, `matches`, `predictions`, `model_runs`, `accuracy_reviews`, `data_sources` per `docs/02_TECHNICAL_ARCHITECTURE.md`. Enforce append-only on `predictions` with a unique constraint on `(match_id, run_type, model_version, scheduled_for)`. Add RLS. Build the typed query layer in `src/lib/data/db.ts` and a seed script that loads `src/mock/` into a dev database. Add an integration test proving duplicate prediction inserts fail. Do not write any scheduler or UI code."

---

## Phase 5 — Scheduler and Vercel Cron

**Goal.** Wire the prediction lifecycle (T-3h, T-1h, T-0, HT, FT) to Vercel Cron so each match accumulates a complete append-only history.

**Deliverables.**
- `src/lib/scheduler/dispatcher.ts` — given the current time, selects matches due for each `run_type`.
- `src/lib/scheduler/runPrediction.ts` — composes engine inputs, invokes `predictMatch`, writes the prediction row and the `model_runs` row.
- `src/lib/scheduler/runAccuracyReview.ts` — at FT, computes Brier/log-loss/calibration and writes `accuracy_reviews`.
- `src/app/api/cron/dispatch/route.ts` — single cron entrypoint that fans out to `dispatcher`.
- Vercel scheduling config (`vercel.json` or `vercel.ts`) declaring the cron schedule (e.g. every 5 minutes), authenticated via `CRON_SECRET`.
- Idempotency: the dispatcher computes `scheduled_for` as the canonical lifecycle timestamp (kickoff - 3h, kickoff - 1h, kickoff, kickoff + ~45min, kickoff + ~110min), so retries land on the same row and the unique constraint prevents duplicates.
- Structured logs into `model_runs` for every invocation.
- Vitest tests for the dispatcher's "is this match due for this run_type?" logic against fixed virtual clocks.
- End-to-end test (with mocked clock) producing a complete `T_MINUS_3H → FT` history for at least one mock match.

**Files likely touched.** `src/lib/scheduler/**`, `src/app/api/cron/dispatch/route.ts`, `vercel.json` or `vercel.ts`, `.env.example` (`CRON_SECRET`), tests under `src/lib/scheduler/__tests__/`.

**Acceptance criteria.**
- Local accelerated-clock simulation produces five prediction rows per match plus one accuracy review row.
- Re-running the dispatcher at the same simulated time inserts no new rows (idempotent).
- Cron endpoint rejects requests without the `CRON_SECRET`.
- Lint boundary rule still passes — scheduler imports engine + data layer, never UI.

**What must NOT be done in this phase.**
- No UI pages.
- No real sports-API calls; inputs still come from mock/data adapters.
- No mutation of existing prediction rows.

**Suggested Claude Code prompt.**
> "Phase 5 — build the scheduler in `src/lib/scheduler` and a Vercel Cron route at `src/app/api/cron/dispatch/route.ts`. The dispatcher must derive `scheduled_for` deterministically per `run_type` so retries are idempotent against the unique constraint. Log every invocation into `model_runs`. Add a test that simulates time to produce a full T_MINUS_3H→FT history for one mock match and confirms a re-run inserts no new rows. Do not build any UI."

---

## Phase 6 — UI shell on stored predictions

**Goal.** Build the schedule and match-detail pages that render persisted predictions, in the World Cup / fan-experience visual direction defined by `docs/07_DESIGN_SYSTEM.md` (warm tournament palette, collectible match cards with the optional foil interaction in §9, broadcast-style prediction timeline, match-center detail page). The UI computes nothing.

**Design direction.** Prioritise **match cards, prediction cards, countdowns, and the match-center layout**. National identity is conveyed via country codes, team names, and abstract colour bands only — never federation crests, kits, or photographs. Foil / tilt effects on match cards are optional and must carry a still-frame equivalent and respect `prefers-reduced-motion`. See `docs/07_DESIGN_SYSTEM.md` §8–§11 for component direction, the holographic-card guidance, the SVG flag wave specification, and the prohibited visual language.

**Public branding.** The deployed UI uses the public product name **"Global Football 2026 Predictor"** per `docs/01_PRODUCT_BRIEF.md` §9. Restricted FIFA / tournament terms enumerated in `docs/04_DATA_AND_LEGAL_POLICY.md` §3.6 — including "FIFA" standalone, "FIFA World Cup", "World Cup", "Mundial", and equivalent translations — do NOT appear in product UI, page titles, OpenGraph metadata, masthead, navigation, route names, domain configuration, or repeated layout chrome. Every public page renders the independence disclaimer from `docs/04` §3.6 in the footer.

**Legal gate on flag assets.** No flag SVG, flag image, or flag asset may be added to the codebase or rendered in any public surface unless its source and licence are documented per `docs/08_FLAG_AND_VISUAL_ASSET_POLICY.md` §5 (asset registry). Phase 6 may implement a `WavingFlag` component using **placeholder geometric mock flags only** — internally authored simple SVGs with no real national symbology. Real country flag assets are deferred until the flag asset registry is created, populated, and reviewed in a follow-up phase. SVG wave animation, if implemented in Phase 6, follows the constraints in `docs/07` §11 and `docs/08` §6, applied only to the placeholder flags.

**Deliverables.**
- `src/app/(public)/schedule/page.tsx` — Server Component listing matches grouped by day.
- `src/components/MatchCard.tsx` — teams, venue, kickoff (user TZ), countdown, live status, headline probabilities, prediction timestamp, `model_version`.
- `src/components/LiveStatus.tsx` — Client Component handling countdown ticks and revalidation.
- `src/app/(public)/match/[id]/page.tsx` — match detail with full prediction history timeline.
- `src/components/PredictionTimeline.tsx` — visualises the T_MINUS_3H → FT runs.
- `src/components/FactorBreakdown.tsx` — Recharts visualisation of contributing factors from the stored `PredictionOutput`.
- `src/lib/data/queries.ts` — typed read-side helpers for the UI.
- Accessibility pass: semantic landmarks, keyboard order, contrast.

**Files likely touched.** `src/app/(public)/**`, `src/components/**`, `src/lib/data/queries.ts`, Tailwind tokens under `src/app/globals.css`, `next.config.*` if needed.

**Acceptance criteria.**
- A stakeholder can browse the full mock tournament and inspect a match's prediction history.
- The UI does not import anything from `src/lib/model`, `src/lib/simulation`, or `src/lib/normalization` (verified by lint). The UI may import UI-safe presentation helpers from `src/lib/utils` (e.g. date/locale formatting), but never `src/lib/utils/rng.ts`, `src/lib/utils/poisson.ts`, or any other engine-math helper — see `docs/06_CLAUDE_CODE_RULES.md` §0 for the binding rule.
- No new computation is performed in components; all displayed numbers come from DB rows.
- Lighthouse a11y score ≥ 95 on the schedule page.

**What must NOT be done in this phase.**
- No engine calls from components or server actions.
- No data writes from UI.
- No real sports-API adapters.
- No player cards, no minute-by-minute probability (V2+).

**Suggested Claude Code prompt.**
> "Phase 6 — build the schedule and match-detail pages as Server Components reading from `src/lib/data/queries.ts`. Implement `MatchCard`, `PredictionTimeline`, and `FactorBreakdown` (Recharts). Live countdown lives in a small Client Component. The UI must not import from `src/lib/model`, `src/lib/simulation`, or `src/lib/normalization`; lint must enforce that. Stop when the mock tournament browses end-to-end and the accessibility pass meets the criteria."

---

## Phase 7 — Real data integration

**Goal.** Replace mock adapters with vetted real-data sources, behind the same `FixtureSource` interface, with proper licensing recorded.

**Deliverables.**
- A row in `data_sources` for each provider used, with licence summary and attribution.
- `src/lib/data/realFixtureSource.ts` — implementation of `FixtureSource` against the chosen provider.
- `src/lib/data/lineupSource.ts` — adapter populating `LineupStrength` at T-1h.
- `src/lib/data/liveStateSource.ts` — adapter populating `InPlayState` at HT.
- `src/lib/normalization/**` — mapping raw provider payloads to canonical types.
- Backfill script for historical ratings derived from the chosen provider's match history.
- Footer attribution block reflecting every active source.
- Env config to switch between `MockFixtureSource` and `RealFixtureSource` (`DATA_SOURCE=mock|live`).

**Files likely touched.** `src/lib/data/realFixtureSource.ts`, `src/lib/data/lineupSource.ts`, `src/lib/data/liveStateSource.ts`, `src/lib/normalization/**`, `scripts/backfill-ratings.ts`, `src/components/Footer.tsx`, `.env.example`, `docs/04_DATA_AND_LEGAL_POLICY.md` (add the source).

**Acceptance criteria.**
- With `DATA_SOURCE=live`, the dispatcher produces real predictions end-to-end without code changes outside `src/lib/data` and `src/lib/normalization`.
- `data_sources` table reflects every provider; the footer renders the same.
- No scraped data from sources that prohibit scraping; provenance is documented per source.
- Switching back to `DATA_SOURCE=mock` continues to work for local development.

**What must NOT be done in this phase.**
- No changes to the engine's public contract; only inputs change shape via normalisation.
- No UI redesign.
- No new feature surfaces (V2+ stays parked).

**Suggested Claude Code prompt.**
> "Phase 7 — implement `RealFixtureSource`, lineup, and live-state adapters behind the existing interfaces, with normalisers under `src/lib/normalization`. Add a row to `data_sources` for each provider used, including licence summary, and update the footer's attribution block. Gate the choice with `DATA_SOURCE=mock|live`. Do not modify the engine's public contract or the UI components."

---

## Phase 8 — Accuracy dashboard and polish

**Goal.** Expose model performance and finalise the visual design so the project is portfolio-ready.

**Deliverables.**
- `src/app/(public)/accuracy/page.tsx` — Brier and log-loss trends per `run_type`, calibration plot, scoreline hit rate, sample size.
- `src/components/CalibrationPlot.tsx` and supporting Recharts visualisations.
- Typography, motion, and empty/loading/error states across all pages.
- Lighthouse pass: performance ≥ 90, accessibility ≥ 95, best practices ≥ 95 on schedule, match detail, and accuracy pages.
- A short post-tournament retrospective stub at `docs/RETROSPECTIVE.md` (filled in later).

**Files likely touched.** `src/app/(public)/accuracy/**`, `src/components/**`, `src/app/globals.css`, `docs/RETROSPECTIVE.md`.

**Acceptance criteria.**
- Accuracy page renders meaningful charts from `accuracy_reviews`.
- Every async surface has an empty, loading, and error state.
- Lighthouse thresholds met.
- No new engine or data work.

**What must NOT be done in this phase.**
- No new prediction features.
- No V2+ work.

**Suggested Claude Code prompt.**
> "Phase 8 — build the `/accuracy` page (Brier and log-loss trends per `run_type`, calibration plot, scoreline hit rate). Polish typography, motion, and empty/loading/error states across the app. Reach the Lighthouse thresholds in the acceptance criteria. Do not add new engine logic or new data sources."

---

## V2+ — Player data cards and live minute-by-minute probability

**Status.** Not in scope without explicit approval. These items appear here so the team knows where they live, not so they get built early.

**V2.1 — Original "data cards"**
- Goal: a player-card style view using original holographic styling — no FIFA, Panini, or EA visuals, no copyrighted photographs.
- Hard constraints: the design must be visibly distinct from official cards; only data and original artwork.
- Approval gate: must be greenlit explicitly, and the licensing of any player data used must be confirmed.

**V2.2 — Live minute-by-minute probability**
- Goal: continuous in-play probability updates between HT and FT (and optionally during the first half) driven by a live-state feed.
- Hard constraints: still append-only; each computed update inserts a new prediction row with `run_type = 'LIVE'` (a new enum value to be added) carrying its `scheduled_for` minute. The UI charts the curve; it does not compute it.
- Approval gate: requires a licensed live-state feed and confirmation that update frequency does not violate the provider's terms.

**Out of scope, indefinitely.**
- Betting or wagering features.
- Embedded or linked unauthorised streams.
- Copyrighted player imagery or official marks.
- Social / community features.
