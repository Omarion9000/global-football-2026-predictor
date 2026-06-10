import {
  MissingInputError,
  PREDICTION_RUN_TYPES,
  type PredictionInput,
  type PredictionOutput,
} from '@/lib/types';
import { makeRNG } from '@/lib/utils';
import { runMonteCarloSimulation } from '@/lib/simulation';
import {
  calculateConfidenceBand,
  calculateConfidenceScore,
  deriveConfidenceComponents,
} from './confidence';
import { calculateExpectedGoals } from './expectedGoals';
import {
  generateScorelineMatrix,
  marginalProbabilities,
  topScorelines,
} from './scorelines';
import {
  MC_ANALYTIC_DISAGREEMENT_THRESHOLD,
  MODEL_VERSION,
  MONTE_CARLO_ITERATIONS,
  TOP_N_SCORELINES,
} from './version';

export type PredictMatchOptions = {
  /** Overrides input.rngSeed. */
  seed?: number;
  /** Overrides MONTE_CARLO_ITERATIONS. */
  iterations?: number;
};

function validateInput(input: PredictionInput): void {
  const missing: string[] = [];
  if (input.fixture == null) missing.push('fixture');
  if (input.statsTeamA == null) missing.push('statsTeamA');
  if (input.statsTeamB == null) missing.push('statsTeamB');
  if (input.runType == null) missing.push('runType');
  if (input.modelVersion == null || input.modelVersion === '') {
    missing.push('modelVersion');
  }
  if (typeof input.rngSeed !== 'number' || !Number.isFinite(input.rngSeed)) {
    missing.push('rngSeed');
  }
  if (missing.length > 0) throw new MissingInputError(missing);

  if (!PREDICTION_RUN_TYPES.includes(input.runType)) {
    throw new MissingInputError([`runType (invalid value: ${String(input.runType)})`]);
  }
  if (input.statsTeamA.recentMatches == null) {
    throw new MissingInputError(['statsTeamA.recentMatches']);
  }
  if (input.statsTeamB.recentMatches == null) {
    throw new MissingInputError(['statsTeamB.recentMatches']);
  }
}

/**
 * The single entry point to the prediction engine. Pure: takes a typed input
 * and returns a typed PredictionOutput. Performs no network or DB I/O and
 * never logs to the console — advisory messages are returned in `warnings`
 * for the scheduler to write to model_runs.
 *
 * Determinism: identical input + identical seed produces byte-identical output.
 */
export function predictMatch(
  input: PredictionInput,
  options: PredictMatchOptions = {},
): PredictionOutput {
  validateInput(input);

  const warnings: string[] = [];

  // Surface run-type expectations as advisory warnings (not errors).
  if (
    (input.runType === 'T_MINUS_1H' || input.runType === 'T_ZERO') &&
    !input.lineupAvailable
  ) {
    warnings.push(`runType=${input.runType} expects lineup data; lineupAvailable=false`);
  }
  if (input.runType === 'HT' && !input.inPlayAvailable) {
    warnings.push('runType=HT expects in-play state; inPlayAvailable=false');
  }

  const seed = options.seed ?? input.rngSeed;
  const iterations = options.iterations ?? MONTE_CARLO_ITERATIONS;
  const rng = makeRNG(seed);

  // 1) Match-level expected goals
  const xg = calculateExpectedGoals(input);

  // 2) Analytic Poisson matrix (source of truth for headline marginals)
  const matrix = generateScorelineMatrix(xg.xgA, xg.xgB);
  const analytic = marginalProbabilities(matrix);
  const top = topScorelines(matrix, TOP_N_SCORELINES);

  // 3) Monte Carlo as a sanity check on the analytic marginals
  const mc = runMonteCarloSimulation(xg.xgA, xg.xgB, iterations, rng);
  const disagreement = Math.max(
    Math.abs(analytic.pTeamA - mc.teamAWinProbability),
    Math.abs(analytic.pDraw - mc.drawProbability),
    Math.abs(analytic.pTeamB - mc.teamBWinProbability),
  );
  if (disagreement > MC_ANALYTIC_DISAGREEMENT_THRESHOLD) {
    warnings.push(
      `Monte Carlo deviates from analytic marginals by ${(disagreement * 100).toFixed(2)}% ` +
        `(threshold ${(MC_ANALYTIC_DISAGREEMENT_THRESHOLD * 100).toFixed(1)}%); analytic values preferred for headline probabilities.`,
    );
  }

  // 4) Confidence
  const probabilityGap = Math.abs(analytic.pTeamA - analytic.pTeamB);
  const components = deriveConfidenceComponents(input, probabilityGap);
  const confidenceScore = calculateConfidenceScore(components);
  const confidenceBand = calculateConfidenceBand(confidenceScore);

  return {
    teamAWinProbability: analytic.pTeamA,
    drawProbability: analytic.pDraw,
    teamBWinProbability: analytic.pTeamB,
    teamAExpectedGoals: xg.xgA,
    teamBExpectedGoals: xg.xgB,
    topScorelines: top,
    confidenceScore,
    confidenceBand,
    warnings,
    modelVersion: MODEL_VERSION,
  };
}
