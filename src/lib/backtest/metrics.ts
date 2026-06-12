// =============================================================================
// metrics.ts (pure)
// =============================================================================
// Phase 8C — scoring primitives for the offline backtest. All functions are
// total pure functions with no I/O. Probability triples are expected as the
// canonical [home, draw, away] ordering, summing to within 1e-6 of 1.0; any
// caller violating that invariant raises (it is a programmer bug, not a data
// issue, since the predictor contract requires normalisation upstream).
//
// References
//   - Multiclass Brier: Sum-of-squares formulation, see Brier (1950).
//   - Log-loss clamp: 1e-12 is conventional in scikit-learn's
//     `log_loss(eps='auto')` and survives floating-point underflow safely.
// =============================================================================

export type Outcome = 'H' | 'D' | 'A';

export type ProbTriple = readonly [number, number, number];

export type CalibrationPair = { p: number; hit: boolean };

export type CalibrationBin = {
  meanPredicted: number;
  empiricalRate: number;
  count: number;
};

/** Default log-loss clamp. Below this value the term becomes -log(eps). */
export const LOG_LOSS_EPS = 1e-12;

/** Tolerance for the "probabilities sum to 1" invariant assertion. */
export const PROB_SUM_TOLERANCE = 1e-6;

function assertProbTriple(probs: ProbTriple): void {
  const [h, d, a] = probs;
  if (
    !Number.isFinite(h) ||
    !Number.isFinite(d) ||
    !Number.isFinite(a) ||
    h < 0 ||
    d < 0 ||
    a < 0
  ) {
    throw new Error(
      `metrics: probability triple must be finite and non-negative; got [${h}, ${d}, ${a}]`,
    );
  }
  const sum = h + d + a;
  if (Math.abs(sum - 1) > PROB_SUM_TOLERANCE) {
    throw new Error(
      `metrics: probability triple must sum to 1 within ${PROB_SUM_TOLERANCE}; got ${sum}`,
    );
  }
}

/** Convert an outcome label to its one-hot triple. */
export function outcomeOneHot(outcome: Outcome): ProbTriple {
  switch (outcome) {
    case 'H':
      return [1, 0, 0];
    case 'D':
      return [0, 1, 0];
    case 'A':
      return [0, 0, 1];
  }
}

/**
 * Multiclass Brier score for a 1-of-3 outcome: Σ (p_i − o_i)².
 *   Best  (perfect prediction): 0
 *   Worst (confident wrong):    2
 *   Uniform [1/3,1/3,1/3]:      2/3 ≈ 0.66667
 */
export function multiclassBrier(probs: ProbTriple, outcome: Outcome): number {
  assertProbTriple(probs);
  const [h, d, a] = probs;
  const [oh, od, oa] = outcomeOneHot(outcome);
  return (h - oh) ** 2 + (d - od) ** 2 + (a - oa) ** 2;
}

/**
 * Negative log-likelihood for the observed outcome. The probability of the
 * realised class is clamped to [LOG_LOSS_EPS, 1] before taking the log so a
 * zero-probability surprise produces a large but finite penalty instead of
 * −Infinity.
 *   Best:                       0
 *   Uniform [1/3,1/3,1/3]:      ln(3) ≈ 1.09861
 *   Confidently wrong (p→0):    ~27.6 (−ln(1e-12))
 */
export function logLoss(probs: ProbTriple, outcome: Outcome): number {
  assertProbTriple(probs);
  const [h, d, a] = probs;
  const p = outcome === 'H' ? h : outcome === 'D' ? d : a;
  const clamped = Math.max(p, LOG_LOSS_EPS);
  return -Math.log(clamped);
}

/** Index of the largest component; ties break to the lower index. */
export function argmaxOutcome(probs: ProbTriple): Outcome {
  assertProbTriple(probs);
  const [h, d, a] = probs;
  if (h >= d && h >= a) return 'H';
  if (d >= a) return 'D';
  return 'A';
}

/**
 * Reliability-diagram bins for a pooled set of {predicted, hit} pairs. The
 * range [0, 1] is partitioned into `bins` left-closed / right-open intervals,
 * with the final bin's right edge inclusive so a probability of exactly 1 ends
 * up in the last bin rather than out-of-range.
 *
 * Empty bins are returned as { meanPredicted: 0, empiricalRate: 0, count: 0 }.
 */
export function calibrationBins(
  pairs: ReadonlyArray<CalibrationPair>,
  bins = 10,
): CalibrationBin[] {
  if (!Number.isInteger(bins) || bins < 1) {
    throw new Error(`calibrationBins: bins must be a positive integer, got ${bins}`);
  }
  const sums: number[] = new Array(bins).fill(0);
  const hits: number[] = new Array(bins).fill(0);
  const counts: number[] = new Array(bins).fill(0);

  for (const { p, hit } of pairs) {
    if (!Number.isFinite(p) || p < 0 || p > 1) {
      throw new Error(`calibrationBins: each p must lie in [0,1]; got ${p}`);
    }
    const raw = Math.floor(p * bins);
    const idx = raw >= bins ? bins - 1 : raw; // p === 1 → last bin
    sums[idx] += p;
    counts[idx] += 1;
    if (hit) hits[idx] += 1;
  }

  const out: CalibrationBin[] = [];
  for (let i = 0; i < bins; i += 1) {
    const count = counts[i];
    if (count === 0) {
      out.push({ meanPredicted: 0, empiricalRate: 0, count: 0 });
    } else {
      out.push({
        meanPredicted: sums[i] / count,
        empiricalRate: hits[i] / count,
        count,
      });
    }
  }
  return out;
}
