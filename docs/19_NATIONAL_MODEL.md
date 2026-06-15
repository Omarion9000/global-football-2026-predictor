# 19 — National-team match model (Phase 9B candidate)

Phase 9B adapts the Phase 8B Dixon-Coles candidate to the national-team
corpus loaded by Phase 9A and runs a match-level backtest end-to-end. **Like
8B, this is a backtest-only artefact — it is not promoted to production.**
`MODEL_VERSION` stays `'v0.1.0'`. The cron route still reads
`MockFixtureSource`. The engine path is untouched. Promotion is a separate
future phase requiring its own approval, with the candidate's honest
limitations (below) addressed first.

The Phase 8C harness (`runBacktest`, the calibration / metrics layer) is
reused verbatim. The new code lives under `src/lib/backtest/national/` and
adds nothing to the production tree.

## 1. What changed vs Phase 8B

The Phase 8B Dixon-Coles math is reused almost in full. The single
substantive change is the **neutral-venue gating of the home-advantage term**:

```
log λᴴ = μ + (neutral ? 0 : h) + αᵢ − δⱼ
log λᴬ = μ + αⱼ − δᵢ
```

A neutral-venue match (a tournament group game at a third-country host, a
final on neutral turf, etc.) contributes **no home-advantage term to either
side**. The τ correction, the score grid, the rho clamp, and identification
(`mean(α) = mean(δ) = 0`) are unchanged. In the gradient, each match's
contribution to `∂J/∂homeAdv` is zero when `neutral = true` — verified by a
finite-difference test (`gradientNational — all-neutral matches → analytic
dHomeAdv == 0`) plus the mixed-batch FD check.

`src/lib/backtest/national/`:
- `dixonColesNational.ts` — `computeRatesNational`, `scoreMatrixNational`, re-exports the shared `tauDC` / `recenter` / `clampRho` / `DcParams` from 8B.
- `dcFitNational.ts` — weighted MLE with neutral-aware gradient.
- `dcPredictorNational.ts` — lazy-refit predictor on the harness contract; one fit per calendar date, never peeking at the current match.
- `nationalEloPredictor.ts` — the strong baseline (see §3).

`HistoricalMatch` gained an optional `neutral?: boolean` field (additive,
backward-compatible — the 8B EPL predictors ignore it; the 9B national
predictors read `match.neutral === true`).

## 2. Train / holdout split (leakage-safe)

| window | range | matches | use |
|---|---|---:|---|
| burn-in | `< 2014-01-01` | 13,405 | observed only |
| validation | `[2014-01-01, 2018-01-01)` | 1,851 | tuning only |
| holdout | `>= 2018-01-01` | 4,796 | headline metrics |

The 13,405-match burn-in lets the rolling-fit converge on a realistic prior
before any metric counts; the 4,796-match holdout is large enough that the
headline carries weight. Holdout : validation ≈ 2.6 : 1.

The split was held back by the harness's existing `evalStartDate` /
`evalEndDate` options (added in Phase 8B for exactly this kind of
chronologically disjoint use).

## 3. Decay tuning result

Grid: ξ ∈ {0.0005, 0.0009, 0.0013, 0.0019} per day × λ_reg ∈ {0.5, 1, 2}.
The xi values correspond to half-lives of roughly 1, 1.5, 2.1, and 3.8 years
— spanning the literature's typical range for international rating models.
ρ is always fitted, never grid-tuned. Per the leakage-safe protocol the
selection runs only on the validation window; the headline is computed on
the disjoint holdout.

**Validation grid (all 12 cells):**

