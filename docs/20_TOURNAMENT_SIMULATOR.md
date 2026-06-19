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
Phase 9E rewrote this file to mirror FIFA's published 2026 knockout
structure: the 16 R32 matches (M73–M88) carry the exact winner / runner-up
pairings, and the 8 third-place slots carry their real FIFA cluster of
eligible groups. The R16 / QF / SF / Final tree (M89–M104) follows the
published feed table; the third-place playoff M103 is intentionally not
modelled because it does not affect title odds. See
[§4.4](#44-knockout-bracket-fifas-2026-structure-with-option-1a-thirds)
for the full description and the Option-1a third-place assignment.

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

### 4.1 Host-nation underrating (partly addressed in Phase 9F)

**Phase 9F applied the model's fitted home-advantage term to the three
host nations (Mexico, Canada, USA) for their group-stage matches.** Every
host nation verifiably plays all three of its group-stage fixtures on home
soil in 2026, so a flat group-stage host rule is venue-faithful without
needing a per-match table. See [§5](#5-host-home-advantage-phase-9f-group-stage-only)
for the wiring and the Option-B rule.

**Knockout matches remain modelled as neutral for every team.** Host
knockout venues span all three countries and depend on each team's bracket
path, which the simulator does not resolve. The hosts' title ceiling is
therefore still capped versus a fully venue-aware variant.

Pre-9F host odds (Phase 9E bracket, all-neutral) → Post-9F host odds
(group-stage host advantage):

| host | pre-9F P(R16) | post-9F P(R16) | Δ pp | pre-9F P(title) | post-9F P(title) | Δ pp |
|---|---:|---:|---:|---:|---:|---:|
| Mexico | 46.6 % | 46.1 % | −0.5 | 0.34 % | 0.32 % | −0.02 |
| United States | 43.4 % | 45.5 % | +2.1 | 0.09 % | 0.16 % | +0.07 |
| Canada | 33.8 % | 37.7 % | +3.9 | 0.02 % | 0.12 % | +0.10 |

Mexico barely moves because Mexico was already the clear Group A
favourite at neutral — the home boost only sharpens P(1st) (now ~60 %).
USA gains the most R16 lift because USA was nearly tied with Australia for
Group D winner before 9F; the home term tips that close call. Canada
gains the most P(R16) because Group B is the tightest of the three host
groups.

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

### 4.4 Knockout bracket: FIFA's 2026 structure with Option 1a thirds

Phase 9E replaced the earlier placeholder tree with the FIFA-published 2026
knockout structure. The R32 pairings (M73–M88), the R16 → Final feed table
(M89–M104), and the eight third-place cluster sets all match the FIFA
table verbatim. The implementation is in `src/lib/tournament/bracket.ts`
and `src/lib/tournament/thirdPlaceAssignment.ts`; the structural invariants
are pinned cell-by-cell in `bracket.test.ts`.

**R32 — winner / runner-up pairings (exact).**

| Match | Home | Away |
|---|---|---|
| M73 | 2A | 2B |
| M74 | 1E | 3rd ∈ {A, B, C, D, F} |
| M75 | 1F | 2C |
| M76 | 1C | 2F |
| M77 | 1I | 3rd ∈ {C, D, F, G, H} |
| M78 | 2E | 2I |
| M79 | 1A | 3rd ∈ {C, E, F, H, I} |
| M80 | 1L | 3rd ∈ {E, H, I, J, K} |
| M81 | 1D | 3rd ∈ {B, E, F, I, J} |
| M82 | 1G | 3rd ∈ {A, E, H, I, J} |
| M83 | 2K | 2L |
| M84 | 1H | 2J |
| M85 | 1B | 3rd ∈ {E, F, G, I, J} |
| M86 | 1J | 2H |
| M87 | 1K | 3rd ∈ {D, E, I, J, L} |
| M88 | 2D | 2G |

**R16 → Final (exact, by FIFA bracket position).**

```
R16: M89=(W74,W77)  M90=(W73,W75)  M91=(W76,W78)  M92=(W79,W80)
     M93=(W83,W84)  M94=(W81,W82)  M95=(W86,W88)  M96=(W85,W87)
QF:  M97=(W89,W90)  M98=(W93,W94)  M99=(W91,W92)  M100=(W95,W96)
SF:  M101=(W97,W98) M102=(W99,W100)
F:   M104=(W101,W102)
```

The third-place playoff M103 (losers of M101 and M102) is intentionally
**not modelled**. It does not affect title or finalist probabilities, and
adding it would only consume RNG draws without altering aggregates.

**Option 1a — third-place assignment via cluster matching.**

In every simulation pass the group stage produces a unique pool of 8
best-third teams (one from each of 8 of the 12 groups, ranked by points →
goal difference → goals for → model strength → name). These 8 teams must
be mapped onto the 8 R32 third-place slots subject to the FIFA cluster
constraint: a slot whose cluster is `{E, H, I, J, K}` may only be filled by
a third whose group letter belongs to that set.

`thirdPlaceAssignment.ts` finds a perfect cluster-respecting matching via
augmenting-path bipartite matching:

```
For each slot s in order:
  visited ← ∅
  tryAssign(s, visited):
    For each unmatched eligible third t:
      visited ← visited ∪ {t}
      If t is free, or tryAssign(matchOf(t), visited) succeeds:
        slot(s) ← t
        match(t) ← s
        return true
```

When a perfect matching exists the algorithm returns it deterministically.
When it does not (an artefact of using cluster sets instead of FIFA's full
Annex C scenario table), the module falls back to a deterministic best-
effort assignment — most-constrained slot first, then alphabetical group
letter within eligible candidates, then any remaining third when none are
eligible — and flags `isFallback: true`. The simulator counts these
occurrences in `agg.thirdPlaceFallbackCount`; the runner reports the
rate and the committed UI JSON carries it in `meta.thirdPlaceFallbackRate`.

**FIFA Annex C scenarios — not enumerated.** FIFA's official allocation
procedure spells out 495 = C(12, 8) explicit scenarios mapping each
combination of 8 advancing groups to a specific slot assignment. We do not
encode that table; we resolve each pass via cluster matching instead. The
fallback rate is the audit number that tells us how lossy this
approximation is.

**Observed fallback rate (post-MD1 corpus, confed model, seed 42, N =
10 000 passes):** **0 / 10 000 = 0.00 %**. The cluster-respecting
augmenting-path matching found a perfect assignment in every pass — the
deterministic fallback never fired. Option 1a is, for this state of the
tournament, **structurally exact** with respect to slot eligibility.

**Effect on title probabilities (post-MD1, vs. the previous placeholder
bracket, same seed, same N):**

| rank | team | new (FIFA) | prev (placeholder) | Δ pp |
|---:|---|---:|---:|---:|
| 1 | Spain | 16.7 % | 18.6 % | −1.9 |
| 2 | Argentina | 11.6 % | 8.8 % | +2.8 |
| 3 | England | 11.5 % | 9.0 % | +2.5 |
| 4 | Brazil | 10.9 % | 15.9 % | −5.0 |
| 5 | Portugal | 8.1 % | 6.3 % | +1.8 |
| 6 | France | 8.0 % | 5.9 % | +2.1 |
| 7 | Germany | 7.0 % | 8.1 % | −1.1 |
| 8 | Belgium | 5.1 % | 4.2 % | +0.9 |

Brazil drops 5 pp because 1C vs 2F (a real Group F runner-up) is a much
harder R32 than the placeholder match-up; Argentina and England rise
because their FIFA paths put them on Spain's opposite half of the draw
until the semi-final. The reshuffling is a real structural artefact of
using the published bracket, not noise.

### 4.5 Annex C scenarios are not enumerated

See §4.4 — the cluster matching covers the same intent as Annex C for the
post-MD1 corpus (0 % fallback) without enumerating the 495-case table.
Should a future state push the fallback rate up materially, the right next
move is to add the literal Annex C table as the assignment authority.

### 4.6 The "manual results.json update" workflow

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

## 5. Host home advantage — Phase 9F (group stage only)

### 5.1 Why

The three 2026 host nations — Mexico, Canada, and the United States — play
all of their group-stage matches on home soil (verified: Mexico's group
matches are in Mexico, Canada's are in Canada, USA's are in the USA, with
no host playing a group fixture abroad). Treating those matches as neutral
is therefore measurably wrong. Knockout venues are spread across all three
countries and depend on bracket path, so the knockout layer remains
neutral — that limitation is documented in §4.1 and the methodology card
in the UI.

### 5.2 The Option-B rule

The wiring is config-driven, not match-ID-driven:

> **A team listed in `HOST_NATIONS` (`src/lib/tournament/hostNations.ts`)
> playing a group-stage match is at home. Every other match is neutral.**

This avoids hard-coding a per-fixture venue table. The host designation
matches the canonical `groups.json` display names verbatim (Mexico,
Canada, United States). The runner's existing `resolveNation` pipeline
ensures any drift surfaces as a hard error rather than silently failing.

### 5.3 What changed in code

- `src/lib/tournament/hostNations.ts` — exports the `HOST_NATIONS` set and
  `isHostNation(team)` helper. Three-line module.
- `src/lib/tournament/matchModel.ts` and
  `src/lib/tournament/matchModelConfed.ts` — the `MatchEngine.scoreMatrixFor`
  interface gains an optional `neutral?: boolean` parameter (default `true`,
  preserving every existing call site). Both wrappers thread the flag
  through to the underlying Dixon-Coles score-matrix function, which
  already accepted a `neutral` argument from Phase 9B onward.
- `src/lib/tournament/simulate.ts` — the per-pass group-stage loop now
  calls a `sampleHostAwareGroupMatch` helper that consults `HOST_NATIONS`.
  When exactly one of the two teams is a host the score matrix is computed
  with the host on the home side (`neutral=false`); when the schedule
  labels the host as the away team (M5 in each host's group), the sampled
  scoreline is mapped back to the schedule's orientation so downstream
  tiebreakers and pinned-result lookups stay consistent. When neither
  team is a host the path is identical to the pre-9F call (`neutral=true`).
- Knockout matches continue to invoke `engine.resolveKnockoutMatch`, which
  builds its grid via `scoreMatrixFor(home, away)` with the default
  `neutral=true`. No host-aware path exists in the R32+ loop.

### 5.4 The homeAdv value used

The home-advantage scalar applied is **exactly the term the 9B (and 9B.2
confed) fit produced** when minimising weighted MLE over the martj42
top-tier international corpus. No new constant is introduced; no
re-estimation is performed. The model exposes `model.params.homeAdv`
directly; the score-matrix function multiplies the home team's goal rate
by `exp(homeAdv)` when `neutral=false` and by `1` when `neutral=true` —
the same code path the Phase 9B backtest predictor uses for venue-aware
league matches.

### 5.5 Engine math is byte-identical

Phase 9F is a wiring change, not a model change. The Dixon-Coles math
(`src/lib/backtest/national/dixonColes.ts`,
`src/lib/backtest/national/dixonColesConfed.ts`) is byte-identical to
Phase 9B/9B.2. `MODEL_VERSION` stays `'v0.1.0'`. The production deployed
engine in `src/lib/model/**` is untouched.

### 5.6 What changes on the post-MD1 corpus

Compared to the Phase 9E run (same seed, same N, same 24 pinned results,
same FIFA bracket, all matches neutral):

| host | pre-9F P(R16) | post-9F P(R16) | Δ pp | pre-9F P(title) | post-9F P(title) | Δ pp |
|---|---:|---:|---:|---:|---:|---:|
| Mexico | 46.6 % | 46.1 % | −0.5 | 0.34 % | 0.32 % | −0.02 |
| United States | 43.4 % | 45.5 % | +2.1 | 0.09 % | 0.16 % | +0.07 |
| Canada | 33.8 % | 37.7 % | +3.9 | 0.02 % | 0.12 % | +0.10 |

Mexico barely moves because Mexico was already Group A's clear
favourite at neutral; the home boost only sharpens P(1st) from ~57 % to
~60 %. USA gains the most R16 lift because USA was nearly tied with
Australia for Group D winner before 9F; the home term tips that close
call and USA becomes the clear Group D favourite. Canada gains the most
P(R16) lift because Group B is the tightest of the three host groups —
Canada moves from third-place candidate to clear runner-up.

Non-host title odds shift by **less than ±0.3 pp** across the board
(Spain +0.20, England +0.31, Argentina +0.13, Brazil −0.31), all
comfortably inside Monte-Carlo noise at N = 10 000. The byte-identity of
the underlying engine is what guarantees this — only the host-involving
group-stage calls change.

### 5.7 Known limitation that remains

The hosts' title ceiling is still capped because knockout matches stay
neutral. Implementing knockout host advantage would require a per-match
venue table keyed on each R32+ match position, which depends on FIFA's
published venue allocation and is currently out of scope.

## 6. Reproduce

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
