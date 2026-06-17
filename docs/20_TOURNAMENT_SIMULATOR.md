# 20 — Tournament simulator

Phase 9C — Monte Carlo simulation of the 2026 tournament using the
Phase 9B / 9B.2 national-team Dixon-Coles models. **Engine only — no UI,
no live data feed.** The UI lands in Phase 9D. Real-match results enter the
simulation through a manually-edited config file, not an API.

**Production guardrails preserved.** No production engine change. No schema.
No live-scores integration. `MODEL_VERSION = 'v0.1.0'` in the deployed
predictor; cron continues to read `MockFixtureSource`; the public surface
still renders the fictional mock tournament. The national-team models
loaded here run **offline only** and the simulator's output never reaches
the deployed product without an explicit promotion phase.

> **Independence and non-affiliation.** This is an independent statistical
> exercise. The simulator is not endorsed by, sponsored by, or affiliated
> with any football federation, tournament organiser, or broadcaster.
> Tournament results are public historical facts.

## 1. Architecture

```
data/raw/international_results.csv (gitignored, 20,052 rows)
                 │
                 ▼
   parseResults  (Phase 9A — top-tier 15-tournament filter)
                 │
                 ▼
   fitOnce       (Phase 9B model, ξ=0.0005, λ_reg=0.5)
   fitOnceConfed (Phase 9B.2 confed model, ξ=0.0005, λ_reg=1)
                 │
                 ▼
   MatchEngine ── scoreMatrixFor + modelStrength + resolveKnockoutMatch
                 │
                 ▼
   runMonteCarlo (N passes over: 12 groups × 6 matches + R32 + R16 + QF + SF + Final)
                 │
                 ├──► stdout: title-odds table (top N), per-group P(1st-4th)
                 └──► data/tournament/sim-report.json (gitignored): full per-team aggregate
```

The `MatchEngine` interface is the single point of model abstraction. Both
the 9B variant (`makeEngine(model)`) and the 9B.2 confed variant
(`makeEngineConfed(model)`) satisfy it; `simulate.ts` is model-agnostic.

## 2. Configuration files

Two committed JSON files under `data/tournament/`:

### `groups.json`
The 12 groups × 4 teams each, written in the FIFA-style team names users
will recognise. The Phase 9A `teamMap` accepts aliases so
`Korea Republic`, `Czechia`, `Curacao`, and `Cote d'Ivoire` all resolve to
the corpus-canonical entries (`South Korea`, `Czech Republic`, `Curaçao`,
`Ivory Coast`).

### `results.json`
A manually-edited list of played matches. Each entry pins one match outcome
that the Monte Carlo treats as fixed (variance = 0 for that match). Empty
array = pure pre-tournament prediction.

Schema:
```json
{
  "results": [
    { "stage": "group", "home": "Mexico", "away": "South Africa",
      "homeGoals": 2, "awayGoals": 0 },
    { "stage": "r16", "home": "Spain", "away": "Argentina",
      "homeGoals": 3, "awayGoals": 1 }
  ]
}
```

Valid `stage` values: `"group"`, `"r32"`, `"r16"`, `"qf"`, `"sf"`,
`"final"`, `"third_place"`.

**Knockout caveat:** the simulator hard-errors if a pinned knockout result
is a draw. A real knockout decided on penalties (e.g. Spain 1, Germany 1
(Spain on pens)) should be encoded as the *effective* decisive score
(e.g. `1, 0`) — the simulator just needs to know who advanced.

### `bracket.ts`
The committed constant defining the 16 R32 pairings + R16 / QF / SF / F
tree. This is a **deterministic placeholder structure**, not FIFA's exact
2026 published bracket. Replacing `R32_MATCHES` with the official pairings
is a single-array edit; the downstream tree is bracket-position-relative.
See `src/lib/tournament/bracket.ts` for the inline note.

## 3. Canonical pre-tournament prediction (confed model)

