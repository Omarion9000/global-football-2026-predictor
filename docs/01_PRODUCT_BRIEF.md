# 01 — Product Brief

## 1. Vision

World Cup 2026 Predictor is a full-stack football analytics platform that estimates the outcome probabilities of every FIFA World Cup 2026 match using transparent statistical modelling. It is built as a portfolio project to demonstrate end-to-end engineering: data ingestion, scheduled computation, statistical reasoning, persistence, and a polished user interface.

The product is an analytical companion, not a betting tool, not a streaming service, and not an official tournament app.

## 2. Problem

Around major tournaments, the public is exposed to predictions that are either opaque ("our experts say…"), commercially motivated (bookmaker odds), or hidden behind paywalled academic models. There is no widely available, transparent, and well-presented public dashboard that:

- shows every match in tournament order,
- continuously updates probabilities as kickoff approaches,
- explains where each probability comes from,
- and tracks its own accuracy after the fact.

This project addresses that gap.

## 3. Target users

- Football fans who want a clear, data-driven view of each match.
- Recruiters and engineers evaluating a portfolio-grade full-stack project.
- Analytics-curious users who want to understand how a prediction is constructed.

## 4. Core user experience

The user lands on a tournament schedule grouped by day. Each match card displays:

- Both teams and their flags.
- Venue and kickoff time in the user's local timezone.
- A live countdown to kickoff.
- Live status (scheduled, pre-match, in-progress, half-time, full-time).
- Predicted probabilities for home win, draw, and away win, plus the most likely scoreline range.
- The timestamp and version of the prediction shown.

A match detail view exposes the full prediction history (T-3h, T-1h, T-0, HT, FT), a breakdown of contributing factors (team rating, form, expected goals approximation, Monte Carlo distribution), and a post-match accuracy review once the match concludes.

## 5. Prediction lifecycle

Each match accumulates a sequence of stored predictions. Predictions are append-only — earlier runs are never overwritten:

| Marker | Trigger          | Purpose                                                  |
|--------|------------------|----------------------------------------------------------|
| T-3h   | 3 hours pre-KO   | Baseline prediction from ratings, form, xG approximation |
| T-1h   | 1 hour pre-KO    | Lineup-aware refinement when starting XI is announced    |
| T-0    | Kickoff          | Final pre-match snapshot                                 |
| HT     | Half-time        | In-play recalibration using observed first-half state    |
| FT     | Full-time        | Accuracy review and storage of evaluation metrics        |

This sequence is the spine of the product and the basis for the accuracy dashboard.

## 6. Non-goals

The following are explicitly out of scope:

- **No betting positioning.** No odds language, no stake suggestions, no affiliate links, no value-bet framing.
- **No unauthorised streams.** The app will never embed, link to, or describe how to access unlicensed video.
- **No copyrighted visual assets.** No marks, badges, kit designs, agency photographs, or commercial collectibles trade dress are used unless explicitly licensed. The full prohibited and permitted lists are defined in `docs/04_DATA_AND_LEGAL_POLICY.md` §3.1 and §3.2. Player cards, if introduced later, will be original "data cards" per §3.3 — custom styling only, no official frames.
- **No live commentary.** The product is analytical, not editorial.
- **No social or wagering features in v1.**

## 7. Success criteria

The project is considered successful when:

- Every scheduled World Cup 2026 match has a complete T-3h → FT prediction history stored.
- The accuracy dashboard reports calibrated Brier scores and log-loss against actual results.
- The statistical engine has unit-test coverage on its core components (rating updates, Poisson scoreline matrix, Monte Carlo tournament simulation).
- The interface is responsive, accessible, and visually polished enough to feature in a professional portfolio.
- All data sources used are properly attributed and within their licensed terms of use.

## 8. Tone and brand

Calm, analytical, modern. The visual language draws from data-journalism rather than sportsbook design. Typography-led, restrained colour palette, generous whitespace, motion used sparingly to communicate state changes.
