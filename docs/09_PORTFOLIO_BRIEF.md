# 09 — Portfolio Brief

Reusable copy and framing for the project's public surfaces — LinkedIn, portfolio site, recruiter outreach, resume. Internal-facing; not deployed.

The public name is **Global Football 2026 Predictor**. Restricted FIFA / tournament terms are kept out of all marketing copy and only appear in disclaimer / non-affiliation contexts (`docs/04_DATA_AND_LEGAL_POLICY.md` §3.6).

---

## 1. The 30-second pitch

> Global Football 2026 Predictor is an independent football probability dashboard built end-to-end in TypeScript. A deterministic statistical engine (Elo ratings, Poisson scoreline matrix, Monte Carlo simulation) produces append-only prediction runs that a Next.js App Router UI renders as collectible match cards. Engine, scheduler, persistence, and UI are isolated by lint boundaries and verified by 230+ tests. It is a portfolio project; it ships with mock fixtures and a clear legal/IP perimeter.

Designed to fit a recruiter scan in under 30 seconds.

---

## 2. The 2-minute pitch

The project is a full-stack analytical dashboard that estimates match outcome probabilities for the 2026 international tournament. It is independent and analytical — not a betting product, not a streaming product, not affiliated with any official body.

**The architecture is the story.** The statistical core is a pure-TypeScript engine that takes a typed `PredictionInput` and returns a typed `PredictionOutput`. It uses an Elo-style team rating, a recent-form summary with exponential time decay, an xG approximation, a Poisson scoreline matrix with a Dixon-Coles low-score correction, and a seeded Monte Carlo simulation. Same inputs plus same seed produce byte-identical output, which is enforced by a determinism test.

Around that core there are four other layers, each with a single job:

- **Mock data** — eight fictional teams across five confederations, four group-stage fixtures with realistic stats.
- **Scheduler** — picks which run types are due (T−3h, T−1h, Kickoff, HT, FT), composes inputs, calls `predictMatch`, and writes one append-only row per `(fixture, run_type, model_version, scheduled_for)` lifecycle event. Idempotent under retries.
- **Persistence** — a typed `PredictionRepository` interface with an in-memory implementation now and a Supabase-backed one queued for a follow-up phase. SQL constraints and the TypeScript API surface both enforce append-only.
- **UI** — Next.js App Router + Tailwind. A server-only `demoPredictions` helper runs the engine once at module load, freezes the rows, and exposes typed getters. Components consume DB-shaped rows only and are forbidden by ESLint from importing the engine.

**What makes it a portfolio piece**, not just a working app:

- Twelve binding documents written before the code — product, model spec, schema, design system, legal/IP, flag asset policy, build roadmap.
- 230+ tests including property-based engine checks, append-only constraint tests, and UI-vocabulary scans that prove restricted tournament marks aren't in the deployed product.
- A warm tournament fan-experience visual direction — collectible match cards with subtle foil interaction, placeholder geometric flags with reduced-motion fallback, broadcast-style prediction timeline.
- A deliberate legal/IP perimeter: the public product name avoids restricted competition marks, every page renders an independence disclaimer, and no real flag assets ship until a documented asset registry exists.

What it does not do: real sports-API integration, real Supabase reads, live scores, auth, player cards. Those are explicit follow-on phases, not gaps.

---

## 3. The problem solved

Around major tournaments the public encounters predictions that are either opaque ("our experts say…"), commercially motivated (bookmaker odds), or hidden behind paywalled academic models. There is no widely available, transparent, well-presented public dashboard that shows every match in tournament order, continuously updates its predictions, explains where each probability comes from, and tracks its own accuracy after the fact.

This project demonstrates that the gap is fillable with classical statistics and disciplined architecture — no proprietary data, no machine-learning hand-waving, no betting framing.

---

## 4. Why it is technically interesting