`pnpm sim:tournament --model=confed --seed=42 --n=10000` with an empty
`results.json` is the canonical pre-tournament prediction. Runtime ~12 s
(fit ~9 s, 10,000 sim passes ~3 s). Σ P(title) = 1.0000 exact.

**Top 20 title odds (confed model):**

| rank | team | P(title) | P(final) | P(SF) | P(QF) | P(R16) |
|---:|---|---:|---:|---:|---:|---:|
| 1 | Spain | 20.0 % | 30.2 % | 44.3 % | 60.5 % | 80.0 % |
| 2 | Brazil | 15.0 % | 26.6 % | 45.8 % | 62.8 % | 78.6 % |
| 3 | Argentina | 9.6 % | 16.0 % | 23.8 % | 39.3 % | 63.9 % |
| 4 | England | 8.3 % | 15.3 % | 23.9 % | 40.5 % | 65.9 % |
| 5 | Germany | 7.5 % | 14.4 % | 26.3 % | 47.7 % | 72.7 % |
| 6 | Portugal | 6.5 % | 12.4 % | 19.9 % | 36.0 % | 62.3 % |
| 7 | France | 5.7 % | 10.8 % | 17.8 % | 32.7 % | 57.9 % |
| 8 | Netherlands | 4.2 % | 9.2 % | 17.9 % | 33.8 % | 60.7 % |
| 9 | Belgium | 4.2 % | 9.1 % | 17.2 % | 30.0 % | 63.7 % |
| 10 | Uruguay | 3.0 % | 7.5 % | 18.6 % | 33.1 % | 58.3 % |
| 11 | Colombia | 2.8 % | 6.1 % | 11.2 % | 25.1 % | 50.2 % |
| 12 | Morocco | 2.4 % | 6.3 % | 16.3 % | 33.0 % | 53.9 % |
| 13 | Switzerland | 2.4 % | 6.3 % | 17.9 % | 39.5 % | 63.3 % |
| 14 | Croatia | 1.6 % | 4.0 % | 8.1 % | 19.4 % | 43.0 % |
| 15 | Ecuador | 1.3 % | 4.2 % | 10.6 % | 23.1 % | 47.9 % |
| 16 | Norway | 0.8 % | 2.5 % | 5.7 % | 14.9 % | 35.3 % |
| 17 | Turkey | 0.7 % | 2.1 % | 7.2 % | 16.6 % | 38.5 % |
| 18 | Austria | 0.5 % | 1.2 % | 3.6 % | 10.9 % | 28.9 % |
| 19 | Scotland | 0.5 % | 1.7 % | 6.2 % | 16.2 % | 33.0 % |
| 20 | Sweden | 0.4 % | 1.9 % | 5.3 % | 13.0 % | 32.3 % |

A UEFA / CONMEBOL-dominated top tier, with Morocco the highest non-UEFA-
non-CONMEBOL team at #12 — consistent with bookmaker pre-tournament
expectations and Morocco's 2022 World Cup semi-final run.

For context: the original 9C run using the **9B model only** (without
confederation strength) produced a clearly biased top tier — Japan #1
(13.5 %), Mexico #3, Australia #4, New Zealand #5, USA #7, Iran #8, South
Korea #9. The bias mechanism is documented in
[`docs/19b`](19b_NATIONAL_MODEL_CONFED.md) §1. The 9B run is still
reproducible via `pnpm sim:tournament --model=9b` for direct comparison.

## 4. Honest limitations

The simulator output is best read as **a rank ordering with uncertainty
intervals**, not as exact title percentages.

### 4.1 Host-nation underrating (V1 simplification)

**Every tournament match in V1 is modelled as neutral.** Real 2026 fixtures
involving the three host nations (USA, Mexico, Canada) playing on home soil
would technically merit the homeAdv term, but the simulator has no
per-match venue data so the conservative-neutral default applies
throughout.

