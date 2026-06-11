# Global Football 2026 Predictor

A full-stack football analytics platform that estimates the probability of every outcome for every match of the 2026 international football tournament — built as a portfolio project that values clarity, statistical honesty, and architectural discipline.

> **Independent analytical project.** Not affiliated with FIFA, any confederation, any federation, any broadcaster, or any commercial collectibles publisher. The product does not use official FIFA or tournament marks, logos, typefaces, mascots, slogans, or trade dress. Predictions are probabilistic estimates produced by a statistical model, not guarantees about real-world outcomes.

> **A note on the repository name.** The directory and git remote use the descriptive working title `world-cup-2026-predictor`. The deployed public UI uses the safer public name above. See [`docs/01_PRODUCT_BRIEF.md`](docs/01_PRODUCT_BRIEF.md) §9 and [`docs/04_DATA_AND_LEGAL_POLICY.md`](docs/04_DATA_AND_LEGAL_POLICY.md) §3.6 for the rationale.

## What it does

- Lists every match of the 2026 international tournament grouped by day, with teams, venue, kickoff, live countdown, and status.
- Produces and stores a complete prediction history for every match:
  - **T-3h** — baseline pre-match prediction
  - **T-1h** — lineup-aware refinement
  - **T-0** — kickoff snapshot
  - **HT** — half-time recalibration
  - **FT** — accuracy review
- Computes outcome probabilities via a transparent statistical engine: Elo-style team ratings, exponentially-decayed recent form, an xG approximation, a Poisson scoreline matrix with a Dixon-Coles low-score correction, and Monte Carlo simulation for tournament-level questions.
- Tracks its own accuracy with Brier score, log-loss, and calibration plots.

## What it deliberately is not

- It is not a betting product. There are no odds, no stake suggestions, no affiliate links.
- It is not a streaming platform. It does not embed or link to unauthorised video.
- It does not reproduce FIFA, confederation, federation, club, broadcaster, sponsor, Panini, or EA Sports artwork, marks, typefaces, or trade dress.
- It does not use restricted competition-mark terms — "FIFA World Cup," "FIFA World Cup 26 / 2026," "World Cup," "Mundial," and equivalent translations — in product branding, page titles, marketing copy, OpenGraph metadata, or repeated layout chrome. Those terms appear only in legal disclaimers and internal documentation per `docs/04_DATA_AND_LEGAL_POLICY.md` §3.6.

See [`docs/04_DATA_AND_LEGAL_POLICY.md`](docs/04_DATA_AND_LEGAL_POLICY.md) for the full policy and [`docs/08_FLAG_AND_VISUAL_ASSET_POLICY.md`](docs/08_FLAG_AND_VISUAL_ASSET_POLICY.md) for the flag-asset handling rules.

## Architecture in one paragraph

The statistical prediction engine is fully isolated from the React UI. Predictions are produced by pure TypeScript modules under `src/lib/model` and `src/lib/simulation`, persisted as append-only rows in PostgreSQL, and only then rendered by Next.js Server Components. Vercel Cron drives the lifecycle (T-3h → FT). The UI never computes a prediction. This is the spine of the project.

```
Vercel Cron → Scheduler → Prediction Engine → Postgres (append-only) → Next.js UI
```

## Tech stack

| Concern        | Choice                          |
|----------------|---------------------------------|
| Framework      | Next.js (App Router)            |
| Language       | TypeScript (strict)             |
| Styling        | Tailwind CSS                    |
| Database       | Supabase / PostgreSQL           |
| Hosting        | Vercel                          |
| Scheduling     | Vercel Cron                     |
| Visualisations | Recharts                        |
| Tests          | Vitest (for the model)          |

## Project status

**Phase 0 — Foundation.** Documentation only. No application code yet. The full phased plan is in [`docs/05_BUILD_ROADMAP.md`](docs/05_BUILD_ROADMAP.md).

The intended source layout, to be populated in Phase 1:

```
src/
  app/                  Next.js routes (Server Components by default)
  components/           Presentational React only
  lib/
    model/              Ratings, form, xG, expected goals, Poisson matrix
    simulation/         Monte Carlo simulators
    data/               Adapters (mock first, then real APIs)
    normalization/      External feeds -> internal canonical types
    scheduler/          Cron handlers and lifecycle dispatch
    types/              Shared domain types
    utils/              Pure helpers (Poisson PMF, RNG, date math)
  mock/                 Static fixtures used in development
supabase/               SQL migrations and RLS policies
docs/                   Architecture and product documentation
```

## Data source status

- **Mode:** mock
- No real sports API integrated yet.
- No copyrighted player images or official marks used.
- No live streams or broadcast links used.

Full policy and attribution rules: [`docs/04_DATA_AND_LEGAL_POLICY.md`](docs/04_DATA_AND_LEGAL_POLICY.md) (see §6.2).

## Documentation

| Document                                                              | Purpose                                            |
|-----------------------------------------------------------------------|----------------------------------------------------|
| [`docs/01_PRODUCT_BRIEF.md`](docs/01_PRODUCT_BRIEF.md)                 | Vision, users, experience, non-goals               |
| [`docs/02_TECHNICAL_ARCHITECTURE.md`](docs/02_TECHNICAL_ARCHITECTURE.md) | Layers, data flow, schema overview, deployment   |
| [`docs/03_MODEL_SPEC.md`](docs/03_MODEL_SPEC.md)                       | Inputs, ratings, xG, Poisson, Monte Carlo, eval    |
| [`docs/04_DATA_AND_LEGAL_POLICY.md`](docs/04_DATA_AND_LEGAL_POLICY.md) | What data and imagery are permitted                |
| [`docs/05_BUILD_ROADMAP.md`](docs/05_BUILD_ROADMAP.md)                 | Phased delivery plan                               |
| [`docs/06_CLAUDE_CODE_RULES.md`](docs/06_CLAUDE_CODE_RULES.md)         | Binding rules for AI-assisted contributions        |
| [`docs/07_DESIGN_SYSTEM.md`](docs/07_DESIGN_SYSTEM.md)                 | Colour, typography, spacing, motion, a11y tokens   |
| [`docs/08_FLAG_AND_VISUAL_ASSET_POLICY.md`](docs/08_FLAG_AND_VISUAL_ASSET_POLICY.md) | Flag asset registry, provenance, wave animation policy |
| [`CLAUDE.md`](CLAUDE.md)                                              | Quick-reference rules for Claude Code              |

## Design principles

1. **Engine first.** The statistical core ships and is tested before the UI is built.
2. **Append-only history.** Earlier predictions are preserved; nothing is overwritten.
3. **Mock-first development.** The whole stack runs against static fixtures before any live API is integrated.
4. **Transparent reasoning.** Every probability shown is traceable to a stored input, a model version, and a documented formula.
5. **Restrained presentation.** Data-journalism aesthetic, not sportsbook aesthetic.

## Licence

To be decided before any public release. The codebase is private until then.
