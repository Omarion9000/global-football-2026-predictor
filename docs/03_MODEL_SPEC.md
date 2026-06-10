# 03 — Model Specification

This document defines the V1 statistical model for World Cup 2026 Predictor in enough detail to implement it directly in TypeScript. It is the source of truth for the engine modules under `src/lib/model` and `src/lib/simulation`. It is binding alongside `CLAUDE.md`.

All formulas here are deliberately classical statistics: rating updates, Poisson scorelines, Monte Carlo simulation. There is no machine learning in V1. All randomness flows through one seeded RNG. There are no network or database calls in the engine.

---

## 1. Model philosophy

1. **The model is probabilistic, not deterministic about outcomes.** Every prediction is a distribution. The headline numbers (`pHome`, `pDraw`, `pAway`) are point estimates of probabilities, not predictions of certainty.
2. **The model is honest about its uncertainty.** A separate `confidence` score (§9) accompanies every prediction so the UI can show when the model is on firm ground and when it is guessing.
3. **The model is deterministic in execution.** Given identical inputs and an identical `rngSeed`, the engine produces byte-identical output. This is testable and enforced by a Phase 3 determinism test.
4. **The model is transparent.** Every probability is traceable to a documented formula, a frozen set of weights, and a stored `data_snapshot` reference. No black boxes.
5. **The model is replaceable in parts.** Ratings, form, expected-goals derivation, and the scoreline model are independent modules with typed contracts so one can be improved without rewriting the others.

The model produces, for each match and each `run_type`:

- `pHome`, `pDraw`, `pAway` — probabilities over 90-minute outcomes.
- `scorelineMatrix` — probability of `(homeGoals, awayGoals)` for `i, j ∈ [0, 6]` plus a residual bucket.
- `topScorelines` — the five most likely scorelines with their probabilities.
- `xgHome`, `xgAway` — expected goals over the full 90 minutes (or remaining minutes, at HT).
- `meanGoals` — `xgHome + xgAway`.
- `confidence` — value in `[0, 1]` (§9).
- For knockout matches at `T_ZERO`: `pHomeAfterET`, `pAwayAfterET`, `pHomeAfterPens` derived from the 90-minute distribution and a calibrated penalty-shootout prior.
- `warnings: string[]` — engine-emitted advisory messages (e.g. Monte Carlo / analytic disagreement, low-information inputs). The engine never logs; the scheduler is responsible for writing these to `model_runs`.

---

## 2. Inputs (V1)

All engine inputs are carried in a single typed object so the contract between scheduler and engine is explicit:

```ts
type PredictionInput = {
  match: {
    id: string;
    homeTeamId: string;        // "home" = listed-first team at neutral venues
    awayTeamId: string;
    kickoffUtc: string;        // ISO-8601
    stage: 'GROUP' | 'R16' | 'QF' | 'SF' | 'F' | 'THIRD_PLACE';
    isNeutralVenue: boolean;
    venueCountryCode: string;  // for host-nation adjustment
  };
  ratings: { home: TeamRating; away: TeamRating };          // Elo-style, see §3
  form:    { home: FormSummary; away: FormSummary };        // recent N, see §3
  context: {
    restDaysHome: number;
    restDaysAway: number;
    travelKmHome: number;
    travelKmAway: number;
    altitudeMeters: number;
  };
  availability?: {
    homeMissingKeyPlayers: number; // injuries + suspensions, placeholder count
    awayMissingKeyPlayers: number;
  };
  lineup?: { home: LineupStrength; away: LineupStrength };  // T_MINUS_1H+
  inPlay?: InPlayState;                                     // HT only, see §8
  runType: 'T_MINUS_3H' | 'T_MINUS_1H' | 'T_ZERO' | 'HT' | 'FT';
  modelVersion: string;        // e.g. "v1.0.0"
  rngSeed: number;
};
```

Required inputs by `run_type`:

| `run_type`   | Requires                                                |
|--------------|---------------------------------------------------------|
| `T_MINUS_3H` | match, ratings, form, context                           |
| `T_MINUS_1H` | as above + `lineup`                                     |
| `T_ZERO`     | as above (best available lineup data)                   |
| `HT`         | as above + `inPlay`                                     |
| `FT`         | as above + final score for evaluation, no new prediction|

If a required field is missing, the engine throws a typed error (`MissingInputError`). The scheduler decides whether to fall back to the previous `run_type`'s prediction.

