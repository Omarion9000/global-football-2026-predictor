# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project summary

**World Cup 2026 Predictor** — a portfolio-grade full-stack football analytics platform that estimates outcome probabilities for every FIFA World Cup 2026 match. The engine uses Elo-style team ratings, recent form with exponential decay, an xG approximation, a Poisson scoreline matrix with Dixon-Coles correction, and Monte Carlo simulation. Scheduled prediction runs are stored append-only and evaluated post-match.

Stack: Next.js (App Router), TypeScript (strict), Tailwind CSS, Supabase/PostgreSQL, Vercel + Vercel Cron, Recharts, Vitest.

## Non-negotiable rules

1. **Do not position this app as a betting or gambling product.** No odds formats, no stakes, no affiliate links. Use the word "probability," not "odds."
2. **Do not embed unauthorized live streams.** No embeds, no deep links, no stream-locator features.
3. **Do not use copyrighted player images or official FIFA/Panini/EA visual styles unless explicitly licensed.** This covers marks, badges, photographs, card frames, and trade dress.
4. **Do not mix statistical model logic into React UI components.** The engine is computed in `src/lib/{model,simulation,normalization,utils}`; the UI only renders persisted output.
5. **Do not overwrite prediction runs.** Every run is a new row carrying `run_type`, `model_version`, `scheduled_for`, `executed_at`, and a `data_snapshot` reference. `UPDATE predictions …` is a bug.
6. **Build with mock data first, then integrate real APIs later.** All external data flows through an adapter interface; the default adapter reads `src/mock/`.
7. **The prediction engine must be deterministic and testable.** Pure functions, typed inputs/outputs, one seeded RNG utility, Vitest coverage.
8. **Large refactors require explanation before execution.** State the scope, the reason, and the blast radius first; wait for confirmation before touching multiple modules.
9. **Avoid scope creep.** Player cards, live minute-by-minute probability, and streaming links are V2+ and require explicit approval.

## Architecture boundaries

```
Vercel Cron → Scheduler → Engine (pure TS) → Postgres (append-only) → Next.js UI
```

- `src/lib/{model,simulation,normalization,utils}` MUST NOT import `react`, `next/*`, `@/components/**`, or `@/app/**`. Enforced by lint in Phase 1.
- Engine functions take typed inputs and return typed outputs. No network I/O, no DB I/O at the engine core.
- Persistence is the scheduler's job, not the engine's, not the UI's.
- The UI reads from Postgres via a typed query layer. It never computes a prediction.

## Prediction timeline

Each match accumulates an append-only sequence of runs:

| `run_type` | Trigger        | Purpose                                            |
|-----------|----------------|----------------------------------------------------|
| `T_MINUS_3H` | 3h pre-kickoff | Baseline pre-match prediction                      |
| `T_MINUS_1H` | 1h pre-kickoff | Lineup-aware refinement                            |
| `T_ZERO`     | Kickoff        | Final pre-match snapshot                           |
| `HT`         | Half-time      | In-play recalibration                              |
| `FT`         | Full-time      | Accuracy review (Brier, log-loss, calibration)     |

Every row records `run_type`, `model_version`, `scheduled_for`, `executed_at`, and a `data_snapshot` reference identifying the inputs used.

## Development priority

Engine before UI. The order is fixed:

1. Documentation (Phase 0 — current).
2. Scaffolding + lint boundaries (Phase 1).
3. Types + mock data (Phase 2).
4. Statistical engine, fully tested (Phase 3).
5. Database + persistence (Phase 4).
6. Scheduler + Vercel Cron (Phase 5).
7. UI shell on top of stored predictions (Phase 6).
8. Real data integration (Phase 7).
9. Accuracy dashboard + polish (Phase 8).

Full detail in `docs/05_BUILD_ROADMAP.md`. Do not skip ahead.

## Commands

```
pnpm dev            # local Next.js dev server (http://localhost:3000)
pnpm build          # production build
pnpm start          # serve the production build
pnpm test           # Vitest — watch mode in TTY, one-shot in CI
pnpm test --watch   # Vitest in explicit watch mode
pnpm lint           # ESLint via `next lint`, including the engine-isolation boundary rule
pnpm typecheck      # tsc --noEmit
# Supabase + Vercel commands will be documented here once Phase 4/5 land.
```

`next lint` is deprecated upstream and will be removed in Next.js 16; migration to the ESLint CLI is queued as a follow-up. Vitest defaults to watch mode in a TTY and one-shot when `CI=true` is set.

## Tooling versions

- **Node.js:** 22 LTS (pinned via `.nvmrc` and `engines` in `package.json` once Phase 1 lands).
- **Package manager:** pnpm.
- **CI:** GitHub Actions (`.github/workflows/ci.yml`).
- **Engine-isolation lint:** ESLint `no-restricted-imports` first; `eslint-plugin-boundaries` may be added later if rule complexity grows.
- **Tailwind tokens:** sourced from `docs/07_DESIGN_SYSTEM.md`.

## Testing expectations

- Every engine module under `src/lib/model` and `src/lib/simulation` has a Vitest suite.
- Prefer property tests (symmetry, monotonicity, calibration bounds) over single-example tests where applicable.
- The Monte Carlo simulator has a convergence test with a fixed seed and a documented tolerance.
- Determinism is testable: identical inputs + identical seed must produce identical output.
- Engine code without tests is not considered done. UI code is verified manually in Phase 6+.

## Legal / data restrictions

- **No betting framing.** No odds formats, stake suggestions, affiliate links, or "value bet" language.
- **No unauthorized streams.** No embedded video, no stream URLs, no how-to-watch instructions outside licensed broadcaster homepages.
- **No copyrighted assets.** No FIFA, confederation, federation, Panini, or EA Sports artwork, marks, or player photographs. No agency images. Future "data cards" must be original designs.
- **Licensed or open data only.** Every data source is recorded in the `data_sources` table with its licence and attribution. Scraping prohibited sources is not permitted.
- Full policy: `docs/04_DATA_AND_LEGAL_POLICY.md`.

## What not to build yet

Not in scope without explicit approval:

- Next.js app code, packages, components, or routes (Phase 1+).
- Any UI in Phase 0–5; the schedule and match-detail pages arrive in Phase 6.
- Real sports-API integrations (Phase 7).
- Player "data cards" view (V2+).
- Live minute-by-minute probability stream (V2+).
- Streaming links of any kind in v1 (never); any future "where to watch" homepage-link feature requires legal review and must follow `docs/04_DATA_AND_LEGAL_POLICY.md` §2.5.
- Auth, social features, notifications (out of v1).

When asked to do something outside scope or in conflict with the rules above: refuse, cite the rule, and propose a compliant alternative. If a request is ambiguous, ask one focused clarifying question instead of guessing.