- **Engine isolation, enforced.** The statistical engine doesn't import React, doesn't read the database, and doesn't call the network. The UI doesn't import the engine. The boundary is enforced three ways: by ESLint, by a runtime file-content test, and by the DB-row shape that components consume. Swapping out the data layer is a one-file change.
- **Deterministic numerics.** All randomness flows through one seeded RNG. The same input + same seed produces byte-identical output, verified by a determinism test. Monte Carlo convergence is tested at `N = 10_000` against the analytic Poisson marginals within a documented 1.5% tolerance.
- **Append-only by construction.** A unique constraint on `(fixture_id, run_type, model_version, scheduled_for)` plus a `PredictionRepository` interface with no `update*` methods means the scheduler's retries are idempotent at both the SQL and TypeScript layers, and the prediction history is preserved forever.
- **Legal/IP perimeter as code.** Restricted tournament marks are blocked by a vocabulary scan over every UI source file. Real flag assets are gated on a registry that doesn't exist yet, so the UI ships with internally-authored geometric placeholders. An independence disclaimer is rendered in the footer of every public page.
- **Production-shaped, demo-fast.** The same `PredictionRepository` interface that the scheduler writes through is the one a Supabase backend will satisfy. The same `PredictionRunRow` type the UI reads from is the one a `SELECT * FROM prediction_runs` would return. The demo just front-loads the engine at module load — wiring is unchanged.

---

## 5. Key engineering decisions

| Decision                                                                                                | Why                                                                                                            |
|---------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------|
| Pure-TS deterministic engine, no ML in V1                                                               | Predictability, testability, no opaque weights, no proprietary training data risk                              |
| Mulberry32 single seeded RNG                                                                            | Simple, well-tested, 32-bit deterministic — no `Math.random()` anywhere in the engine                          |
| Poisson scoreline matrix with Dixon-Coles correction (ρ = 0 in v0.1.0)                                  | Classical and explainable; ρ can be calibrated post-tournament without re-architecting                          |
| Append-only `prediction_runs` with `UNIQUE (fixture_id, run_type, model_version, scheduled_for)`         | Idempotent scheduler retries + complete prediction history for accuracy review                                 |
| Repository interface with no `update*` methods                                                          | Append-only encoded in the TypeScript API surface, not just SQL constraints                                    |
| Mock-first data flow behind a `FixtureSource` interface                                                 | The engine, scheduler, persistence, and UI can all be developed offline; real providers slot in unchanged       |
| Strict UI / engine separation enforced by ESLint + runtime test                                         | The UI never silently slips a probability calculation into a component                                          |
| Warm tournament palette, original collectible-card aesthetic with subtle foil interaction               | Premium fan experience without imitating Panini / EA FC / FUT / official tournament chrome                     |
| Placeholder geometric flags only; real flags gated on `docs/08` asset registry                          | Lawful national-symbology handling and provenance discipline before anything ships                              |
| Public product name kept clear of restricted competition marks; disclaimer on every page                | Reduces unauthorised-association risk; aligns with `docs/04` §3.6                                              |

---

## 6. Legal / IP safety decisions

- **Public product name** is `Global Football 2026 Predictor` (decisive choice in `docs/01` §9). Restricted competition marks listed in `docs/04` §3.6 do not appear in product UI, page titles, OpenGraph metadata, route names, navigation, or repeated chrome.
- **Independence disclaimer** is rendered in the footer of every public page via a single source component (`src/components/Disclosure.tsx`). The vocabulary scan over every UI source file allows `FIFA` only in that file and only in the non-affiliation sentence; `sponsor` follows the same carve-out.
- **No real flag assets.** The `WavingFlag` component renders three abstract horizontal colour bands picked deterministically from an 8-palette by team-id hash. Carries no national symbology. Real flags wait for the asset registry in `docs/08` §5.
- **No copyrighted artwork.** No federation crests, kits, broadcaster graphics, agency photographs, trophy imagery, Panini/EA Sports/FUT trade dress, or mascots. No `<img>` tags reference any external asset.
- **No betting framing.** A banned-vocabulary scan over every UI source file blocks `odds`, `bet`, `wager`, `stake`, `sure thing`, `guaranteed pick`, `bookmaker`, `sportsbook`, `value bet`, `official`, `licensed`, and `sponsor` from product copy.

---

## 7. What is implemented now