| ξ | half-life (days) | λ_reg | matches | Brier | log-loss | accuracy |
|---|---:|---:|---:|---:|---:|---:|
| **0.0005** | **1386** | **0.5** | 1,851 | **0.4982** | **0.8508** | 0.6126 ← chosen |
| 0.0005 | 1386 | 1 | 1,851 | 0.5002 | 0.8537 | 0.6094 |
| 0.0005 | 1386 | 2 | 1,851 | 0.5035 | 0.8594 | 0.6105 |
| 0.0009 | 770 | 0.5 | 1,851 | 0.5013 | 0.8547 | 0.6105 |
| 0.0009 | 770 | 1 | 1,851 | 0.5048 | 0.8610 | 0.6078 |
| 0.0009 | 770 | 2 | 1,851 | 0.5101 | 0.8703 | 0.6051 |
| 0.0013 | 533 | 0.5 | 1,851 | 0.5079 | 0.8651 | 0.6089 |
| 0.0013 | 533 | 1 | 1,851 | 0.5118 | 0.8719 | 0.6024 |
| 0.0013 | 533 | 2 | 1,851 | 0.5171 | 0.8813 | 0.6013 |
| 0.0019 | 365 | 0.5 | 1,851 | 0.5176 | 0.8799 | 0.5916 |
| 0.0019 | 365 | 1 | 1,851 | 0.5200 | 0.8844 | 0.5927 |
| 0.0019 | 365 | 2 | 1,851 | 0.5246 | 0.8929 | 0.5889 |

**Chosen pair: ξ = 0.0005, λ_reg = 0.5 → half-life ≈ 3.8 years.**

### The 3.8-year half-life finding

The chosen ξ is the longest in the grid — *longer* memory wins
monotonically along the validation log-loss surface. This is the **opposite**
of the Phase 8B EPL result, which chose ξ = 0.004 (half-life ≈ 173 days). A
few mechanisms plausibly drive the difference:

1. **Fixture sparsity.** A typical national team plays 10–15 competitive
   matches per year. The Phase 8B EPL teams played ~38 league matches per
   season. With a fast-decaying weight, a national team's effective sample
   collapses to "the last cycle" — too few matches to nail down attack and
   defence separately.
2. **Roster persistence.** International squads turn over far more slowly
   than club squads. A team's underlying strength changes more gradually,
   so older matches retain genuine signal.
3. **Tournament rhythm.** World Cup / Euro / AFCON qualifying cycles are
   3-4 years long. A half-life inside one cycle weights the most recent
   qualifying campaign over the prior one even when both are equally
   informative; a half-life of ~3.8 years balances them.

A future iteration could explore even longer half-lives (the grid stops at
1,386 days), but the monotonic improvement is small in the last step (0.0009
→ 0.0005 buys 0.0031 Brier) so further gains are unlikely to be large.

## 4. Simple-Elo baseline (no market available)

There's no closing-line market for international fixtures the way there is
for the Premier League — bookmakers do cover international fixtures, but the
data is sparse and unevenly available across the corpus. We use a standard
Elo system as the strong baseline instead. DC has to beat this Elo to claim
non-trivial skill.

### Configuration (defaults, mirrored from the World Football Elo conventions)

| parameter | value | rationale |
|---|---|---|
| `initialRating` | 1500 | Elo convention |
| `k` | 30 | mid-range for national-team systems |
| `homeAdvantage` | 65 Elo points | within the published 50–100 range; gated by `neutral` (same as DC) |
| `drawShoulder` | 100 Elo points | yields ~28 % draw probability at zero effective rating diff |
| `scale` | 400 | standard Elo logistic scale |

### Update rule (`observe`)

```
D = R_H − R_A + (neutral ? 0 : h)
E_H = 1 / (1 + 10^(−D / S))                # expected score for home
S_obs ∈ {0, 0.5, 1}                        # away win / draw / home win
R_H ← R_H + K · (S_obs − E_H)
R_A ← R_A − K · (S_obs − E_H)              # zero-sum
```

Observed-then-updated; no lookahead. Asserted by the same synthetic-flip
test the 8B harness used (see
`src/lib/backtest/national/__tests__/elo.test.ts`).

### 3-way mapping (`predict`)

