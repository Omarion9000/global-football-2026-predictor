# 12 — Architecture Diagram

A single-page visual reference for the data and dependency flow across the project's six built phases (0 → 6.1). For deeper context on any subsystem, see the cross-references at the end of each section.

---

## 1. End-to-end flow

```mermaid
flowchart TB
  classDef mock fill:#FFF8E7,stroke:#D6A84F,color:#1C1917
  classDef engine fill:#FFFFFF,stroke:#C2410C,color:#1C1917
  classDef sched fill:#F2E6C9,stroke:#166534,color:#1C1917
  classDef store fill:#F7F3EA,stroke:#78716C,color:#1C1917
  classDef ui fill:#FFFFFF,stroke:#2563EB,color:#1C1917
  classDef ext fill:#FFFFFF,stroke:#78716C,color:#78716C,stroke-dasharray:4 3

  subgraph Future["Phase 7 · real data (not built)"]
    EXT["Licensed sports API<br/>(API-Football / Sportmonks / etc.)"]:::ext
  end

  subgraph Mock["src/mock · static fixtures"]
    M1["teams.ts<br/>8 fictional teams"]:::mock
    M2["fixtures.ts<br/>4 group-stage fixtures"]:::mock
    M3["stats.ts<br/>per-team Elo + form"]:::mock
  end

  subgraph Adapter["src/lib/data · adapter interface"]
    AD1["FixtureSource interface"]:::mock
    AD2["MockFixtureSource"]:::mock
    AD1 -.implements.-> AD2
  end

  subgraph Scheduler["src/lib/scheduler · Phase 5"]
    CR["/api/cron/predictions<br/>(Vercel Cron, Bearer-auth)"]:::sched
    DR["getDuePredictionRuns<br/>(idempotent by scheduled_for)"]:::sched
    EX["executePredictionRun<br/>(deterministic seed)"]:::sched
    CR --> DR --> EX
  end

  subgraph Engine["src/lib/model + simulation · Phase 3"]
    PM["predictMatch · pure TS"]:::engine
    TS["teamStrength"]:::engine
    EG["expectedGoals"]:::engine
    SC["scorelines<br/>(Poisson + Dixon-Coles)"]:::engine
    CF["confidence"]:::engine
    MC["monteCarlo · seeded RNG"]:::engine
    PM --> TS & EG & SC & CF
    PM --> MC
  end

  subgraph Persistence["src/lib/data/persistence · Phase 4"]
    P1[("prediction_runs<br/>append-only")]:::store
    P2[("prediction_scorelines")]:::store
    P3[("data_snapshots")]:::store
    P4[("model_runs<br/>typed placeholder")]:::store
  end

  subgraph Demo["src/lib/data/demoPredictions.ts · Phase 6"]
    DM["server-side helper<br/>runs predictMatch at module load<br/>freezes PredictionRunRow[]"]:::mock
  end

  subgraph UI["src/app + src/components · Phase 6 / 6.1"]
    HM["app/page.tsx<br/>home + featured panel"]:::ui
    MD["app/matches/[fixtureId]/page.tsx<br/>match center"]:::ui
    CP["components/<br/>MatchCard · ProbabilityBar · ScorelineTable<br/>PredictionTimeline · WavingFlag · Disclosure"]:::ui
  end

  EXT -. Phase 7 .-> AD1
  M1 --> AD2
  M2 --> AD2
  M3 --> AD2
  AD2 --> EX
  EX -->|inputs| PM
  PM -->|PredictionOutput| EX
  EX -->|insert| P1
  EX -->|insert| P2
  EX -->|insert| P3
  EX -.future writer.-> P4

  AD2 --> DM
  PM -->|module-load demo only| DM
  DM -->|PredictionRunRow shape| HM
  DM -->|PredictionRunRow shape| MD
  HM --> CP
  MD --> CP
```

The diagram colour-codes each subsystem to the warm tournament palette (`docs/07` §2):