- ✅ Phase 0 — Twelve binding documents (product, architecture, model, legal/IP, build roadmap, design system, flag policy, plus this brief, the interview track, the screenshot guide, and the architecture diagram).
- ✅ Phase 1 — Next.js + TypeScript scaffold, strict mode, Tailwind tokens, Vitest, ESLint engine-isolation lint rule.
- ✅ Phase 2 — Canonical domain types and a complete mock tournament: 8 fictional teams, 4 group-stage fixtures, realistic stats with 5-match recent histories per team.
- ✅ Phase 3 — Full statistical engine: Elo ratings, recent form, xG approximation, expected-goals derivation, Poisson scoreline matrix + Dixon-Coles, seeded Monte Carlo, confidence scoring, `predictMatch` orchestrator. Frozen constants in `version.ts`.
- ✅ Phase 4 — Supabase / PostgreSQL schema with append-only constraints, typed `PredictionRepository` interface, in-memory implementation, persistence row types and mappers.
- ✅ Phase 5 — Scheduler with deterministic lifecycle timestamps, idempotent dispatch, and a Vercel Cron route protected by `CRON_SECRET` Bearer auth.
- ✅ Phase 6 — UI shell: home schedule, match-detail page, collectible match cards, broadcast-style timeline, accessible probability bars, placeholder waving flags.
- ✅ Phase 6.1 — Polish: featured-match panel, hero stats, foil card treatment, humanized warnings, clean GMT formatting, premium footer.
- 🟡 Phase 7 — Real data integration. Adapter interfaces and the `data_sources` registry are in place; the live `FixtureSource` implementation is not.
- 🟡 Phase 8 — Accuracy dashboard. `accuracy_reviews` schema is in place; the UI surface is not.

---

## 8. What is intentionally mocked or deferred

- **Real sports-API integration.** Deliberately deferred to Phase 7. The `FixtureSource` interface and `data_sources` registry schema are in place so the swap-in is a one-file change with provenance documented before any adapter is integrated.
- **Real Supabase reads.** Deliberately deferred until Phase 7. The `PredictionRepository` interface is satisfied by an in-memory implementation today; the Supabase-backed implementation will satisfy the same interface.
- **Real national flag SVGs.** Deliberately deferred until the asset registry in `docs/08` §5 is populated and reviewed. The UI ships placeholder geometric colour bands today.
- **Live in-play data and minute-by-minute probability.** V2+ in the roadmap (`docs/05_BUILD_ROADMAP.md` V2.2). Engine and schema already accommodate it via the `HT` run type and a future `'LIVE'` enum value.
- **Player data cards.** V2.1 in the roadmap. Gated on the same flag asset registry and an explicit approval round.
- **Auth, social features, notifications.** Out of v1.

The point is not what's missing — it's that nothing missing is a surprise. Every deferral is documented before it would have been built.

---

## 9. Future roadmap

| Phase | Work                                                                                                  |
|-------|-------------------------------------------------------------------------------------------------------|
| 7     | Live `FixtureSource` adapter; Supabase-backed `PredictionRepository`; backfill of historical Elo from a licensed provider; flag asset registry populated; rendered attribution in footer per `docs/04` §6 |
| 8     | `/accuracy` page with Brier and log-loss trends per `run_type`, calibration plot, scoreline hit rate; polish pass to Lighthouse targets |
| V2.1  | Original-design "data cards" view — no Panini / EA / FUT trade dress; explicit approval                |
| V2.2  | Live minute-by-minute probability stream with a new `'LIVE'` run type; still append-only               |

---

## 10. LinkedIn post — suggested draft

> Just shipped my latest portfolio project: **Global Football 2026 Predictor** — a statistical match-prediction dashboard built end-to-end in TypeScript.
>
> What's under the hood:
>
> 🎯 A deterministic prediction engine — Elo ratings, recent form with exponential decay, Poisson scoreline matrix with Dixon-Coles correction, seeded Monte Carlo simulation. Same inputs + same seed = byte-identical output.
>
> 🗂️ Append-only PostgreSQL with idempotent scheduler retries. A unique constraint on `(fixture_id, run_type, model_version, scheduled_for)` makes Vercel Cron retries collapse onto the same row. Earlier predictions are never overwritten, so every match accumulates a complete prediction history.
>
> 🚧 Engine-isolation lint rules + a runtime boundary test keep prediction math out of the UI. Components only see DB-row shapes; swapping the data layer is a one-file change.
>
> 🎨 A warm tournament fan-experience palette, collectible match cards with subtle foil interaction, broadcast-style prediction timeline, placeholder geometric flags with reduced-motion fallback. Premium feel without imitating any official chrome.
>
> 📐 230+ tests across the engine, scheduler, persistence, and UI — including property-based engine checks and a vocabulary scan that proves no restricted competition marks are in the deployed product.
>
> Independent analytical project. Not affiliated with FIFA, any federation, tournament organizer, broadcaster, or sponsor. Predictions are probabilistic estimates, not guarantees.
>
> Stack: Next.js (App Router) · TypeScript (strict) · Tailwind · Vitest · Supabase / PostgreSQL · Vercel Cron
>
> #TypeScript #NextJS #Statistics #DataEngineering #Portfolio

---

## 11. Portfolio website blurb — suggested

