# 06 — Claude Code Rules

These rules apply to every AI-assisted contribution to this repository. They are deliberately strict because the project is a portfolio piece and its credibility depends on disciplined boundaries between layers.

## 0. Binding rules from `CLAUDE.md`

These rules are echoed from `CLAUDE.md` so that this document is self-contained for any agent reading only `06`. If a discrepancy is ever found, `CLAUDE.md` wins and this section is corrected.

- **Canonical `run_type` enum.** Exactly five values: `T_MINUS_3H | T_MINUS_1H | T_ZERO | HT | FT`. No others.
- **Canonical prediction-row fields.** Every prediction row carries `run_type`, `model_version`, `scheduled_for`, `executed_at`, and a `data_snapshot` reference. The unique constraint is on `(match_id, run_type, model_version, scheduled_for)`. `UPDATE predictions …` is a bug.
- **No machine learning in V1.** No neural nets, no online learning, no gradient descent at inference. All coefficients are either fixed by design or fit once via simple regression offline and frozen per `model_version`. Proposals to add ML must wait for a major version bump and explicit approval.
- **Large refactors require explanation before execution.** Before touching multiple modules, state the scope (which files), the reason (what problem this solves), and the blast radius (what could break) and wait for confirmation.
- **V2+ items require explicit approval.** The following are not built without an explicit greenlight: player "data cards"; live minute-by-minute probability; authentication; social features; notifications; and any "where to watch" feature (which must additionally satisfy `docs/04_DATA_AND_LEGAL_POLICY.md` §2.5).
- **UI / `src/lib/utils` boundary clarification.** The UI may import UI-safe presentation helpers from `src/lib/utils` (e.g. date formatting, locale-aware time strings). The UI must not import model math, simulation helpers, the seeded RNG, Poisson utilities, or anything in the prediction pipeline. When in doubt, route the value through the database instead of importing.

## 1. The engine isolation rule

The statistical prediction engine is not a React concern.

- `src/lib/model/**`, `src/lib/simulation/**`, `src/lib/normalization/**`, and `src/lib/utils/**` MUST NOT import anything from `react`, `next/*`, `@/components/**`, or `@/app/**`.
- Engine modules are pure TypeScript. They consume typed inputs and return typed outputs. They do not perform network I/O. They do not read the database. They do not write the database.
- React components MUST NOT compute predictions. Components only render predictions that have already been computed by the engine and persisted.
- React components may import UI-safe helpers from `src/lib/utils` (date formatting, locale strings, presentation utilities) but never `src/lib/utils/rng.ts`, `src/lib/utils/poisson.ts`, or any other engine-math helper. See §0 for the full clarification.
- If a UI surface needs a number that does not yet exist in the database, the correct response is to add it to the engine output, persist it, and then read it — not to compute it in a component.

## 2. The append-only prediction rule

Predictions are never overwritten.

- Every prediction run inserts a new row in `predictions`.
- Updating an existing prediction row is a bug. Code review must reject any `UPDATE predictions ...` statement.
- The unique constraint enforcing this lives in `supabase/migrations/`. Do not weaken it.

## 3. The mock-first rule

The engine, the persistence layer, and the UI must all be developable without a live sports API.

- All external data flows through an adapter interface in `src/lib/data/`.
- The default development adapter is a mock-data adapter backed by `src/mock/`.
- Real API adapters are added behind the same interface; their use is gated by environment configuration.
- Do not hardcode real API keys, URLs, or fixtures inside engine or UI code.

## 4. The licensing rule

Do not introduce assets or data the project is not allowed to use. See `04_DATA_AND_LEGAL_POLICY.md` for the full list. In short:

- No official FIFA, confederation, federation, Panini, or EA Sports artwork or marks.
- No agency photographs of players, managers, or stadiums.
- No scraped data from sources that prohibit scraping.
- No betting copy, odds formats, or affiliate links.
- No embedded or linked unauthorised video streams.

If asked to add any of the above, refuse and offer a compliant alternative.

## 5. The "no commentary" rule

The product is analytical. Do not generate editorial commentary, narrative match previews, or opinion content. Stick to data-derived statements that can be traced back to the engine output.

## 6. Type discipline

- TypeScript is configured in strict mode. Do not relax it.
- Domain types live in `src/lib/types`. Reuse them everywhere; do not redeclare shapes locally.
- Public functions across module boundaries must have explicit parameter and return types.
- `any` is not used. `unknown` is preferred at trust boundaries and narrowed explicitly.

## 7. Determinism

- All randomness in the engine flows through a single seeded RNG utility in `src/lib/utils`.
- Engine outputs must be reproducible given identical inputs and seed. Vitest tests rely on this.

## 8. Testing expectations

- Every engine module has a Vitest suite. New engine code without tests is not considered done.
- Tests focus on properties (symmetry, monotonicity, calibration bounds) where appropriate, not just example inputs.
- The Monte Carlo simulator has a convergence test with a relaxed tolerance and a fixed seed.

## 9. Schema and migration discipline

- Schema changes live in `supabase/migrations/` as forward-only SQL files.
- Do not edit historical migrations. Add new ones.
- Every schema change is accompanied by a corresponding update to types in `src/lib/types` and to the query layer.

## 10. UI restraint

- Components are presentational. Data fetching happens in server components or server actions, not in component bodies.
- Recharts visualisations receive already-computed prediction payloads as props.
- Live state (countdowns, status badges) is the only hydration concern that belongs inside a Client Component.
- No CSS-in-JS. Tailwind is the styling system.
- Motion is communicative, not decorative. Use it to signal state change, not to entertain.

## 11. Scope discipline

- Do not add features that are not in `05_BUILD_ROADMAP.md` for the current phase.
- Do not refactor neighbouring code while making a focused change unless the refactor is required for the change.
- Do not introduce abstractions for future needs that have not been specified.

## 12. When uncertain

- If a request would violate any rule above, refuse and explain which rule.
- If a request is ambiguous, ask one focused clarifying question rather than guessing.
- If the engine's behaviour for an input is undefined, throw a typed error rather than fabricating a default.