`availability` is optional in V1; when absent, its contribution to `confidence` (§9) is treated as neutral.

---

## 3. Team strength score

Team strength is summarised as a single rating `R` per team, maintained Elo-style, plus a `FormSummary` that captures short-horizon momentum.

### 3.1 Base Elo rating

- Starting rating: `1500`.
- Pre-match expected score for home vs away:
  ```
  E_home = 1 / (1 + 10 ^ ((R_away - R_home + H) / 400))
  E_away = 1 - E_home
  ```
  where `H` is the home-advantage offset in rating points (§3.4).
- Post-match update:
  ```
  R'_home = R_home + K * G * (S_home - E_home)
  R'_away = R_away + K * G * (S_away - E_away)
  ```
  with `S = 1` for win, `0.5` for draw, `0` for loss; `G` is the goal-difference multiplier:
  ```
  gd = |goalsHome - goalsAway|
  G  = log(gd + 1) * (2.2 / (abs(R_home - R_away) * 0.001 + 2.2))
  G  = clamp(G, 1.0, 3.0)
  ```
- `K` scales with match importance:

  | Stage / context                       | `K` |
  |---------------------------------------|-----|
  | Friendly                              | 20  |
  | Qualifier                             | 30  |
  | Major-tournament group stage          | 40  |
  | Major-tournament knockout             | 50  |
  | World Cup final                       | 60  |

Ratings are recomputed offline from licensed historical international results (per `docs/04_DATA_AND_LEGAL_POLICY.md`) and then maintained incrementally. The engine itself only consumes the current rating; it does not mutate it during a prediction.

### 3.2 Recent form summary

`FormSummary` summarises the last `N = 10` competitive matches (configurable per `model_version`) with exponential time decay:

```
weight_i = exp(-lambda * daysSince_i)        // lambda = ln(2) / 365 (one-year half life)
pointsPerGame = Σ(weight_i * points_i) / Σ(weight_i)
gfPerGame     = Σ(weight_i * goalsFor_i)    / Σ(weight_i)
gaPerGame     = Σ(weight_i * goalsAgainst_i)/ Σ(weight_i)
oppRatingMean = Σ(weight_i * R_opp_i)       / Σ(weight_i)
```

`FormSummary` stores `pointsPerGame`, `gfPerGame`, `gaPerGame`, and `oppRatingMean`. The last value lets later steps adjust raw goal averages for the quality of opposition faced.

### 3.3 Composite team strength score

For weighting purposes inside the engine, a composite team strength score `TSS` is derived per team:

```
TSS = w1 * normalizedRating
    + w2 * normalizedForm
    + w3 * normalizedAttack
    + w4 * normalizedDefence
    + w5 * normalizedAvailability
```

Default V1 weights (frozen per `model_version`, fitted on historical international data):

| Weight | Component             | Value |
|--------|-----------------------|-------|
| `w1`   | Elo rating            | 0.45  |
| `w2`   | Recent form           | 0.20  |
| `w3`   | Attack (gfPerGame)    | 0.15  |
| `w4`   | Defence (1 - gaPerGame_norm) | 0.15 |
| `w5`   | Availability          | 0.05  |

Normalisation maps each component into approximately `[0, 1]` using cohort statistics across all international teams in the current `model_version` snapshot. `TSS` itself is not used to produce probabilities directly; it is an explainable summary that feeds the attack/defence factors in §4 and the `confidence` score in §9.

### 3.4 Venue / host adjustment

`H` (home-advantage rating offset) is set as:

```
H = 0                          // standard neutral-venue World Cup match
H = 35                         // small adjustment for the three host nations
                               //  (USA, Mexico, Canada) playing at home
H -= travelPenalty(opponent)   // up to 10 rating points for long-haul travel
```

The full venue adjustment also includes `restDays` and `altitude` multipliers applied later in §4.

---

## 4. Expected goals approximation

Without licensed shot-level xG, the engine approximates xG from counting stats and then derives a match-level expected-goals figure.

### 4.1 Per-team xG approximation (offline, frozen)

For each historical match, an approximate xG is computed per team from a linear combination of public counting stats:

```
xgApprox = c0
         + c1 * shotsOnTarget
         + c2 * totalShots
         + c3 * bigChances           // 0 when not available
         + c4 * finalThirdEntries    // 0 when not available
```

