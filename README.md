# Global Football 2026 Predictor

**An independent football probability dashboard for the 2026 international tournament — built end-to-end in TypeScript as a portfolio project.**

A deterministic statistical engine (Elo ratings, Poisson scoreline matrix, seeded Monte Carlo simulation) produces append-only prediction runs that a Next.js App Router UI renders as collectible match cards with a broadcast-style prediction timeline. Engine, scheduler, persistence, and UI are isolated by lint boundaries and verified by 230+ tests.

> **Independent analytical project.** Not affiliated with FIFA, any confederation, any federation, any broadcaster, any tournament organizer, or any sponsor. The product does not use official FIFA or tournament marks, logos, typefaces, mascots, slogans, or trade dress. Predictions are probabilistic estimates produced by a statistical model, not guarantees about real-world outcomes.

> **About the repo name.** The directory and git remote use the descriptive working title `world-cup-2026-predictor`. The deployed public UI uses the safer public name "Global Football 2026 Predictor" per [`docs/04_DATA_AND_LEGAL_POLICY.md`](docs/04_DATA_AND_LEGAL_POLICY.md) §3.6.

---

## Live demo

> _Coming soon — Vercel preview deployment._

For now: clone, `pnpm install`, `pnpm dev`, open <http://localhost:3000>.

## Screenshots

> _Screenshots will be added under `screenshots/` after the first deployment capture. See [`docs/11_SCREENSHOT_AND_DEMO_GUIDE.md`](docs/11_SCREENSHOT_AND_DEMO_GUIDE.md) for the capture plan._

The deployed UI includes:

- A warm tournament fan-experience home page with a featured "next kickoff" panel and hero stats.
- Collectible match cards with subtle foil hover interaction (`±4°` tilt, cursor-tracking radial highlight, reduced-motion fallback).
- A match-center detail page with a three-segment probability bar, expected-goals callouts, top-scorelines table, and a broadcast-style prediction timeline.
- A premium two-column footer carrying the independence statement and the active model version.

---

## Key features

- **Deterministic prediction engine.** Same input plus same seed produces byte-identical output. All randomness flows through one seeded RNG; `Math.random()` is never called from inside the engine.
- **Append-only prediction history.** Every scheduled run inserts a new row; earlier runs are preserved forever. A SQL unique constraint plus a TypeScript `PredictionRepository` interface with no `update*` methods enforce the rule at both the storage and the API layers.
- **Idempotent scheduler retries.** The scheduler computes `scheduled_for` as the canonical lifecycle timestamp (kickoff − 3 h, etc.), so Vercel Cron retries collapse onto the same row via the unique idempotency key.
- **Engine isolation, enforced.** `src/components/**` is forbidden from importing `@/lib/model`, `@/lib/simulation`, `@/lib/normalization`, `@/lib/utils/rng`, or `@/lib/utils/poisson`. The boundary is enforced by ESLint **and** a runtime file-content backstop test.
- **Mock-first development.** Eight fictional teams, four group-stage fixtures, realistic stats. Real provider integration is deferred until a documented `data_sources` row exists per the asset policy.
- **Legal/IP perimeter as code.** A vocabulary scan over every UI source file blocks restricted competition marks and banned betting language from product copy. The independence disclaimer is rendered in the footer of every public page.
- **Accessibility-first UI.** WCAG AA contrast floor, visible focus rings, keyboard navigation, `prefers-reduced-motion` honoured on foil tilt + radial highlight + flag-band sway.
- **Placeholder-only flags.** A `WavingFlag` component renders three abstract horizontal colour bands picked deterministically per team. No national symbology, no `<img>` tags, no real flag assets. Real flags wait for the asset registry in [`docs/08_FLAG_AND_VISUAL_ASSET_POLICY.md`](docs/08_FLAG_AND_VISUAL_ASSET_POLICY.md) §5.

## Technical highlights

- **234 tests** across engine, simulation, persistence, scheduler, and UI — property-based engine checks, mocked-clock scheduler tests, append-only constraint tests, UI boundary scans, UI vocabulary scans, and `renderToString` page smoke tests. Run in ~1.5 seconds.
- **Determinism, tested.** A test runs `predictMatch` twice with identical input and seed and asserts byte-identical output.
- **Monte Carlo convergence, tested.** At `N = 10_000` the simulator converges to within 1.5% of the analytic Poisson marginals (`docs/03_MODEL_SPEC.md` §6.3) — verified by an explicit test.
- **Strict TypeScript.** `tsconfig.json` `"strict": true`, `any` not used, shared domain types in `src/lib/types`, explicit parameter and return types across module boundaries.
- **Repository-pattern persistence.** A `PredictionRepository` interface with insert/get/list methods only; an `InMemoryPredictionRepository` for tests + the Phase 6 demo; a Supabase-backed implementation queued for the next phase.
- **Vercel Cron route protected by `CRON_SECRET`.** Bearer-auth gate, opaque 401/500 responses (never a stack trace), strict-by-default in production.

