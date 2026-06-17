# 19b — Phase 9B.2: confederation-strength extension

Phase 9B.2 extends the Phase 9B Dixon-Coles national-team model with a
per-confederation strength scalar. Like 9B, this is a **backtest-only
artefact** — `MODEL_VERSION` stays `'v0.1.0'`. The 9B model in
[`docs/19`](19_NATIONAL_MODEL.md) is preserved as the documented baseline;
9B.2 lives alongside it and is selected via the `--model=confed` flag at the
simulator entry point.

## 1. Why a confederation term

Phase 9C's first simulator run (using the 9B model) produced title-odds that
inflated AFC, OFC, and CONCACAF teams (Japan #1, Mexico #3, Australia #4, New
Zealand #5, USA #7, Iran #8, South Korea #9) and depressed UEFA / CONMEBOL
sides (Brazil #15, Argentina #13, France #12, Germany #16). This is a known
failure mode of attack-defence-only ratings when the corpus is dominated by
intra-confederation play: each confederation forms its own rating cluster,
and the absolute levels between clusters are unconstrained by the
intra-confederation matches that make up the bulk of fixtures.

The fix is to add a per-confederation level term that is identifiable from
*intercontinental* matches:

```
log λᴴ = μ + (neutral ? 0 : h) + αᵢ − δⱼ + confᶜⁱ − confᶜʲ
log λᴬ = μ + αⱼ − δᵢ                          + confᶜʲ − confᶜⁱ
```

where `confᶜ` is a scalar per confederation (AFC / CAF / CONCACAF /
CONMEBOL / OFC / UEFA) and `cᵢ`, `cⱼ` are the home and away team
confederations.

The DC τ correction, μ, h, ρ, α, δ, ridge, time-decay, and recenter are all
inherited unchanged from 9B. The only new pieces are the conf-aware rate
equation, the conf gradient, and a parallel recenter pass on `conf[]`.

## 2. Identifiability

Critical detail: **conf[] is only identifiable from intercontinental
matches**. An intra-confederation match (cᵢ = cⱼ) has
`conf[cᵢ] − conf[cⱼ] = 0` in the rate, so:

- The gradient contribution to ∂J/∂conf[c] from an intra-confederation match
  is exactly zero.
- The information about the *level* of one confederation relative to another
  flows only through matches where the two teams are from different
  confederations.

To anchor the levels uniquely we **recenter conf[] to mean 0 after every
update**, alongside the existing recenter of α and δ. Both operations are
applied inside the line-search step so the post-recenter parameters are
what's scored.

**Effective sample size** for conf[] estimation:

- All 20,052 top-tier matches contain **1,178 intercontinental** matches
  (~5.9 % of the corpus).
- By the start of the Phase 9B.2 holdout walk (2018-01-01), **1,026
  intercontinental matches** are in the observed buffer.
- That's ~170 matches per confederation on average — a modest sample that
  bounds what the conf[] term can do, but enough for the strong signal that
  emerged (see §4).

A small ridge on conf[] (`lambdaRegConf = 0.05`, much weaker than the α/δ
ridge) keeps the levels from running wild when the intercontinental sample
is thin in early observation windows; tests confirm an all-intra-confederation
training set leaves conf[] at zero (`fitDixonColesConfed —
intercontinental-only-informs-conf`).

## 3. Tuning protocol (leakage-safe, same as 9B)

Grid: ξ ∈ {0.0005, 0.0009, 0.0013, 0.0019} per day × λ_reg ∈ {0.5, 1, 2}.
`λ_regConf` is fixed at 0.05 and not grid-tuned. Same validation window
(2014-01-01 → 2017-12-31, 1,851 matches), same holdout
(2018-01-01 → present, 4,796 matches).

| ξ      | half-life (days) | λ_reg | matches | Brier  | log-loss | accuracy |
|--------|---:|---:|---:|---:|---:|---:|
| 0.0005 | 1386 | 0.5 | 1,851 | 0.4955 | 0.8468 | 0.6159 |
| **0.0005** | **1386** | **1** | **1,851** | **0.4954** | **0.8460** | **0.6143** ← chosen |
| 0.0005 | 1386 | 2 | 1,851 | 0.4965 | 0.8482 | 0.6175 |
| 0.0009 | 770 | 0.5 | 1,851 | 0.4966 | 0.8469 | 0.6099 |
| … | … | … | … | … | … | … |

Half-life ≈ 3.8 years (same as 9B). λ_reg moves up one notch from 9B's 0.5
to 1 — the conf[] term absorbs some of what α/δ used to carry, so the
team-side ridge can step up without cost.

## 4. Fitted confederation strengths (holdout-trained, after recenter)

| confederation | conf[c] | exp(conf) | interpretation |
|---|---:|---:|---|
| **CONMEBOL** | **+0.9148** | 2.50 × | top tier |
| **UEFA** | **+0.5389** | 1.71 × | second tier |
| CAF | +0.2063 | 1.23 × | mildly above |
| AFC | −0.2761 | 0.76 × | mildly below |
| CONCACAF | −0.3667 | 0.69 × | below |
| **OFC** | **−1.0172** | 0.36 × | bottom |

Σ conf = 0 to 11 decimal places (recenter holds).

A UEFA team playing an OFC team in this fit gets its log-rate adjusted by
`+0.5389 − (−1.0172) = +1.56` units — i.e., its λ multiplier is `exp(1.56)
≈ 4.76 ×` the equivalent pure-α/δ model would assign. This is the magnitude
of the directional correction the conf[] term applies in
multi-confederation tournament settings.

## 5. Holdout headline — side by side

4,796 matches, dateIso ≥ 2018-01-01:

| predictor | matches | Brier | log-loss | accuracy |
|---|---:|---:|---:|---:|
| uniform | 4,796 | 0.6667 | 1.0986 | 0.4679 |
| simple-elo | 4,796 | 0.5057 | 0.8632 | 0.6126 |
| dixon-coles-national (9B) | 4,796 | 0.4885 | 0.8334 | 0.6195 |
| **dixon-coles-confed (9B.2)** | 4,796 | **0.4878** | **0.8330** | 0.6184 |

| confed − 9B (negative = confed wins) | value |
|---|---:|
| ΔBrier | **−0.000671** |
| Δlog-loss | **−0.000407** |
| Δaccuracy | −0.001043 |

**GATE A passed by a hair** — log-loss improves by 0.05 % relative, Brier
by 0.07 %. Argmax accuracy slightly worsens (a few extra borderline calls
flipped). **This is the honest framing**: the aggregate holdout gain is
tiny because **93 % of holdout matches are intra-confederation** — UEFA
qualifiers, AFC qualifiers, CONCACAF Nations League, AFCON qualifying, etc.
The conf differential for those is exactly zero by construction, so the
confed model and 9B make near-identical predictions on the bulk of the
sample.

The confed term **only re-prices the ~7 % intercontinental subset** of
historical matches. In the holdout, that's ~340 matches — too few to move
the aggregate metric meaningfully.

## 6. Where the confed term actually shows its value

The 2026 tournament — where every group has teams from at least four
different confederations and the entire knockout stage is essentially
intercontinental — is the setting where conf[] dominates. Re-running the
Phase 9C simulator (`pnpm sim:tournament --model=confed`, same seed=42 and
N=10000) gave:

| metric | 9B run | confed run |
|---|---:|---:|
| Title #1 | Japan 13.5 % | **Spain 20.0 %** |
| Title #2 | Spain 9.1 % | **Brazil 15.0 %** |
| Title #3 | Mexico 7.5 % | **Argentina 9.6 %** |
| Japan title | **13.5 %** | **0.44 %** (−30×) |
| Mexico title | **7.5 %** | 0.40 % (−19×) |
| New Zealand title | 5.5 % | **0.00 %** (eliminated) |
| Brazil title | 2.9 % | **15.0 %** (+5.2×) |
| Argentina title | 3.5 % | **9.6 %** (+2.7×) |
| Germany title | 2.4 % | **7.5 %** (+3.1×) |
| France title | 3.5 % | **5.7 %** (+1.6×) |

The corrected top tier (Spain / Brazil / Argentina / England / Germany /
Portugal / France / Netherlands / Belgium / Uruguay / Colombia /
Switzerland) matches the conventional pre-tournament expectation in shape
and ordering, with **Morocco the highest non-UEFA-and-non-CONMEBOL team at
#12 (2.4 %)** — consistent with their 2022 World Cup semi-final run lifting
their attack-defence parameters.

See [`docs/20`](20_TOURNAMENT_SIMULATOR.md) §3 for the full title-odds
table and limitations.

## 7. Tests covering the new term

- **Gradient check**: analytic vs finite-difference on `dConf[c]` across a
  mixed intra/intercontinental test corpus, tolerance 1e-4
  (`dcConfed.test.ts: gradientConfed — analytic dConf matches finite differences`).
- **Identifiability**: all-intra-confederation training set leaves conf[] at
  zero (`intercontinental-only-informs-conf`).
- **Recovery**: synthetic dataset where AFC outscores CAF by +1 goal in
  intercontinental matches — fitted `conf[AFC] > conf[CAF]` with the
  correct sign.
- **Recenter**: `mean(α) = mean(δ) = mean(conf) < 1e-12` after fit
  (`fitDixonColesConfed — invariants`).
- **Rate equation**: intra-confederation match (cᵢ = cⱼ) yields the same
  λ as the conf-blind formulation (regression guard).

11 tests in `src/lib/backtest/national/__tests__/dcConfed.test.ts`.

## 8. Honest limitations

Each limitation in `docs/19` §7 still applies (no lineups / injuries / xG,
tail-bin under-confidence, long-tail rating instability, not promoted to
production, no host-nation handling, etc.). The confed term doesn't fix any
of them; it only addresses the cross-confederation rating bias.

Two limitations specific to 9B.2:

- **Modest intercontinental sample (1,026 matches by holdout start).** The
  per-confederation gap estimates carry some uncertainty — trust the
  ordering, not the exact decimals on conf[c]. A future extension could
  pool from a wider tournament + friendly set with careful filtering.
- **Confederation is treated as a fixed scalar per team.** Australia moved
  from OFC to AFC in 2006 and is classified AFC in our map. The model
  treats every Australia match — even pre-2006 — as carrying the AFC conf
  term. This is correct for the *current* tournament's purpose but means
  the historical fit slightly mis-prices old Oceania-era Australia matches.

## 9. Reproduce

```bash
# Pre-requisite: Phase 9A corpus on disk (gitignored).
mkdir -p data/raw
curl -sSL -o data/raw/international_results.csv \
  https://raw.githubusercontent.com/martj42/international_results/master/results.csv

# Confed-vs-9B head-to-head backtest (~5h wall on a 2024 Apple-silicon laptop)
pnpm backtest:confed

# Tournament simulator with the confed model
pnpm sim:tournament --model=confed
```

Both runs are deterministic (seeded RNG), no DB, no env vars required.
