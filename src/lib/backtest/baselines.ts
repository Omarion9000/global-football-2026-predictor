// =============================================================================
// baselines.ts (pure)
// =============================================================================
// Phase 8C — three predictor baselines:
//   - uniform: structural prior (1/3, 1/3, 1/3); pegs the worst tolerable
//     score the harness ever logs.
//   - rollingHomeAdvantage: prior over H/D/A frequencies, add-one smoothed
//     and updated ONLY by `observe()`. Demonstrates the "no peeking" rule.
//   - marketImplied: closing-line odds → implied probabilities, normalised
//     by proportional 1-step overround removal (a.k.a. the basic "shin
//     correction without favourite-longshot adjustment" — see notes in
//     docs/14). This is the well-known strong baseline; the engine has to
//     beat it on Brier and log-loss to claim non-trivial skill.
//
// All three are pure with respect to their own state (`observe` mutates the
// rolling-frequency counters; `predict` does not). No I/O, no Date.now().
// =============================================================================

import type { HistoricalMatch } from '@/lib/data/history/parseHistoricalCsv';
import type { Outcome, ProbTriple } from './metrics';

/** Stable predictor contract; `name` powers report rows. */
export interface Predictor {
  readonly name: string;
  /** Read-only prediction. MUST NOT mutate predictor state. */
  predict(match: HistoricalMatch): ProbTriple;
  /** State update from a realised match. MUST NOT touch any other predictor. */
  observe(match: HistoricalMatch): void;
}

/** Derive the realised outcome from raw goals. */
export function outcomeFromMatch(match: HistoricalMatch): Outcome {
  if (match.homeGoals > match.awayGoals) return 'H';
  if (match.homeGoals < match.awayGoals) return 'A';
  return 'D';
}

// =============================================================================
// Uniform — structural prior, no state.
// =============================================================================

export function createUniformPredictor(): Predictor {
  const third = 1 / 3;
  return {
    name: 'uniform',
    predict: () => [third, third, third] as const,
    observe: () => undefined,
  };
}

// =============================================================================
// Rolling home advantage — H/D/A frequencies of OBSERVED matches only.
// Add-one (Laplace) smoothing keeps every class strictly positive from match 1.
// =============================================================================

export function createRollingHomeAdvantagePredictor(): Predictor {
  // Counters tally OBSERVED matches only; predict() reads them but does not
  // touch the current match, satisfying the no-lookahead rule.
  let countH = 0;
  let countD = 0;
  let countA = 0;
  return {
    name: 'rolling-home-advantage',
    predict: () => {
      // Add-one smoothing: total denominator becomes (n + 3).
      const total = countH + countD + countA + 3;
      return [
        (countH + 1) / total,
        (countD + 1) / total,
        (countA + 1) / total,
      ] as const;
    },
    observe: (match: HistoricalMatch) => {
      const outcome = outcomeFromMatch(match);
      if (outcome === 'H') countH += 1;
      else if (outcome === 'D') countD += 1;
      else countA += 1;
    },
  };
}

// =============================================================================
// Market-implied — closing-line decimal odds → normalised implied probabilities.
// The bookmaker's overround Σ(1/oᵢ) is typically ~1.05; proportional
// normalisation divides each implied probability by that sum to recover a
// well-formed prior. See docs/14 for the standard discussion of why this is
// a strong baseline.
// =============================================================================

export type MarketStats = {
  /** Total matches predicted by the market path. */
  predictions: number;
  /** Matches where odds were missing or malformed and we fell back to uniform. */
  oddsFallback: number;
};

export interface MarketPredictor extends Predictor {
  readonly stats: () => MarketStats;
}

export function createMarketImpliedPredictor(): MarketPredictor {
  let predictions = 0;
  let oddsFallback = 0;
  const third = 1 / 3;

  return {
    name: 'market-implied',
    predict: (match: HistoricalMatch) => {
      predictions += 1;
      const odds = match.odds;
      // The corpus is 3800/3800 withOdds, so this branch is exercised only
      // by tests. Increment the fallback counter so the report can prove it.
      if (
        !odds ||
        !Number.isFinite(odds.home) ||
        !Number.isFinite(odds.draw) ||
        !Number.isFinite(odds.away) ||
        odds.home <= 1 ||
        odds.draw <= 1 ||
        odds.away <= 1
      ) {
        oddsFallback += 1;
        return [third, third, third] as const;
      }
      const iH = 1 / odds.home;
      const iD = 1 / odds.draw;
      const iA = 1 / odds.away;
      const sum = iH + iD + iA; // > 1 for any vig'd market
      return [iH / sum, iD / sum, iA / sum] as const;
    },
    observe: () => undefined,
    stats: () => ({ predictions, oddsFallback }),
  };
}
