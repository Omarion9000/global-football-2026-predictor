# 10 — Interview Talk Track

Scripts and worked answers for technical interviews, take-home walkthroughs, and recruiter screens. Internal-facing; not deployed.

The goal is to talk about *the architecture and the engineering decisions*, not to demo a football app. If the interviewer wants a UI tour, that's fine — but lead with the contracts.

---

## 1. The opening — what to say first

> "It's a football match-prediction dashboard built end-to-end in TypeScript, but the interesting parts are the architecture decisions, so let me start there. There's a deterministic statistical engine, an append-only persistence layer, a scheduler that runs predictions at five lifecycle anchors per match, and a Next.js UI that's prevented from importing any of the engine math. I can walk through any of those, or there are a few engineering decisions I'd particularly like to explain — what would be most useful for you?"

Lets them steer. Demonstrates that you understand which parts of your own work are interesting.

---

## 2. Explaining the architecture (3–4 minutes)

Open `docs/12_ARCHITECTURE_DIAGRAM.md` if screen-sharing.

> "There are five horizontal layers and the rule is that each one talks only to its immediate neighbours.
>
> Mock data is the bottom layer — eight fictional teams and four group-stage fixtures behind a `FixtureSource` interface. When real data lands in a future phase, the swap is one file, because the adapter interface is the contract everything else depends on.
>
> The scheduler is the next layer up. It receives `now` and the fixture list and decides which `(fixture, run_type)` pairs are due. Run types are pinned: `T_MINUS_3H`, `T_MINUS_1H`, `T_ZERO`, `HT`, `FT`. For each due candidate it composes a `PredictionInput` and calls the engine.
>
> The engine is pure TypeScript. It doesn't import React, doesn't touch the network, doesn't read the database. It takes a typed input, runs a Poisson scoreline matrix and a seeded Monte Carlo simulation, and returns a typed `PredictionOutput`. Same input plus same seed produces byte-identical output.
>
> The scheduler hands the engine's output to the persistence layer. A unique constraint on `(fixture_id, run_type, model_version, scheduled_for)` means scheduler retries collapse onto the same row. The TypeScript `PredictionRepository` interface deliberately has no `update*` methods, so the append-only rule is encoded in both the SQL and the API surface.
>
> Finally the UI reads from the persistence layer. Components only see DB-row shapes — `PredictionRunRow` and `PredictionScorelineRow`. An ESLint rule plus a runtime backstop test prevent any component from importing the engine. The pay-off is that the deployed UI today reads from a server-only demo helper that runs the engine at module load and freezes the rows, and tomorrow it'll read from Supabase, and nothing in the components changes."

---

## 3. Explaining the prediction engine

Open `src/lib/model/predict.ts`.

> "The model is classical statistics, deliberately. I wanted something explainable and testable, not a black box.
>
> Each team has an Elo-style rating and a recent-form summary with exponential time decay. From those I derive an attack factor and a defence factor per team. Multiplied with a base goals-per-side and a few context multipliers — rest days, altitude, host-nation advantage — I get expected goals for each side, clamped to a reasonable range.
>
> Those two expected-goals figures feed a Poisson scoreline matrix. I treat home and away goals as independent Poisson variables and compute the joint probability for every `(i, j)` up to a 6×6 cell window plus a residual tail. There's a Dixon-Coles low-score correction parameter, currently set to zero, that I can calibrate post-tournament against actual results without re-architecting.
>
> In parallel I run a seeded Monte Carlo simulator. It's not the source of truth for headline probabilities — the analytic Poisson marginals are — but it serves as a sanity check, and it's the source of truth for tournament-level rollups like 'probability team X reaches the semis.' At `N = 10_000` it converges to within about 1.5% of the analytic marginals on a healthy run.
>
> One thing I'm particular about: every random draw goes through one seeded RNG utility. `Math.random()` is never called from inside the engine. That's what makes the determinism guarantee real, and there's a test that runs `predictMatch` twice on the same input + seed and asserts byte-identical output."

If they ask about why no machine learning: *"V1 is deliberately no-ML. I want predictability, replayability across model-version bumps, and no opaque weights. Classical methods get me 80% of the value and 100% of the explainability."*

---

## 4. Explaining append-only prediction runs

> "Append-only is the spine of the product. Every scheduled run inserts a new row. Earlier runs are never overwritten. There are three reasons for that.
>
> First, accuracy review. At full-time I want to compare the prediction the engine made at T−3h, T−1h, kickoff, and half-time against the actual result. If any of those rows got overwritten by the next stage, that comparison disappears.
>
> Second, model versioning. If I bump `model_version` from v0.1.0 to v0.2.0, the old rows are still there for historical comparison. I can show how the new model's predictions diverge from what it would have said earlier.
>
> Third, idempotent retries. The scheduler computes `scheduled_for` as the canonical lifecycle timestamp — kickoff minus three hours for `T_MINUS_3H`, for example. If Vercel Cron fires the same dispatch twice, both inserts land at the same `scheduled_for` value, collide on the unique constraint, and the second one is dropped. No double-counting, no second prediction at the same lifecycle event.
>
> I enforce the rule three ways. There's a SQL `UNIQUE (fixture_id, run_type, model_version, scheduled_for)`. The `PredictionRepository` interface has no `update*` methods — calling code can't even attempt an update. And the in-memory implementation that tests use mirrors the same key collision via a `DuplicatePredictionRunError`. The scheduler catches that error and reports `SKIPPED` instead of failing."