- **gold-bordered cards** — mock data and the demo read model
- **red-bordered cards** — the prediction engine
- **green-bordered cards** — the scheduler
- **grey-bordered cards** — persistence
- **blue-bordered cards** — UI
- **dashed grey** — future Phase 7 real data, not built

---

## 2. Where the data goes in production

In the deployed Vercel build today, the cron route fires every 5 minutes and the demo helper runs at module load:

```mermaid
sequenceDiagram
  participant Vercel as Vercel Cron
  participant Route as /api/cron/predictions
  participant Sched as scheduler.runScheduler
  participant Eng as predictMatch
  participant Repo as InMemoryPredictionRepository
  participant Demo as demoPredictions (server)
  participant Page as Next.js page

  Vercel->>Route: GET (Bearer CRON_SECRET)
  Route->>Sched: now, mockFixtures, modelVersion
  loop for each due (fixture, run_type)
    Sched->>Eng: PredictionInput
    Eng-->>Sched: PredictionOutput (deterministic)
    Sched->>Repo: insertPredictionRun + insertScorelines
  end
  Route-->>Vercel: { due, succeeded, skipped, failed, warnings }

  Note over Demo: at module load (server-only)
  Demo->>Eng: predictMatch × mockFixtures × 3 run types
  Eng-->>Demo: frozen PredictionRunRow[]
  Page->>Demo: getDemoFixtures / getDemoMostRecentPrediction
  Demo-->>Page: ready-to-render rows
  Page-->>Page: renders to HTML, no engine import in components
```

Two important notes about the current state:

1. **The cron route writes to in-memory repositories**, not to Supabase. Phase 5 deliberately stops at the in-memory implementation; the same `PredictionRepository` interface will be satisfied by a Supabase-backed implementation in a follow-up phase without touching scheduler, engine, or UI code.
2. **The demo helper is what the deployed UI reads from.** It runs the real engine, persists into ready-shaped DB rows, freezes them at module load, and exposes typed getters. UI components never see `predictMatch` directly.

---

## 3. Why the UI does not calculate predictions

This is the spine of the architecture. Three independent enforcement layers protect it:

1. **The ESLint UI boundary.** `src/components/**` is forbidden from importing `@/lib/model`, `@/lib/simulation`, `@/lib/normalization`, `@/lib/utils/rng`, or `@/lib/utils/poisson`. Hitting any of those imports fails `pnpm lint` and CI.
2. **The runtime boundary test.** `src/components/__tests__/ui-boundaries.test.ts` reads every `.tsx` file in `src/components/` and asserts no forbidden import pattern is present. Backstop for anything the lint rule misses.
3. **The data shape.** UI components only consume `PredictionRunRow` and `PredictionScorelineRow` — the snake_case DB row shapes from `src/lib/data/persistence/types.ts`. Whether the row was produced by the demo helper or by a future Supabase read, the component contract is identical.

The pay-off is that swapping the data layer (demo → Supabase, mock → live provider) is a one-file change. The UI keeps working unchanged.

---

## 4. Why predictions are append-only

Every prediction run inserts a new row. Updates are forbidden at every layer:

- **DB constraint.** `prediction_runs` carries `UNIQUE (fixture_id, run_type, model_version, scheduled_for)`. Re-running the scheduler at the same lifecycle timestamp collides on this key and is dropped. `UPDATE prediction_runs …` is a code-review reject.
- **TypeScript API.** `PredictionRepository` exposes `insertPredictionRun`, `getPredictionRunById`, `getLatestPredictionForFixture`, `listPredictionHistoryForFixture` — and no `update*` / `patch*` / `delete*` methods. The `InMemoryPredictionRepository` mirrors the same key collision via `DuplicatePredictionRunError`.
- **Scheduler return type.** When the scheduler tries to insert a duplicate, it catches `DuplicatePredictionRunError` and returns `{ status: 'SKIPPED' }`. The earlier row is preserved untouched.

The pay-off is that every match accumulates a complete `T_MINUS_3H → T_MINUS_1H → T_ZERO → HT → FT` history that can be replayed, compared across `model_version` bumps, and evaluated against the actual result via `accuracy_reviews`.