```
D̃ = R_H − R_A + (neutral ? 0 : h)
pH = 1 / (1 + 10^(−(D̃ − d) / S))           # P(D̃ > +d)
pA = 1 / (1 + 10^(+(D̃ + d) / S))           # P(D̃ < −d)
pD = 1 − pH − pA                            # P(|D̃| ≤ d)
```

For equally-rated teams on a neutral venue (D̃ = 0): pH = pA = (1 + 10^(d/S))⁻¹
≈ 0.36 and pD ≈ 0.28 — a defensible centre point for international
football's empirical draw rate.

### Final Elo top 10 after walking the holdout

| rating | team |
|---:|---|
| 1967.3 | Spain |
| 1899.1 | France |
| 1880.0 | Argentina |
| 1865.3 | England |
| 1848.4 | Mexico |
| 1846.4 | Japan |
| 1845.6 | Portugal |
| 1836.8 | Iran |
| 1817.0 | Germany |
| 1814.4 | South Korea |

A plausible elite tier with the usual Elo quirks: Mexico is propped up by a
deep schedule of CONCACAF Nations League / Gold Cup wins against weaker
regional opposition; Japan / Iran / South Korea by AFC qualifying volume.
Germany's slide reflects post-2018 World Cup struggles.

## 5. Holdout results

4,796 matches, `dateIso >= 2018-01-01`:

| predictor | matches | Brier | log-loss | accuracy |
|---|---:|---:|---:|---:|
| uniform | 4,796 | 0.6667 | 1.0986 | 0.4679 |
| simple-elo | 4,796 | 0.5057 | 0.8632 | 0.6126 |
| **dixon-coles-national** | 4,796 | **0.4885** | **0.8334** | **0.6195** |

DC wins all three metrics:

- **Brier gap vs Elo: 0.0172** (3.4 % relative).
- **Log-loss gap vs Elo: 0.0298** (3.5 % relative).
- **Accuracy gap vs Elo: +0.0069** (0.7 pp).

For reference: Phase 8B's EPL DC *lost* to the closing-line market by ~1pp
Brier. The 9B DC-vs-Elo gap of ~1.7pp in the other direction is a real
improvement, though the absolute Brier values are not comparable across
sport contexts.

### Fitted parameters at the end of the holdout walk

- μ = 0.0417 (base log-rate adjustment)
- **homeAdv = 0.2815** — meaningfully larger than 8B's 0.11 EPL value,
  consistent with the larger documented international-football home effect.
- ρ = −0.0310 — mild draw correction, larger in magnitude than 8B's −0.0023
  but well inside the literature band.
- N teams modelled: 223 (the full Phase 9A canonical map).
- DC refits during holdout: 5,319; total fit iterations: 503,403.

## 6. Calibration (10-bin)

### Dixon-Coles national

| bin | n | mean predicted | empirical rate |
|---|---:|---:|---:|
| [0.0, 0.1) | 1,782 | 0.0507 | 0.0376 |
| [0.1, 0.2) | 2,431 | 0.1523 | 0.1193 |
| [0.2, 0.3) | 3,901 | 0.2533 | 0.2520 |
| [0.3, 0.4) | 2,088 | 0.3387 | 0.3352 |
| [0.4, 0.5) | 1,102 | 0.4483 | 0.4610 |
| [0.5, 0.6) | 962 | 0.5496 | 0.5728 |
| [0.6, 0.7) | 797 | 0.6489 | 0.6763 |
| [0.7, 0.8) | 560 | 0.7477 | 0.8161 |
| [0.8, 0.9) | 451 | 0.8486 | 0.8758 |
| [0.9, 1.0] | 314 | 0.9508 | 0.9745 |

### Simple-Elo