---

## 5. Explaining scheduler + cron

Open `src/lib/scheduler/dueRuns.ts` and `src/app/api/cron/predictions/route.ts`.

> "Vercel Cron hits a Next.js route every five minutes. The route checks the `Authorization: Bearer ${CRON_SECRET}` header — missing or wrong secret is a 401, opaque error, never a stack trace.
>
> Inside, the route asks `runScheduler` for the work to do at `now`. The scheduler does two things. First, `getDuePredictionRuns` iterates every fixture × every run type, computes the canonical `scheduled_for` per run type, checks the existing-runs index for a match on the full idempotency key, and produces a list of candidates. For `HT` and `FT`, the candidate is gated on `fixture.status` — the clock alone isn't enough, because we don't want a half-time prediction if the match is still in the first half. If the timestamp's passed but the status hasn't moved, we emit a `WARN`-style scheduler note and skip.
>
> Second, `executePredictionRun` takes each candidate, loads the fixture and team stats from the injected sources, hashes the lifecycle identity into a deterministic snapshot id, runs the engine with a deterministic seed derived from the same lifecycle string, and writes the prediction row and the scorelines.
>
> The pay-off is that the same scheduler invocation, given the same data, produces the same output every time. That's testable — there's an end-to-end test with a mocked clock that runs the dispatcher twice and asserts the second pass adds zero rows."

---

## 6. Explaining UI boundaries

Open `.eslintrc.json` and `src/components/__tests__/ui-boundaries.test.ts`.

> "The UI is forbidden from doing prediction math. There are three independent enforcements.
>
> One — an ESLint rule. `src/components/**` is blocked from importing `@/lib/model`, `@/lib/simulation`, `@/lib/normalization`, `@/lib/utils/rng`, and `@/lib/utils/poisson`. Any component that adds one of those imports fails lint and CI.
>
> Two — a runtime boundary test. It reads every `.tsx` file in `src/components/` and asserts the forbidden import patterns don't appear. That's a backstop for anything the lint rule misses or for someone disabling the rule with a comment.
>
> Three — the contract. Components only consume `PredictionRunRow` and `PredictionScorelineRow`. Whether that row came from the demo helper or a future Supabase read, the component contract is identical. There's no way for a component to ask 'recompute this probability for me' because there's nothing exposed that could.
>
> The pay-off is that I can swap the data layer wholesale and the UI is unaffected. The deployed UI today reads from a server-only helper that runs `predictMatch` at module load and freezes the rows. Tomorrow it'll read from Supabase. Neither change touches a component."

---

## 7. Explaining the legal/IP constraints

Open `docs/04_DATA_AND_LEGAL_POLICY.md` §3.6 and `src/components/__tests__/ui-vocabulary.test.ts`.

> "The project is an independent analytical portfolio piece, not anything official. I wrote the legal/IP perimeter into the codebase from day one.
>
> Restricted competition marks — `FIFA`, `World Cup`, `Mundial`, and equivalents — are blocked from product UI by a vocabulary scan over every component and page source file. The only exception is the Disclosure component, where `FIFA` is allowed in the non-affiliation sentence and only there. There's a similar carve-out for `sponsor`. Adding any of those words anywhere else fails the build.
>
> Banned betting and sportsbook vocabulary is blocked the same way — `odds`, `bet`, `wager`, `stake`, `sure thing`, `bookmaker`, `value bet`, `official`, `licensed`, `sponsor`. The disclaimer's required `sponsor` mention is the only exception.
>
> Flag handling is documented in a separate flag asset policy. Today the UI ships internally-authored geometric placeholders — three abstract colour bands per team, no national symbology. Real flags are gated on an asset registry that records source, licence, attribution requirement, and notes, and I haven't populated that registry yet because the placeholders are sufficient for a portfolio demo.
>
> The independence disclaimer is rendered in the footer of every public page via a single source component, so updating the legal text is a one-file change."

---

## 8. Worked answers to common questions

### "What was the hardest part?"

> "The hardest engineering decision was probably the engine isolation. It would have been faster to let a component just call `predictMatch` when it needed a number. But once you do that, you're inside a six-month re-architecture: the engine starts importing React types, the test surface explodes, the page gets coupled to specific model fields, and swapping in real persistence becomes a UI rewrite.
>
> So I committed early to three things: the engine has no React imports and no I/O, components only consume DB-row shapes, and the boundary is enforced by tooling. It cost me about two extra layers in the call graph — a server-side demo helper plus the persistence row mappers — but it means the deployed UI today runs against the real engine and the real DB-row contract, and a future Supabase swap is one file."

### "How did you test it?"