---

## Architecture

```
+--- Phase 7 (future) -----------------------------+
|  Licensed sports API (not built yet)             |
+--------------------------+-----------------------+
                           |
+--- Phase 2 ----+---------v-----------+--- Phase 5 ------+
|  src/mock/     |  FixtureSource API  |  Vercel Cron     |
|  fixtures,     +---------+-----------+  (Bearer auth)   |
|  teams, stats  |         |           |       |          |
+----------------+         |           +-------v----------+
                           |               getDueRuns
                           |               execute
                           |                   |
                           |          +--------v--------+
                           +--------->|  predictMatch   |
                                      |  (pure TS)      |
                                      +--------+--------+
                                               | PredictionOutput
+--- Phase 4 -----------------------------+    |
|  prediction_runs (append-only)          |<---+
|  prediction_scorelines                  |
|  data_snapshots / model_runs            |
+------------+----------------------------+
             |  PredictionRunRow shape
             v
+--- Phase 6 / 6.1 -----------------------+
|  src/lib/data/demoPredictions.ts        |
|  (server-only; runs engine at module    |
|   load, freezes rows)                   |
+------------+----------------------------+
             v
+--- UI (forbidden from importing model) -+
|  app/page.tsx + app/matches/[id]/...    |
|  components/ — server + small client    |
+------------------------------------------+
```

A Mermaid version with subgraphs and colour-coded subsystems lives in [`docs/12_ARCHITECTURE_DIAGRAM.md`](docs/12_ARCHITECTURE_DIAGRAM.md).

The rule each layer obeys: **engine isolation.** Components don't import prediction math; the engine doesn't import React or do I/O; persistence is the scheduler's job, never the engine's, never the UI's; the UI reads DB-row shapes only.

## Prediction lifecycle

Every match accumulates five append-only rows over its lifecycle. Earlier rows are never overwritten — the history is preserved for accuracy review and cross-version comparison.

| `run_type`     | Trigger                          | Engine receives                          | Purpose                              |
|----------------|----------------------------------|------------------------------------------|--------------------------------------|
| `T_MINUS_3H`   | kickoff − 3 h                     | ratings, form, context                   | Baseline pre-match prediction        |
| `T_MINUS_1H`   | kickoff − 1 h                     | + lineup if available                    | Lineup-aware refinement              |
| `T_ZERO`       | kickoff                           | best available lineup data               | Final pre-match snapshot             |
| `HT`           | half-time (gated by status)       | + in-play state                          | In-play recalibration                |
| `FT`           | full-time (gated by status)       | observed final score                     | Accuracy review                      |

Anchors are deterministic UTC offsets (`src/lib/scheduler/scheduleWindows.ts`). `HT` and `FT` additionally require `fixture.status` to confirm the lifecycle event, so they don't trip on a clock alone. The full list lives in [`docs/03_MODEL_SPEC.md`](docs/03_MODEL_SPEC.md) §7.

---

## How the model works

Five composable steps. None of them depend on machine learning — V1 is classical statistics, deliberately. See [`docs/03_MODEL_SPEC.md`](docs/03_MODEL_SPEC.md) for the full specification.

### Team strength

Each team carries an Elo-style rating maintained from licensed historical match results, plus a recent-form summary over the last N matches with exponential time decay (`λ = ln(2) / 365` — one-year half-life). A composite `TeamStrength` score combines the normalised rating, form, attack, defence, and an optional availability component with frozen weights summing to 1.

### Expected goals

For each fixture the engine derives an attack factor and a defence factor per team from the rating and the form, multiplies by a base goals-per-side, and applies context multipliers (rest days, altitude, host-nation advantage). The result is the expected goals per side, clamped to `[0.1, 5.0]` so pathological inputs can't produce a degenerate scoreline matrix.

### Poisson scoreline matrix

Home and away goals are treated as independent Poisson random variables. The engine computes the joint probability for every `(homeGoals, awayGoals)` cell up to a 6×6 window plus a residual tail. An optional Dixon-Coles low-score correction parameter `ρ` is supported; `v0.1.0` ships with `ρ = 0`, to be calibrated against tournament data post-event without re-architecting.