| bin | n | mean predicted | empirical rate |
|---|---:|---:|---:|
| [0.0, 0.1) | 1,240 | 0.0606 | 0.0339 |
| [0.1, 0.2) | 2,733 | 0.1540 | 0.1237 |
| [0.2, 0.3) | 4,800 | 0.2528 | 0.2533 |
| [0.3, 0.4) | 1,338 | 0.3490 | 0.3565 |
| [0.4, 0.5) | 1,183 | 0.4491 | 0.4598 |
| [0.5, 0.6) | 1,067 | 0.5490 | 0.5473 |
| [0.6, 0.7) | 842 | 0.6491 | 0.6971 |
| [0.7, 0.8) | 620 | 0.7458 | 0.7887 |
| [0.8, 0.9) | 393 | 0.8449 | 0.8957 |
| [0.9, 1.0] | 172 | 0.9402 | 0.9709 |

Both predictors are well-calibrated through the mid-range; both show **mild
under-confidence on the high-probability bins** — when the model says 0.75
the empirical hit rate is 0.79–0.82. Elo concentrates ~4,800 / 14,400
predictions in the [0.2, 0.3) bucket (its draw-shoulder centring); DC spreads
the mass more evenly across the centre, which is what drives the Brier /
log-loss improvement.

## 7. Honest limitations

The candidate is interesting but should not be promoted without addressing
at least the items below.

- **No market baseline.** International closing-line odds are sparse and
  inconsistent; the strong baseline in this phase is the Elo system, not a
  bookmaker. DC beating Elo is a real result, but it does not establish
  whether DC would beat a (more selective, more carefully integrated)
  market in tournament-time.
- **Tail-bin under-confidence.** Both DC and Elo predict ~0.75 / ~0.85 in
  the [0.7, 0.8) / [0.8, 0.9) bins but reality is ~0.82 / ~0.88. The model
  under-rates clear favourites by ≈ 4 pp on the upper tail. A post-hoc
  calibration map (Platt / isotonic) on the validation slice could close
  this gap without changing the engine.
- **Long-tail rating instability.** Of the 209 nations active in the
  2022–present qualification cycle, ~22 have fewer than 20 top-tier
  matches in the 8-year window. Their attack / defence parameters are
  driven almost entirely by the ridge regulariser, so DC predictions
  involving these teams should be treated with weaker confidence than the
  in-pool point estimates suggest.
- **No injury / lineup / xG / minute-by-minute inputs.** Same as 8B. A
  starting goalkeeper out, a forward suspended for accumulated yellows,
  none of it moves the rates.
- **No tournament-stage / format awareness.** A World Cup knockout game
  and a Nations League group dead rubber are treated identically.
  Real-world motivation differences are not modelled.
- **Confederation-conditional accuracy not surfaced.** The harness only
  exposes per-class calibration pairs; per-confederation argmax accuracy
  would need an instrumented second pass and was deferred.
- **3.8-year half-life is at the grid boundary.** The chosen ξ sits at the
  longest value we tried; a wider sweep could find a still-longer-memory
  optimum, though the marginal gain is small (≈ 0.003 Brier moving from ξ
  = 0.0009 to ξ = 0.0005).
- **Not promoted to production.** `MODEL_VERSION` stays `'v0.1.0'`; cron
  stays `MockFixtureSource`; engine path untouched. A promotion phase
  would need a schema migration for stored α/δ snapshots, a re-train
  cadence, and resolution of the above limitations.

## 8. Reproduce

```bash
# Pre-requisite: the Phase 9A corpus on disk (gitignored).
mkdir -p data/raw
curl -sSL -o data/raw/international_results.csv \
  https://raw.githubusercontent.com/martj42/international_results/master/results.csv

# Run the Phase 9B backtest. ~4 h wall on a 2024 Apple-silicon laptop.
pnpm backtest:national
```

Outputs the verbatim STOP-1 report to stdout. No file writes. No DB reads.
No env vars required.

## 9. What's next

Phase 9C — tournament bracket simulator. Take the 9B DC candidate, hold
its parameters fixed (no further learning during the bracket), and
Monte-Carlo a single tournament: draw, group stage, knockouts, conditional
on the 9A schedule shape. Output bracket-win probabilities per team plus a
calibration check against an external reference if one is available.