> "Layered. The engine has property-based tests for monotonicity and clamps, a determinism test that runs `predictMatch` twice with identical input plus seed and asserts byte-identical output, and a Monte Carlo convergence test at `N = 10_000` against the analytic Poisson marginals within a 1.5% tolerance. The scheduler has a mocked-clock end-to-end test that produces a full T_MINUS_3H to FT history for one fixture and confirms the second pass is idempotent. Persistence has a duplicate-insert test that proves the SQL constraint fires. The UI has a boundary test that source-scans every component file for forbidden imports and a vocabulary test that source-scans for restricted competition marks and banned betting vocabulary. The pages have render-to-string smoke tests that assert the disclaimer and the product name are in the output and the raw engine warning strings aren't.
>
> 230-something tests across the whole stack. All of them run in about a second and a half."

### "How would you scale it?"

> "Two scaling axes — fixtures and concurrent reads.
>
> Fixtures: today the scheduler iterates every fixture × every run type per cron tick. At 4 mock fixtures that's nothing. At 48 World Cup fixtures × 5 run types × cron-every-5-minutes that's still trivial. The interesting scaling moment is historical backfill — recomputing Elo across thousands of international matches per model version bump. That's a batch job, not the cron path, and it would write to the same `prediction_runs` table via the same repository interface.
>
> Concurrent reads: Supabase / Postgres handles this with read replicas and `prediction_runs` is indexed on `(fixture_id, executed_at)` and on the unique idempotency key. The UI cache is HTTP-level via Next.js's revalidation, since the predictions are append-only and have predictable lifecycle anchors. If demand spikes, the schedule page becomes a static page that revalidates every few minutes; match-detail pages cache by fixture id and revalidate after a known run-type window crosses."

### "What would you improve next?"

> "Three things in order. One — wire up the real Supabase implementation of `PredictionRepository`. The interface is already there and the in-memory implementation that the in-memory tests use is the contract. Two — populate the flag asset registry with vetted public-domain SVGs, so the UI gets real national colour bands. Three — build the `/accuracy` page on top of the `accuracy_reviews` table. The schema's already there from Phase 4; the UI just needs the Recharts surface. After those, I'd start work on a real `FixtureSource` adapter against API-Football or Sportmonks."

### "Why did you avoid official branding?"

> "Two compounding risks. First, trademark dilution — `World Cup` is heavily protected and a public site that styles itself as a `World Cup 2026 Predictor` can be read as implying affiliation even with a disclaimer. Second, cease-and-desist exposure — a portfolio project that uses the protected name puts itself in the path of routine IP enforcement, and the engineering content is unchanged whether the public name is `World Cup 2026 Predictor` or `Global Football 2026 Predictor`. So I renamed the public surface and kept the working title in the repo directory only. The repo on GitHub can stay descriptive; the deployed product uses the safer name. I codified the restricted-term list in `docs/04` and added a vocabulary scan that fails the build if any of those terms slip into product UI."

### "What would productionizing this require?"

> "The data layer and the disclaimer block.
>
> Data layer: replace `InMemoryPredictionRepository` with a Supabase-backed implementation satisfying the same interface, run the Phase 4 migration against a real Supabase instance, populate `data_sources` rows for whatever provider I onboard, swap `MockFixtureSource` for a real adapter, and stand up a backfill job for historical Elo ratings. The interfaces don't move.
>
> Disclaimer block: confirm the rendered attribution string per the provider's licence terms in the footer, populate the flag asset registry per `docs/08` §5, and run the pre-release IP review checklist in `docs/04` §9 — vocabulary scan, asset provenance scan, disclosure presence, release-notes diff.
>
> The two operational things I'd want before production traffic: rate-limit-aware retries in the live `FixtureSource`, and a real model-runs writer so the cron route's structured logging actually persists. Both are additive — no schema or engine changes."

---

## 9. Things to avoid saying

- **Do not say** "official" or "licensed" about the product — the vocabulary scan will reject those words in any UI source file, and they imply something the project deliberately is not.
- **Do not say** "World Cup" as the product name in interview context. Refer to "the 2026 international tournament" or use the actual product name "Global Football 2026 Predictor."
- **Do not oversell the model.** It's classical statistics done well, not a novel ML system. Frame it as "explainable, deterministic, replayable" rather than "accurate."
- **Do not call the demo data real.** If asked about data, say "the production data layer is the same interface — what's in the deployed demo is mock fixtures so I could ship the architecture without waiting on a provider integration."
- **Do not claim accuracy numbers.** Brier and log-loss scoring infrastructure exists; meaningful accuracy claims will exist after Phase 8 against actual tournament results.

---

## 10. One-line takeaways the interviewer should remember

If they only remember three things from the conversation:

- "The engine is fully isolated from the UI — three layers of enforcement, swap-in for real persistence is a one-file change."
- "Predictions are append-only at both the SQL constraint level and the TypeScript API surface — retries are idempotent by construction."
- "The legal/IP perimeter is enforced by tooling — a vocabulary scan over every UI source file blocks restricted competition marks from the product."