Coefficients `c0..c4` are fit once via simple least-squares regression against actual goals on a held-out historical sample, then frozen per `model_version`. The result feeds `FormSummary.gfPerGame` and `gaPerGame` (which become time-decayed averages of `xgApprox` rather than raw goals when shot data is available).

### 4.2 Match-level expected goals

For a specific fixture, the engine computes:

```
attack(team)   = (normalizedRating(team) * α1) + (xgFor(team)  * α2)
defence(team)  = (normalizedRating(team) * β1) + (1 / (xgAgainst(team) + ε)) * β2
```

with defaults `α1 = 0.6, α2 = 0.4, β1 = 0.5, β2 = 0.5` per `v1.0.0`. Both factors are then normalised so that an average international team has `attack ≈ defence ≈ 1.0`.

Match xG is:

```
base = baseGoalsPerSide     // V1 default: 1.30, fitted on international matches
hAdv = homeAdvantageFactor  // 1.00 neutral, 1.10 for host nation
ctxH = restMultiplier(restDaysHome) * travelMultiplier(travelKmHome) * altitudeMultiplier(altitudeMeters)
ctxA = restMultiplier(restDaysAway) * travelMultiplier(travelKmAway) * altitudeMultiplier(altitudeMeters)

xgHome = base * attack(home) * (1 / defence(away)) * hAdv         * ctxH
xgAway = base * attack(away) * (1 / defence(home)) * (1 / hAdv)   * ctxA
```

Multipliers (V1 defaults):

| Function              | Formula                                                  |
|-----------------------|----------------------------------------------------------|
| `restMultiplier(d)`   | `clamp(0.95 + 0.01 * (d - 3), 0.92, 1.05)`               |
| `travelMultiplier(k)` | `clamp(1.00 - 0.00001 * k, 0.95, 1.00)`                  |
| `altitudeMultiplier(m)` | `clamp(1.00 - 0.00004 * max(0, m - 1500), 0.94, 1.00)` |

Both `xgHome` and `xgAway` are clamped to `[0.1, 5.0]` to avoid pathological inputs producing degenerate scoreline matrices.

### 4.3 Lineup adjustment (T_MINUS_1H and later)

When `lineup` is present, the engine scales `attack` and `defence` by the announced XI's relative strength versus the team's typical XI:

```
attack(home)  *= lineupAttackFactor(lineup.home)
defence(home) *= lineupDefenceFactor(lineup.home)
attack(away)  *= lineupAttackFactor(lineup.away)
defence(away) *= lineupDefenceFactor(lineup.away)
```

Lineup factors are computed from a frozen player-quality table (per `model_version`) capturing each player's offensive and defensive contribution relative to their team baseline. Both factors are bounded to `[0.85, 1.15]`.

### 4.4 Availability adjustment

When `availability` is present:

```
attack(team)  *= (1 - 0.04 * missingKeyAttackers(team))
defence(team) *= (1 - 0.04 * missingKeyDefenders(team))
```

with the missing-player counts derived from the announced or implied availability set. Each multiplier is clamped to `[0.80, 1.00]`.

---

## 5. Poisson scoreline model

Given `xgHome` and `xgAway`, the engine treats home and away goals as independent Poisson random variables and computes the full scoreline matrix.

### 5.1 Independent Poisson (V1 default)

For each `(i, j)` with `i, j ∈ [0, 6]`:

```
P(homeGoals = i) = e^(-xgHome) * xgHome^i / i!
P(awayGoals = j) = e^(-xgAway) * xgAway^j / j!
P(i, j)          = P(homeGoals = i) * P(awayGoals = j)
```

A residual `(7+, *)` and `(*, 7+)` bucket is added so the matrix sums to 1.0 exactly (or within `1e-9` tolerance). Marginals give the headline probabilities:

```
pHome = Σ_{i > j} P(i, j)
pDraw = Σ_{i = j} P(i, j)
pAway = Σ_{i < j} P(i, j)
```

`topScorelines` is the five highest-probability `(i, j)` cells from the bounded matrix.

### 5.2 Dixon–Coles low-score correction (advanced, optional)

For improved calibration at low scores, the joint probability is multiplied by a correction `τ(i, j; xgHome, xgAway, ρ)`:

```
τ(0, 0) = 1 - xgHome * xgAway * ρ
τ(0, 1) = 1 + xgHome * ρ
τ(1, 0) = 1 + xgAway * ρ
τ(1, 1) = 1 - ρ
τ(i, j) = 1                    otherwise
```

with `ρ` (typically in `[-0.2, 0.0]`) calibrated offline per `model_version`. After applying `τ`, the matrix is renormalised so probabilities sum to 1.0.

The Dixon–Coles correction is implementable in TypeScript as a small lookup. V1 ships with `ρ = 0` (i.e. independent Poisson). Calibration of `ρ` is a follow-up task once we have enough World Cup matches to evaluate against.

### 5.3 Extra time and penalties (knockouts at T_ZERO)

For knockout matches, the engine derives:

```
pHomeAfterET  = pHome + pDraw * pHomeWinsET
pAwayAfterET  = pAway + pDraw * (1 - pHomeWinsET)
pHomeWinsET   = 0.5 + κ * (xgHome - xgAway)      // κ = 0.10 in V1
pHomeAfterPens = pHomeAfterET + (1 - pHomeAfterET - pAwayAfterET) * pPenaltyHome
pPenaltyHome   = 0.5 + ξ * (normalizedRating(home) - normalizedRating(away))   // ξ = 0.05
```

All derived probabilities are clamped to `[0.01, 0.99]`. `κ` and `ξ` are frozen per `model_version`.

---

## 6. Monte Carlo simulation

For tournament-level questions and for stability checks on close matches, the engine runs a seeded Monte Carlo simulation.

### 6.1 Match simulator

```
function simulateMatch(input, rng):
  draw homeGoals ~ Poisson(xgHome)
  draw awayGoals ~ Poisson(xgAway)
  if knockout and draw:
    resolve via extra-time and penalties using pHomeAfterET, pHomeAfterPens
  return { homeGoals, awayGoals, winner }
```

Poisson sampling is implemented via Knuth's inversion algorithm or sum of exponentials; either is acceptable as long as the seeded `rng` is the sole randomness source.

### 6.2 Tournament simulator

```
function simulateTournament(fixtures, ratings, rng, N = 10_000):
  counts = empty aggregator
  repeat N times:
    for each fixture in chronological order:
      input = buildPredictionInput(fixture, currentRatings)
      result = simulateMatch(input, rng)
      counts[fixture.id][result] += 1
      currentRatings = applyEloUpdate(currentRatings, fixture, result)
    accumulate tournament-level events (advancement, champion)
  return aggregated probabilities
```

V1 default: `N = 10_000`. The simulator must be reproducible: same inputs + same seed = same aggregated counts (verified by a Phase 3 test).

### 6.3 Derived quantities for a single match

For a single fixture's match-card display, Monte Carlo is also used to confirm:

- `pHome`, `pDraw`, `pAway` — must match the analytic marginals within `±0.5%` (sanity check).
- `top5Scorelines` — the five most frequent `(i, j)` pairs and their relative frequencies.
- `meanGoals` — empirical average of `homeGoals + awayGoals` across simulations.

If the simulator disagrees with the analytic marginals by more than `0.5%` with `N = 10_000`, the engine returns a warning in `PredictionOutput.warnings` and the scheduler logs it; the analytic values are preferred for headline probabilities, and the simulator remains the source of truth for tournament-level rollups only.

---

## 7. Prediction run types

The engine recognises exactly five values for `run_type`. These match `CLAUDE.md`:

| `run_type`     | Trigger             | Inputs added vs previous           | Purpose                                       |
|----------------|---------------------|------------------------------------|-----------------------------------------------|
| `T_MINUS_3H`   | kickoff − 3 h        | none beyond base inputs           | Baseline pre-match prediction                 |
| `T_MINUS_1H`   | kickoff − 1 h        | `lineup`                          | Lineup-aware refinement                       |
| `T_ZERO`       | kickoff              | best available lineup data        | Final pre-match snapshot                      |
| `HT`           | half-time            | `inPlay`                          | In-play recalibration (§8)                    |
| `FT`           | full-time            | observed final score              | Accuracy review only; no new probabilities    |

Every prediction row stores:

- `run_type`
- `model_version`
- `scheduled_for` (canonical lifecycle timestamp derived from kickoff)
- `executed_at`
- `data_snapshot` reference (the inputs used)