---

## 5. The five-stage prediction lifecycle

```mermaid
gantt
  title  Prediction lifecycle for a single fixture
  dateFormat HH:mm
  axisFormat %H:%M
  section T−3h
    Baseline run :crit, t3, 17:00, 5m
  section T−1h
    Lineup-aware run :crit, t1, 19:00, 5m
  section Kickoff
    T_ZERO snapshot :crit, t0, 20:00, 5m
  section Half-time
    HT recalibration :ht, 20:45, 5m
  section Full-time
    FT accuracy review :ft, 21:50, 5m
```

| Stage         | Trigger                       | What the engine receives                              | What the row carries                               |
|---------------|-------------------------------|-------------------------------------------------------|----------------------------------------------------|
| `T_MINUS_3H`  | kickoff − 3 h                  | ratings, form, context                                | full `PredictionOutput`                            |
| `T_MINUS_1H`  | kickoff − 1 h                  | + lineup if available                                 | full `PredictionOutput` + lineup warning if missing |
| `T_ZERO`      | kickoff                        | best available lineup data                            | final pre-match snapshot                           |
| `HT`          | half-time (gated by status)    | + in-play state                                       | in-play-recalibrated output                        |
| `FT`          | full-time (gated by status)    | observed final score                                  | accuracy-review row                                |

Anchors are deterministic UTC offsets (`scheduler/scheduleWindows.ts`). HT and FT also require `fixture.status === 'HALF_TIME' | 'FULL_TIME'`, so they don't trip on a clock alone.

---

## 6. Module isolation map

```mermaid
flowchart LR
  classDef pure fill:#FFF8E7,stroke:#D6A84F,color:#1C1917
  classDef data fill:#F2E6C9,stroke:#166534,color:#1C1917
  classDef ui fill:#FFFFFF,stroke:#2563EB,color:#1C1917
  classDef forbidden stroke:#DC2626,stroke-width:2px

  UTILS["src/lib/utils<br/>rng · poisson · math · format · warnings"]:::pure
  TYPES["src/lib/types"]:::pure
  MODEL["src/lib/model"]:::pure
  SIM["src/lib/simulation"]:::pure
  NORM["src/lib/normalization"]:::pure
  SCHED["src/lib/scheduler"]:::data
  DATA["src/lib/data"]:::data
  COMP["src/components"]:::ui
  APP["src/app"]:::ui

  TYPES --> MODEL & SIM & NORM & SCHED & DATA & COMP & APP
  UTILS --> MODEL & SIM & NORM & SCHED
  UTILS -. UI-safe helpers only<br/>(format, warnings) .-> COMP
  MODEL --> SIM
  MODEL --> SCHED
  DATA --> SCHED
  DATA --> APP
  COMP --> APP

  COMP -.->|FORBIDDEN<br/>blocked by ESLint| MODEL
  COMP -.->|FORBIDDEN<br/>blocked by ESLint| SIM
  COMP -.->|FORBIDDEN<br/>blocked by ESLint| NORM
  COMP -.->|FORBIDDEN<br/>blocked by ESLint| UTILS
```

The dashed red arrows are import paths the lint rule and the runtime boundary test both block. The only `src/lib/utils` exports a component may consume are the UI-safe helpers in `format.ts` and `warnings.ts` — the math helpers (`rng.ts`, `poisson.ts`) are specifically named in the deny list.

---

## 7. Where to read more

- Engine internals → `docs/03_MODEL_SPEC.md`
- Schema and migrations → `docs/02_TECHNICAL_ARCHITECTURE.md` §6 + `supabase/migrations/0001_init.sql`
- Append-only and idempotency rules → `CLAUDE.md` rule 5 + `docs/06_CLAUDE_CODE_RULES.md` §2
- Engine isolation contract → `docs/06_CLAUDE_CODE_RULES.md` §0/§1
- Design tokens → `docs/07_DESIGN_SYSTEM.md`
- Flag asset registry + wave animation → `docs/08_FLAG_AND_VISUAL_ASSET_POLICY.md`