The matrix marginals give `pTeamAWin`, `pDraw`, `pTeamBWin` — these are the headline probabilities the UI displays.

### Monte Carlo simulation

A seeded Monte Carlo simulator runs `N = 10_000` matches by sampling from the Poisson matrix. It's not the source of truth for headline probabilities — the analytic marginals are — but it serves as a sanity check (a warning is emitted if the simulator diverges from the marginals by more than 1.5%) and as the source of truth for tournament-level rollups (e.g. probability that a given team reaches the semi-finals).

### Confidence scoring

Every prediction carries a `confidence` score in `[0, 1]` derived from a linear combination of data-quality, lineup-uncertainty, volatility, and probability-gap components. The score is mapped to a three-band display (`LOW < 0.40 ≤ MEDIUM < 0.70 ≤ HIGH`) so the UI never displays raw confidence as a probability.

---

## Stack

| Concern            | Choice                                                                  |
|--------------------|-------------------------------------------------------------------------|
| Framework          | Next.js 15 (App Router)                                                 |
| Language           | TypeScript 5 (strict)                                                   |
| Styling            | Tailwind CSS 3 with tokens from [`docs/07`](docs/07_DESIGN_SYSTEM.md)   |
| Database           | Supabase / PostgreSQL (schema in `supabase/migrations/0001_init.sql`)   |
| Hosting            | Vercel (deployment + Vercel Cron)                                       |
| Tests              | Vitest 2 (engine, scheduler, persistence, UI)                           |
| Lint               | ESLint 8 with `next/core-web-vitals` and project-specific boundary rules |
| Package manager    | pnpm 11 (Node.js 22 LTS pinned via `.nvmrc` and `engines`)              |

## Data and IP safety

This is an independent analytical project. The legal/IP perimeter is enforced at multiple layers:

- **Public product name** avoids restricted competition marks. See [`docs/04_DATA_AND_LEGAL_POLICY.md`](docs/04_DATA_AND_LEGAL_POLICY.md) §3.6 for the full restricted-terms table.
- **Independence disclaimer** is rendered in the footer of every public page via a single source component (`src/components/Disclosure.tsx`).
- **Vocabulary scan** over every UI source file blocks restricted competition marks and banned betting language. The scan allows `FIFA` and `sponsor` **only** inside the `Disclosure` component and only in the non-affiliation sentence.
- **No copyrighted assets.** No federation crests, kits, broadcaster graphics, agency photographs, trophy imagery, Panini/EA Sports/FUT trade dress, or mascots. No `<img>` tags reference any external asset.
- **Placeholder flags only.** Real national flag SVGs are gated on the asset registry in [`docs/08_FLAG_AND_VISUAL_ASSET_POLICY.md`](docs/08_FLAG_AND_VISUAL_ASSET_POLICY.md) §5.

## Data source status

- **Mode:** mock
- No real sports API integrated yet.
- No copyrighted player images or official marks used.
- No live streams or broadcast links used.

Full policy: [`docs/04_DATA_AND_LEGAL_POLICY.md`](docs/04_DATA_AND_LEGAL_POLICY.md).

---

## Local development

Requires **Node.js 22 LTS** and **pnpm**. Install pnpm via `npm i -g pnpm` or follow <https://pnpm.io/installation>.

```bash
pnpm install        # install dependencies
pnpm dev            # start the Next.js dev server (http://localhost:3000)
pnpm build          # production build
pnpm start          # serve the production build
```

Set `CRON_SECRET` in `.env.local` if you want to exercise the `/api/cron/predictions` route locally. See `.env.example` for the expected variable. The route allows unauthenticated requests when `CRON_SECRET` is missing AND `NODE_ENV === 'development'` (strict by default in production).

## Testing

```bash
pnpm typecheck      # tsc --noEmit, strict
pnpm lint           # ESLint, including the engine-isolation boundary rule
pnpm test           # Vitest — watch mode in a TTY, one-shot in CI
pnpm test --watch   # explicit watch mode
CI=true pnpm test   # one-shot regardless of TTY
```

The 234-test suite takes about 1.5 seconds. Highlights:

- **Engine determinism** — runs `predictMatch` twice with identical input and seed, asserts byte-identical output.
- **Monte Carlo convergence** — runs the simulator at `N = 10_000` and asserts within 1.5% of the analytic Poisson marginals.
- **Append-only constraint** — inserts a duplicate prediction-run row into the in-memory repository and asserts the unique-key collision fires.
- **UI engine-isolation backstop** — reads every `.tsx` file under `src/components/` and asserts no forbidden engine import.
- **UI vocabulary scan** — reads every UI source file and asserts no restricted tournament mark / banned betting word appears (with the documented `FIFA` / `sponsor` carve-outs for `Disclosure.tsx`).
- **Render-string smoke tests** — both pages render via `react-dom/server` and the output is scanned for the disclaimer, the public product name, the humanized warning copy, and the absence of restricted marks.

---

## Deployment

A Vercel preview deployment is the recommended target while the project ships in demo/mock mode. The full step-by-step walkthrough — environment variables, cron protection, post-deploy smoke checks, accessibility / responsive checks, IP preflight, screenshot capture, and rollback — lives in [`docs/13_DEPLOYMENT_CHECKLIST.md`](docs/13_DEPLOYMENT_CHECKLIST.md).

One-shot verification before any deploy:

```bash
pnpm verify   # = typecheck + lint + CI test + build
```

The deployed UI today runs against mock fixtures and in-memory persistence. Configure `CRON_SECRET` in the Vercel project if you want to exercise the cron route; otherwise the public pages render correctly even without any environment variables set. See [`docs/13`](docs/13_DEPLOYMENT_CHECKLIST.md) §4 for the demo-mode behaviour matrix.

---

## Project status

| Phase     | Status                                                                                        |
|-----------|-----------------------------------------------------------------------------------------------|
| 0         | ✅ Documentation foundation                                                                    |
| 1         | ✅ Next.js + TypeScript scaffold, Tailwind, Vitest, engine-isolation lint                      |
| 2         | ✅ Canonical domain types + mock tournament (8 teams, 4 fixtures, realistic stats)             |
| 3         | ✅ Statistical engine — Elo, form, xG, Poisson, Monte Carlo, confidence, `predictMatch`        |
| 4         | ✅ PostgreSQL schema + typed persistence layer (in-memory + append-only constraints)            |
| 5         | ✅ Vercel Cron scheduler — dueRuns, idempotent execute, route protected by `CRON_SECRET`        |
| 6         | ✅ UI shell — home schedule, match-detail page, components, placeholder waving flags            |
| 6.1       | ✅ Visual polish — featured panel, hero stats, foil cards, humanized warnings, premium footer  |
| 6.2       | ✅ Portfolio readiness — this README, portfolio brief, interview talk track, screenshot guide  |
| 6.3       | ✅ Deploy readiness — `pnpm verify`, deployment checklist, Vercel preview pushed                |
| 7A        | ✅ Supabase-backed `PredictionRepository` + `SnapshotRepository` (alternate backend; tested with mocked clients) |
| 7C        | ✅ Neon / Vercel Postgres-backed repositories (preferred production path; tested with mocked clients; migration script via `pnpm db:migrate:postgres`); schema applied to Production database |
| 7D        | ✅ Cron route wired to `createPredictionRepository()` / `createSnapshotRepository()` — production-protected and persistence-ready. With `POSTGRES_URL` set, prediction runs land in Neon. Public UI remains demo-mode. |
| 7E        | ✅ Server-side `pnpm smoke:persist` script validates Neon persistence end-to-end without waiting for cron lifecycle anchors (see [`docs/13`](docs/13_DEPLOYMENT_CHECKLIST.md) §4a). |
| 7F        | ✅ Public pages read persisted predictions through a thin server-only read model (`src/lib/data/uiReadModel.ts`). Silent fallback to the demo helper when `POSTGRES_URL` is absent, the fixture has no rows, or the repository throws. Catalog stays mock; no client-side DB import possible (see [`docs/13`](docs/13_DEPLOYMENT_CHECKLIST.md) §4b). |
| **7G**    | 🟡 **Up next** — real `FixtureSource` adapter against an external football data provider        |
| 8         | 🟡 Accuracy dashboard — Brier and log-loss trends, calibration plot, scoreline hit rate        |

The detailed phased plan lives in [`docs/05_BUILD_ROADMAP.md`](docs/05_BUILD_ROADMAP.md).

---

## What this project demonstrates

For recruiters and hiring managers — point at the file or test for each axis below during a screen-share:

- **Architectural discipline.** Engine isolation, append-only persistence, mock-first data flow, interface-driven swap-in for real providers — enforced by ESLint, a runtime boundary test, and the DB-row contract together.
- **Statistical literacy.** Classical methods (Elo, Poisson, Dixon-Coles, Monte Carlo) implemented in pure TypeScript with frozen versioned constants, a deterministic seeded RNG, and convergence-tested simulation.
- **Test discipline.** 234 tests covering engine, simulation, persistence, scheduler, and UI — including property-based engine checks, append-only constraint tests, and UI-vocabulary scans that prove restricted marks aren't in the deployed product.
- **Production-shaped, demo-fast.** The deployed UI today runs against the real engine and real DB-row shapes via a server-only helper; swapping the helper for a Supabase read is a one-file change because the persistence interface is the contract.
- **Legal-aware engineering.** Restricted-vocabulary scans, the placeholder flag pattern, the asset registry policy, and the independence disclaimer rendered as a single-source component demonstrate that legal considerations were designed in, not bolted on.
- **Design system thinking.** A warm tournament palette with token discipline, an original collectible-card foil treatment that explicitly avoids Panini / FUT / EA chrome, reduced-motion support across every motion path, and a WCAG AA contrast floor.
- **Documentation discipline.** Twelve binding documents written before the code, including the policy / disclosure / flag-registry frameworks. Every commit cites the doc section it implements.

For longer-form context, see:

- [`docs/09_PORTFOLIO_BRIEF.md`](docs/09_PORTFOLIO_BRIEF.md) — 30-second and 2-minute pitches, key engineering decisions, LinkedIn / portfolio / resume copy.
- [`docs/10_INTERVIEW_TALK_TRACK.md`](docs/10_INTERVIEW_TALK_TRACK.md) — interview scripts with worked answers to common questions.
- [`docs/12_ARCHITECTURE_DIAGRAM.md`](docs/12_ARCHITECTURE_DIAGRAM.md) — Mermaid architecture diagram with prose walk-through.

---

## Documentation

| Document                                                                                            | Purpose                                                |
|-----------------------------------------------------------------------------------------------------|--------------------------------------------------------|
| [`docs/01_PRODUCT_BRIEF.md`](docs/01_PRODUCT_BRIEF.md)                                               | Vision, users, experience, non-goals, public branding  |
| [`docs/02_TECHNICAL_ARCHITECTURE.md`](docs/02_TECHNICAL_ARCHITECTURE.md)                             | Layers, data flow, schema overview, deployment         |
| [`docs/03_MODEL_SPEC.md`](docs/03_MODEL_SPEC.md)                                                     | Inputs, ratings, xG, Poisson, Monte Carlo, evaluation  |
| [`docs/04_DATA_AND_LEGAL_POLICY.md`](docs/04_DATA_AND_LEGAL_POLICY.md)                               | Permitted/prohibited data + IP + FIFA hardening        |
| [`docs/05_BUILD_ROADMAP.md`](docs/05_BUILD_ROADMAP.md)                                               | Phased delivery plan                                   |
| [`docs/06_CLAUDE_CODE_RULES.md`](docs/06_CLAUDE_CODE_RULES.md)                                       | Binding rules for AI-assisted contributions            |
| [`docs/07_DESIGN_SYSTEM.md`](docs/07_DESIGN_SYSTEM.md)                                               | Warm tournament palette, type, motion, a11y, foil card |
| [`docs/08_FLAG_AND_VISUAL_ASSET_POLICY.md`](docs/08_FLAG_AND_VISUAL_ASSET_POLICY.md)                 | Flag asset registry + SVG wave animation policy        |
| [`docs/09_PORTFOLIO_BRIEF.md`](docs/09_PORTFOLIO_BRIEF.md)                                           | Pitches, LinkedIn / portfolio / resume copy            |
| [`docs/10_INTERVIEW_TALK_TRACK.md`](docs/10_INTERVIEW_TALK_TRACK.md)                                 | Interview scripts and worked Q&A answers               |
| [`docs/11_SCREENSHOT_AND_DEMO_GUIDE.md`](docs/11_SCREENSHOT_AND_DEMO_GUIDE.md)                       | Screenshot plan, demo scripts                          |
| [`docs/12_ARCHITECTURE_DIAGRAM.md`](docs/12_ARCHITECTURE_DIAGRAM.md)                                 | Mermaid architecture diagram + prose                   |
| [`docs/13_DEPLOYMENT_CHECKLIST.md`](docs/13_DEPLOYMENT_CHECKLIST.md)                                 | Vercel deploy walkthrough + IP preflight + rollback    |
| [`CLAUDE.md`](CLAUDE.md)                                                                            | Quick-reference rules for Claude Code                  |

---

## Licence

To be decided before any public release. The codebase is private until then.