Combined with the CONCACAF confed term being mildly negative (−0.35), the
host nations are likely **underrated by ~2–4 percentage points each in
title probability** vs a venue-aware model. Their confed-corrected odds
read:

| host | confed title odds |
|---|---:|
| Mexico | 0.40 % |
| United States | 0.09 % |
| Canada | 0.11 % |

A future revision could add a per-match `isHomeFor` slot to the bracket
config; deferred to keep V1 small.

### 4.2 Intercontinental-sample uncertainty

The Phase 9B.2 conf[] values are anchored by **1,026 intercontinental
matches** in the corpus by 2018 (~170 per confederation on average). That's
modest. **Trust the ordering, not the decimals** — small relative shifts
between adjacent teams (e.g. Netherlands 4.2 % vs Belgium 4.2 %; Morocco
2.4 % vs Switzerland 2.4 %) are within sampling noise and should not drive
real-world prediction calls in isolation.

### 4.3 Weak-data debutants

Two 2026 participants have very thin top-tier corpus history at the time
of writing:
- **Curaçao** (CONCACAF) — a small handful of CONCACAF Nations League
  matches; α/δ driven almost entirely by the ridge.
- **Cape Verde** (CAF) — limited AFCON appearances and qualifiers; same
  caveat.

Predictions involving them carry larger model uncertainty than the
in-pool point estimates suggest. Their confed-corrected odds read:
| debutant | confed title odds |
|---|---:|
| Curaçao | 0.00 % |
| Cape Verde | 0.01 % |

### 4.4 R32 bracket is a placeholder

`src/lib/tournament/bracket.ts` encodes a deterministic, plausible 32-team
tree but does **not** claim to match FIFA's exact published 2026 pairings.
The structure is:
- 8 R32 matches pairing group winners A–H with best-thirds 8–1
- 4 R32 matches pairing group winners I–L with runners-up of opposite-end
  groups
- 4 R32 matches pairing runners-up (A vs B, C vs D, E vs F, G vs H)

Replacing `R32_MATCHES` with the official FIFA pairings is a single-array
edit. The downstream R16 / QF / SF / F tree is bracket-position-relative
so it does not need to change. Tests in `bracket.test.ts` verify the
structural invariants (every group label appears exactly once as winner
and once as runner-up, exactly 8 third-place slots referenced, etc.) —
these still hold under any official FIFA pairing.

### 4.5 The "manual results.json update" workflow

The simulator is designed for the **live-update use case** without any
data feed. As the tournament progresses, edit `data/tournament/results.json`
by hand:

```json
{
  "results": [
    { "stage": "group", "home": "Mexico", "away": "South Africa",
      "homeGoals": 2, "awayGoals": 0 }
  ]
}
```

Then re-run `pnpm sim:tournament --model=confed`. Pinned results are
treated as fixed; remaining matches re-sample. The 12-second runtime
makes this practical for an interactive between-matches check. Each
re-run is deterministic given the same seed + same results.json, so
re-running with seed=42 immediately after every new match gives a
reproducible odds trajectory.

There is **no live API** in this phase. A future Phase 9D would surface
the simulation in a UI; whether to add a live data feed is a separate
approval question.

## 5. Reproduce

```bash
# Pre-requisite: Phase 9A corpus on disk (gitignored, one-shot)
mkdir -p data/raw
curl -sSL -o data/raw/international_results.csv \
  https://raw.githubusercontent.com/martj42/international_results/master/results.csv

# Pre-tournament prediction (canonical: confed model)
pnpm sim:tournament --model=confed --seed=42 --n=10000

# Comparison run with the biased 9B model (for context, not canonical)
pnpm sim:tournament --model=9b --seed=42 --n=10000

# Custom N / seed
pnpm sim:tournament --model=confed --n=20000 --seed=7 --top=30
```

Outputs the title-odds table and per-group P(1st–4th) tables to stdout.
Full per-team aggregate JSON is written to
`data/tournament/sim-report.json` (gitignored).
