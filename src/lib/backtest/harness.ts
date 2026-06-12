// =============================================================================
// harness.ts (pure)
// =============================================================================
// Phase 8C — chronological backtest harness. Pure with respect to its inputs:
// the caller supplies the corpus and the predictor list; the harness returns
// per-predictor metrics + pooled calibration pairs. No I/O.
//
// Loop invariants (the contract upstream tests verify):
//   1. For every match, EVERY predictor's `predict()` is called BEFORE any
//      `observe()`. This is the no-lookahead guarantee — a predictor that
//      caches state in its `predict` call cannot accidentally read the
//      current match's outcome through another predictor's `observe`.
//   2. Burn-in: matches with dateIso < EVAL_START_DATE are still observed
//      (so predictors that need history converge before scoring) but never
//      scored.
//   3. Calibration pairs pool every class prediction — a match with outcome
//      'H' contributes {p:pH,hit:true}, {p:pD,hit:false}, {p:pA,hit:false}.
// =============================================================================

import type { HistoricalMatch } from '@/lib/data/history/parseHistoricalCsv';
import {
  argmaxOutcome,
  logLoss,
  multiclassBrier,
  type CalibrationPair,
} from './metrics';
import { outcomeFromMatch, type Predictor } from './baselines';

/** ISO date — matches at or after this date are scored. Older matches are
 *  observed (state updates only) so rolling predictors converge first. */
export const EVAL_START_DATE = '2016-08-01' as const;

export type SeasonMetrics = {
  season: string;
  matchesScored: number;
  brier: number;
  logLoss: number;
  accuracy: number;
};

export type PredictorReport = {
  name: string;
  overall: Omit<SeasonMetrics, 'season'>;
  bySeason: SeasonMetrics[];
  calibration: ReadonlyArray<CalibrationPair>;
};

type Acc = {
  brierSum: number;
  logLossSum: number;
  correct: number;
  matches: number;
};

function emptyAcc(): Acc {
  return { brierSum: 0, logLossSum: 0, correct: 0, matches: 0 };
}

function accToMetrics(acc: Acc): Omit<SeasonMetrics, 'season'> {
  if (acc.matches === 0) {
    return { matchesScored: 0, brier: 0, logLoss: 0, accuracy: 0 };
  }
  return {
    matchesScored: acc.matches,
    brier: acc.brierSum / acc.matches,
    logLoss: acc.logLossSum / acc.matches,
    accuracy: acc.correct / acc.matches,
  };
}

export type RunOptions = {
  /** Override the burn-in cutoff. Defaults to EVAL_START_DATE. Matches with
   *  dateIso < this value are observed but not scored. */
  evalStartDate?: string;
  /** Optional upper bound on the evaluation window. Matches with
   *  dateIso >= this value are observed but not scored. Used by Phase 8B
   *  tuning to score ONLY validation seasons. Default: unbounded. */
  evalEndDate?: string;
};

export type HarnessReport = {
  /** Cutoff used to separate burn-in from evaluation. */
  evalStartDate: string;
  /** Total matches in the corpus (observed by every predictor). */
  matchesObserved: number;
  /** Subset scored (dateIso >= evalStartDate). */
  matchesScored: number;
  predictors: PredictorReport[];
};

/**
 * Run the backtest. `corpus` is consumed in chronological order; the function
 * does not re-sort it — the corpus loader is expected to have already done so
 * (build-history.ts emits matches sorted ASC by dateIso).
 *
 * Returns one PredictorReport per predictor, with overall + per-season metrics
 * and the pooled calibration pairs. Predictors are evaluated against the same
 * matches in the same order, so cross-predictor comparison is apples-to-apples.
 */
export function runBacktest(
  corpus: ReadonlyArray<HistoricalMatch>,
  predictors: ReadonlyArray<Predictor>,
  options: RunOptions = {},
): HarnessReport {
  const evalStartDate = options.evalStartDate ?? EVAL_START_DATE;
  const evalEndDate = options.evalEndDate ?? null;

  // Per-predictor accumulators (overall + per-season).
  const overall: Acc[] = predictors.map(() => emptyAcc());
  const bySeason: Array<Map<string, Acc>> = predictors.map(() => new Map());
  const calibration: CalibrationPair[][] = predictors.map(() => []);

  for (const match of corpus) {
    // Step 1: every predictor predicts BEFORE any observes.
    const predictions = predictors.map((p) => p.predict(match));

    // Step 2: every predictor observes the realised outcome.
    for (const p of predictors) p.observe(match);

    // Step 3: skip scoring outside the [evalStartDate, evalEndDate) window.
    if (match.dateIso < evalStartDate) continue;
    if (evalEndDate != null && match.dateIso >= evalEndDate) continue;

    const outcome = outcomeFromMatch(match);
    for (let i = 0; i < predictors.length; i += 1) {
      const probs = predictions[i];
      const b = multiclassBrier(probs, outcome);
      const l = logLoss(probs, outcome);
      const guessed = argmaxOutcome(probs);
      const correct = guessed === outcome ? 1 : 0;

      // Overall.
      const acc = overall[i];
      acc.brierSum += b;
      acc.logLossSum += l;
      acc.correct += correct;
      acc.matches += 1;

      // Per season.
      const seasonAcc = bySeason[i].get(match.season) ?? emptyAcc();
      seasonAcc.brierSum += b;
      seasonAcc.logLossSum += l;
      seasonAcc.correct += correct;
      seasonAcc.matches += 1;
      bySeason[i].set(match.season, seasonAcc);

      // Calibration pairs — three per match, one per class.
      const [pH, pD, pA] = probs;
      calibration[i].push({ p: pH, hit: outcome === 'H' });
      calibration[i].push({ p: pD, hit: outcome === 'D' });
      calibration[i].push({ p: pA, hit: outcome === 'A' });
    }
  }

  let scored = 0;
  for (const match of corpus) {
    if (match.dateIso < evalStartDate) continue;
    if (evalEndDate != null && match.dateIso >= evalEndDate) continue;
    scored += 1;
  }

  const reports: PredictorReport[] = predictors.map((p, i) => {
    const seasons = [...bySeason[i].entries()]
      .map(([season, acc]) => ({ season, ...accToMetrics(acc) }))
      .sort((a, b) => a.season.localeCompare(b.season));
    return {
      name: p.name,
      overall: accToMetrics(overall[i]),
      bySeason: seasons,
      calibration: calibration[i],
    };
  });

  return {
    evalStartDate,
    matchesObserved: corpus.length,
    matchesScored: scored,
    predictors: reports,
  };
}