These fields and their constraints come from `CLAUDE.md` and are enforced at the database level in Phase 4.

---

## 8. Half-time model

At HT the engine produces a new prediction conditioned on the observed first-half state.

### 8.1 `InPlayState` shape

```ts
type InPlayState = {
  minute: number;                  // 45..48 for HT
  homeGoals: number;
  awayGoals: number;
  homeRedCards: number;
  awayRedCards: number;
  homeShots: number;
  awayShots: number;
  homeShotsOnTarget: number;
  awayShotsOnTarget: number;
  homePossession: number;          // 0..1
  awayPossession: number;          // 1 - homePossession
  homeSubstitutionsUsed: number;   // placeholder, not used in V1 weights
  awaySubstitutionsUsed: number;
};
```

### 8.2 Remaining-time expected goals

For the remaining 45 minutes, the engine starts from the pre-match per-minute rate and adjusts by observed in-play efficiency:

```
preMatchRateHome = xgHomePreMatch / 90
preMatchRateAway = xgAwayPreMatch / 90

observedRateHome = (0.6 * preMatchRateHome) + (0.4 * inPlayXgHome / minute)
observedRateAway = (0.6 * preMatchRateAway) + (0.4 * inPlayXgAway / minute)

inPlayXgHome = γ1 * homeShotsOnTarget + γ2 * (homeShots - homeShotsOnTarget)
inPlayXgAway = γ1 * awayShotsOnTarget + γ2 * (awayShots - awayShotsOnTarget)
```

with `γ1 = 0.33, γ2 = 0.06` in V1 (frozen per `model_version`). These reproduce typical xG-per-shot averages closely enough for an approximation.

### 8.3 Red-card adjustment

For each red card outstanding (one team down to 10), multiply the offending side's remaining-time rate by `0.85` and the opposition's rate by `1.10`. Two red cards stack multiplicatively.

### 8.4 Remaining-time scoreline distribution

```
xgHomeRemaining = observedRateHome * remainingMinutes * redCardAdj_home
xgAwayRemaining = observedRateAway * remainingMinutes * redCardAdj_away
```

Build a Poisson matrix for the remaining minutes per §5 with these rates, then convolve with the known first-half scoreline to get the final-score distribution. Headline probabilities are the marginals of that convolution.

### 8.5 Possession as a sanity input

Possession is used as a small confidence input in V1 (§9), not as a direct multiplier on `xg`. Substitutions are tracked but unused in V1; the field is reserved for V2.

---

## 9. Confidence score

`confidence ∈ [0, 1]` accompanies every prediction. It is a quality-of-information signal, not a calibration of the probabilities themselves.

```
confidence = clamp(
    baseConfidence
  + cData   * dataQualityScore
  - cGap    * abs(pHome - pAway)            // a polarised prediction is "confident" only if data backs it
  + cGap    * 0.5                            // counterweight so a 50/30/20 split isn't penalised
  - cLineup * lineupUncertainty
  - cVol    * volatilityScore,
  0, 1
)
```

V1 default coefficients (frozen per `model_version`):

| Coefficient | Default |
|-------------|---------|
| `baseConfidence` | 0.55 |
| `cData`     | 0.20 |
| `cGap`      | 0.15 |
| `cLineup`   | 0.20 |
| `cVol`      | 0.15 |

Component definitions:

- `dataQualityScore` — fraction of optional inputs present (lineup, in-play, availability, recent-form sample size ≥ 5), in `[0, 1]`.
- `lineupUncertainty` — `1.0` before `T_MINUS_1H`; `0.4` at `T_MINUS_1H` if lineups partial; `0.0` once full lineups known.
- `volatilityScore` — composite of `recentFormVariance(home) + recentFormVariance(away) + abs(restDaysHome - restDaysAway) / 7`, normalised to `[0, 1]`.

`confidence` is rendered in the UI as a discrete band (low / medium / high) to avoid implying false precision.

---

## 10. Accuracy tracking

At FT the engine writes an `accuracy_reviews` row evaluating the most recent prediction at each prior `run_type` against the observed result.

