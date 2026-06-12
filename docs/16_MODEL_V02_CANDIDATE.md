# 16 — Dixon-Coles v0.2 candidate model

Phase 8B introduces an offline candidate model that lives entirely inside the
backtest infrastructure. **It is not promoted.** The production engine
(`src/lib/model/`, `MODEL_VERSION = "v0.1.0"`) is byte-identical with what
Phases 2-7 shipped. A future phase — with its own approval — will decide
whether to ship anything from this document.

## 1. What this model is, mathematically

A bivariate-Poisson rates model with the Dixon-Coles 1997 low-score
correction.

### 1.1 Rates

For a match where team `i` plays at home against team `j`:

```
log λᴴ = μ + h + αᵢ − δⱼ
log λᴬ = μ + αⱼ − δᵢ
```

- `μ` — global intercept on log scale (the league-average expected goals).
- `h` — home-ground advantage (a single scalar, not per-team).
- `αₖ` — team `k`'s attack strength.
- `δₖ` — team `k`'s defence strength (higher = harder to score against).

Identification: `mean(α) = 0` and `mean(δ) = 0`. The fitter re-centers both
arrays after every accepted update, so the parameters remain identifiable.

### 1.2 Dixon-Coles low-score correction

The independent-Poisson model systematically underestimates draws and the
1-0 / 0-1 scorelines. DC apply a multiplicative correction `τ(x, y)` on the
four cells `{(0,0), (1,0), (0,1), (1,1)}`:

```
τ(0,0) = 1 − λᴴ·λᴬ·ρ
τ(1,0) = 1 + λᴬ·ρ
τ(0,1) = 1 + λᴴ·ρ
τ(1,1) = 1 − ρ
τ(x,y) = 1   otherwise
```

With `ρ = 0` the correction collapses and the model is independent-Poisson.
Tested explicitly in `dcFit.test.ts`.

### 1.3 From rates to outcome probabilities

The (x, y) cell probability:

```
P(x, y) ∝ τ(x, y; λᴴ, λᴬ, ρ) · Pois(x; λᴴ) · Pois(y; λᴬ)
```

We materialise the (0..10) × (0..10) score grid, renormalise it to sum to 1
(handling the small numerical tail beyond goal index 10), and read off the
home / draw / away marginals.

## 2. Estimation

### 2.1 Objective

```
J(θ) =  Σ_m  wₘ · log Pᴰᶜ(scoreH_m, scoreA_m | θ)
      − λ_reg · ( Σ_i αᵢ² + Σ_i δᵢ² )
```