> **Global Football 2026 Predictor** — independent football probability dashboard. Deterministic TypeScript engine (Elo + Poisson + Monte Carlo), append-only PostgreSQL with idempotent scheduling, Next.js App Router UI with strict engine-isolation boundaries. 230+ tests, accessibility-first, legal/IP-perimeter as code.

Or shorter:

> Independent football probability dashboard. Deterministic prediction engine, append-only persistence, premium tournament UI. End-to-end TypeScript, strict architectural boundaries, 230+ tests.

---

## 12. Resume bullets — suggested

Pick three or four that match the role:

- Designed and built a deterministic statistical prediction engine in pure TypeScript (Elo ratings, Poisson scoreline matrix with Dixon-Coles correction, seeded Monte Carlo simulation) with property-based Vitest coverage and a determinism guarantee enforced by tests.
- Engineered an append-only PostgreSQL schema with `UNIQUE (fixture_id, run_type, model_version, scheduled_for)` and a corresponding TypeScript `PredictionRepository` interface that exposes no `update*` methods, making scheduler retries idempotent at both the SQL and API surfaces.
- Shipped a Vercel Cron-driven scheduler that composes engine inputs, persists ranked scoreline rows, and reports `SUCCEEDED / SKIPPED / FAILED` per dispatched candidate; protected by `CRON_SECRET` Bearer auth and tested against an accelerated clock.
- Built a Next.js App Router public dashboard with strict ESLint engine-isolation boundaries (components cannot import prediction math, verified by a runtime backstop test) and a warm tournament fan-experience palette.
- Implemented an enforceable legal/IP perimeter as code: restricted-vocabulary scans over every UI source file, an independence disclaimer rendered on every public page, and a flag asset registry that gates real national-symbology imagery.
- Wrote 12 binding architecture and policy documents (product brief, model spec, schema, design system, flag policy, build roadmap) before writing code, enabling parallel work and reducing rework.
- Maintained 230+ tests across engine, simulation, persistence, scheduler, and UI; achieved deterministic, byte-identical output under fixed seed; convergence-tested Monte Carlo against analytic Poisson marginals.

---

## 13. Talking points for outreach

If you message a recruiter, lead with the architecture, not the tournament:

> "I built a portfolio project around three engineering ideas I keep finding interesting: a deterministic statistical engine that's fully isolated from the UI, an append-only persistence layer that makes scheduler retries idempotent at both the SQL and API surfaces, and an enforceable legal/IP perimeter — including a vocabulary scan that fails the build if restricted competition marks appear in any UI source file. It's a football prediction dashboard but the data flow is what I'd actually like to talk about."

This frames you as someone who thinks about contracts, not someone with a football demo.

---

## 14. What this project demonstrates professionally

For each axis below, point at the file or test in the next paragraph during a screen-share — that's what makes the demonstration credible.

- **Architectural discipline.** Engine isolation, append-only persistence, mock-first data flow, interface-driven swap-in for real providers. ESLint + runtime boundary test + DB-row contract together make the boundary stick. See `docs/12_ARCHITECTURE_DIAGRAM.md`.
- **Statistical literacy.** Classical methods (Elo, Poisson, Dixon-Coles, Monte Carlo) implemented in pure TypeScript with frozen versioned constants, deterministic seeded RNG, convergence-tested simulation. See `src/lib/model/predict.ts` + `docs/03_MODEL_SPEC.md`.
- **Test discipline.** 230+ tests across engine (property-based), scheduler (timing + idempotency), persistence (append-only constraint), UI (boundary + vocabulary + render-string smoke), with engine-purity enforced via source-scan tests.
- **Domain modelling.** Single canonical `PredictionInput` / `PredictionOutput` contract that every layer agrees on. `RunType` enum pinned across CLAUDE.md, the SQL CHECK constraint, the row types, and the engine inputs.
- **Production thinking, demo speed.** The deployed UI runs against a server-side helper that uses the real engine and produces real DB-row shapes; swapping the helper for a Supabase read is a one-file change.
- **Legal-aware engineering.** Restricted-vocabulary scans, the placeholder flag pattern, the asset registry policy, and the independence disclaimer rendered as a single-source component show that legal considerations were designed in, not bolted on.
- **Design system thinking.** A warm tournament palette with token discipline (`docs/07`), an original collectible-card foil treatment that explicitly avoids Panini / FUT / EA chrome, reduced-motion support across every motion path, and a WCAG AA contrast floor.
- **Documentation discipline.** Twelve binding documents written before the code, including the policy / disclosure / flag-registry frameworks. Every commit cites the doc section it implements.