| Metric                       | Definition                                                                                                            |
|------------------------------|-----------------------------------------------------------------------------------------------------------------------|
| `winnerCorrect`              | 1 if the predicted top-1 outcome (`argmax(pHome, pDraw, pAway)`) matches the actual outcome, else 0.                  |
| `scorelineExactCorrect`      | 1 if the top-1 most likely scoreline equals the actual scoreline, else 0.                                              |
| `goalDifferenceCorrect`      | 1 if the signed goal difference of the top-1 scoreline matches the actual, else 0.                                     |
| `brierScore`                 | `Σ_k (p_k - y_k)^2` over `k ∈ {home, draw, away}`, with `y_k ∈ {0, 1}` the one-hot actual outcome.                     |
| `logLoss`                    | `-log(p_actual)`, with `p_actual` clamped to `[1e-6, 1 - 1e-6]`.                                                       |
| `calibrationBucket`          | The decile of `pHome` (or `p_actual`) the prediction falls in, used for aggregate calibration plots.                  |
| `topScorelineProbability`    | The probability the model assigned to its top-1 scoreline — to compare confidence vs hit rate.                         |

Brier and log-loss are stored in V1; calibration plots and reliability diagrams are computed offline from the persisted rows in Phase 8. The schema does not need new columns later for those derived charts.

---

## 11. Model versioning

Every prediction row stores `model_version`. Versioning is semantic with strict rules:

- **Patch (`v1.0.0 → v1.0.1`).** Bug fixes that do not change outputs for any input. Verified by replaying the deterministic test fixtures and asserting byte-identical outputs.
- **Minor (`v1.0.0 → v1.1.0`).** Parameter retuning (e.g. weights `w1..w5`, `α`, `β`, `ρ`, `κ`, `ξ`, `γ`). Structure unchanged. Older predictions remain valid for historical comparison.
- **Major (`v1.0.0 → v2.0.0`).** Structural changes — adding bivariate Poisson, replacing the Poisson model with negative-binomial, introducing player-level features, etc.

Frozen constants per `model_version` (Elo `K` table, Dixon-Coles `ρ`, multiplier defaults, weight tables, regression coefficients `c0..c4`) live in `src/lib/model/version.ts` (planned) as exported named constants. A version bump means a new export, not a mutation.

The Monte Carlo seed is **not** part of `model_version`; the same model can be re-simulated under different seeds for sensitivity analysis.

---

## 12. Implementation notes

- **TypeScript-implementable.** All formulas in this document are expressible in pure TypeScript. No special math libraries are required beyond a `factorial`/`gammaln` helper and the seeded RNG utility in `src/lib/utils/rng.ts`.
- **No machine learning in V1.** All coefficients are either fixed by design or fit once via simple regression offline. There is no online learning, no neural net, no gradient descent at inference.
- **No network calls in the engine.** Engine modules (`src/lib/model/**`, `src/lib/simulation/**`, `src/lib/normalization/**`, `src/lib/utils/**`) do not import `fetch`, `node:http`, `node:fs`, or any client SDK.
- **No database calls in the engine.** Engine modules do not import the Supabase client or any database helper. Persistence happens in `src/lib/scheduler`.
- **Strict typing across the boundary.** `PredictionInput` and `PredictionOutput` are defined in `src/lib/types`. The engine refuses to run on incomplete inputs by throwing `MissingInputError`.
- **Single RNG.** Every random draw — Poisson sampling, Monte Carlo iterations, sensitivity analyses — uses the one seeded RNG passed in via `rngSeed`. No `Math.random()` anywhere in the engine.
- **Determinism is enforceable.** Phase 3 includes a test that runs `predictMatch` twice with identical inputs and identical seeds and asserts byte-identical `PredictionOutput`.
- **Frozen constants per `model_version`.** Bumping the version is the only legitimate way to change a coefficient; in-place edits are forbidden once a version has produced stored predictions.
- **No engine I/O via side channels.** No `console.log` inside the engine; logging is the scheduler's responsibility.
- **Implementation order (per `docs/05_BUILD_ROADMAP.md` Phase 3):**
  1. `src/lib/utils/rng.ts`
  2. `src/lib/utils/poisson.ts`
  3. `src/lib/model/version.ts` (frozen constants)
  4. `src/lib/model/rating.ts`
  5. `src/lib/model/form.ts`
  6. `src/lib/model/xg.ts`
  7. `src/lib/model/expectedGoals.ts`
  8. `src/lib/model/scoreline.ts`
  9. `src/lib/model/predict.ts`
  10. `src/lib/simulation/monteCarlo.ts`

Each step ships with a Vitest suite before the next is started.