The standard DC 1997 unnormalised log-likelihood (the multinomial constant
is dropped because it doesn't depend on θ).

`wₘ = exp(−ξ · Δdaysₘ)` is an exponential time-decay weight where `Δdays`
is the gap between the match date and the fit date.

`λ_reg` is a ridge penalty on attack and defence vectors. Bigger penalty →
parameters shrink toward zero (league average).

### 2.2 Algorithm

- Analytic gradients (no autodiff dependency).
- Batch gradient ascent with a **backtracking line search**: try the
  configured step, halve while the objective fails to improve.
- Stop conditions: gain below `1e-7` or 500 iterations (cold start); 100
  iterations for warm starts.
- After every accepted update: re-center `α` and `δ`, then clamp `ρ` into
  `[-0.2, 0.1]` (the documented safe band for Premier League λs).

`src/lib/backtest/models/__tests__/dcFit.test.ts` verifies analytic gradients
against central finite differences with a 1e-4 tolerance over a tiny
4-team / 8-match dataset that exercises every partial.

### 2.3 Promotion / cold-start handling

A newly observed team enters the model at `αₖ = δₖ = 0`. The ridge penalty
keeps it close to league average until enough matches have been observed for
the data to assert otherwise. This is honest about Premier League promotion
dynamics: a newly promoted club shouldn't share a prior with last year's
champions, and we don't have a richer prior to give it.

## 3. Tuning protocol — leakage-safe

The candidate model has two hyperparameters: `ξ` (decay) and `λ_reg`
(ridge). They are tuned ONLY on the validation window and the choice is
frozen before the holdout numbers are computed.

- **Burn-in:** season 2015-16 — observed but never scored.
- **Validation:** seasons 2016-17 + 2017-18 — used to select `(ξ, λ_reg)`
  by minimising the validation log-loss. Ties broken by lower Brier.
- **Holdout:** seasons 2018-19 .. 2024-25 — the headline numbers. The
  validation seasons are **not** included; the per-season report tags them
  with `(val)` so any future reader can see which seasons informed the
  selection.

Grid:

| dimension  | values                                  |
|------------|-----------------------------------------|
| `ξ` (/day) | `0.001`, `0.002`, `0.004`, `0.0065`     |
| `λ_reg`    | `0.5`, `1`, `2`                         |

`ρ` and the per-team `α`/`δ` are always **fitted**, never grid-tuned.

`docs/15_BACKTEST_BASELINES.md` carries the verbatim grid and the chosen
pair from the most recent `pnpm backtest` run.

## 4. Results (latest run)

`pnpm backtest` writes the canonical numbers into
[`docs/15_BACKTEST_BASELINES.md`](15_BACKTEST_BASELINES.md). At the time of
Phase 8B's commit:

- Chosen `(ξ, λ_reg) = (0.004, 2)` — half-life ≈ `ln(2) / 0.004 ≈ 173 days`.
- Holdout headline (2,660 matches, 2018-19 .. 2024-25):

| predictor                        | Brier   | log-loss | accuracy |
|----------------------------------|---------|----------|----------|
| uniform                          | 0.6667  | 1.0986   | 0.4414   |
| rolling-home-advantage           | 0.6442  | 1.0644   | 0.4414   |
| market-implied (closing line)    | 0.5621  | 0.9509   | 0.5586   |
| **dixon-coles-v0.2-candidate**   | 0.5726  | 0.9657   | 0.5417   |

- DC beats both naive baselines decisively on both metrics (gate A pass).
- DC loses to closing-line market by ~`0.0105` Brier and ~`0.0148`
  log-loss — see §5 for the honest reasons why.

Fitted parameters at the end of the holdout pass (gate D inspection):

- `homeAdv ≈ 0.11` (positive, as expected).
- `ρ ≈ −0.002` (small negative correlation, consistent with the literature).
- `|mean(α)| < 1e-8`, `|mean(δ)| < 1e-8` (identification holds).
- Final fit objective is monotone non-decreasing across iterations.

## 5. Honest limitations

The candidate is interesting but **strictly worse than the closing-line
market**, and it should not be promoted without addressing at least the
items below.

- **No lineup data.** The model treats every match as if the same XI took
  the field. A first-team striker missing won't move λᴴ.
- **No injuries / suspensions.** Same reason.
- **No xG inputs.** The model conditions on realised goals; it doesn't
  learn from chance quality. Two equally-rated teams that score 2 against
  a peer despite an xG of 0.5 contribute the same signal as a team that
  earned a 2.5 xG.
- **Promoted-team cold start.** A newly promoted club starts at α = δ = 0
  and stays there until matches accumulate. This is the same reason a real
  bookmaker assigns wider odds to a newcomer.
- **Single home-advantage scalar.** The model can't represent "Team X is
  unusually strong at home" — every team shares the same `h`.
- **One league.** Trained and evaluated entirely on the Premier League.
  Transfer to international tournament football is plausible but unverified.
- **Closing-line markets remain unbeaten.** A bookmaker integrates lineups,
  weather, public-line movements, betting-volume signal, and a regular
  recalibration cycle. This model does none of those things.

Anything that lifts the DC line above the market line on **both** Brier
**and** log-loss across the next holdout window would be a real result and
should be promoted via its own phase.

## 6. What would change in production if this were promoted

Promotion would touch the production engine, the schema, and the UI:

- `MODEL_VERSION` bump from `v0.1.0` to `v0.2.0` (or a candidate suffix).
- New schema columns or a side table for fitted α/δ snapshots; storing the
  full parameter set per cron run is comfortably within Postgres.
- The production code path would have to retrain (or load a pre-trained
  snapshot) on a schedule independent of the prediction cron.

None of that is in scope for Phase 8B. The candidate model is a backtest
artifact only.

## 7. Reproducing

```bash
pnpm history:fetch    # Phase 8A — idempotent download
pnpm history:build    # Phase 8A — aggregate
pnpm backtest         # Phase 8B — tune + headline
```

The full per-match detail JSON lands at
`data/processed/backtest-report.json` (gitignored). Aggregate report at
`docs/15_BACKTEST_BASELINES.md` (committed).
