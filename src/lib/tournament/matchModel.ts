import {
  fitDixonColesNational,
  type FitMatchNational,
} from '@/lib/backtest/national/dcFitNational';
import {
  scoreMatrixNational,
  type DcParams,
} from '@/lib/backtest/national/dixonColesNational';
import type { RNG } from '@/lib/utils/rng';

// =============================================================================
// matchModel.ts
// =============================================================================
// Phase 9C — wraps the Phase 9B DC fit + score-matrix sampler. Fitted once
// (`fitOnce`) at simulator startup using the chosen 9B hyperparameters and
// the full national-team corpus; afterwards every match is drawn from the
// frozen parameter set — no refits inside the Monte Carlo loop.
//
// Two responsibilities:
//   1. Sample a group-stage scoreline (can be a draw).
//   2. Resolve a knockout match (no draws allowed): if the regulation
//      scoreline is a draw, fall through to extra time then a penalty
//      coin-flip weighted by model strength.
// =============================================================================

/** Phase 9B chosen hyperparameters. Pinned here so the simulator's results
 *  are reproducible without re-running the Phase 9B tuning grid. */
export const PHASE_9B_CHOSEN = {
  xi: 0.0005,
  lambdaReg: 0.5,
} as const;

export type FittedModel = {
  params: DcParams;
  /** team slug → param index in params.att / params.def. */
  teamIndex: Map<string, number>;
  /** for diagnostic logging. */
  refDate: string;
};

export type FitOptions = {
  /** Override the chosen hyperparameters (tests pin different values). */
  xi?: number;
  lambdaReg?: number;
  /** Maximum iterations. Default 500. */
  maxIterations?: number;
  /** Reference date used for the time-decay computation. Default: latest
   *  match in `matches`. Matches with daysBeforeFit < 0 (future) are
   *  clamped to 0 so the weight maxes out at 1.0 rather than blowing up. */
  refDate?: string;
};

const MS_PER_DAY = 86_400_000;

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / MS_PER_DAY);
}

/**
 * Fit the DC model once on the supplied historical match corpus. Used by the
 * tournament simulator to load the 9B parameters into memory; afterwards the
 * simulator draws every match from this frozen `FittedModel`.
 */
export function fitOnce(
  matches: ReadonlyArray<{
    dateIso: string;
    homeTeam: string;
    awayTeam: string;
    homeGoals: number;
    awayGoals: number;
    neutral: boolean;
  }>,
  teamRoster: ReadonlyArray<string>,
  options: FitOptions = {},
): FittedModel {
  const xi = options.xi ?? PHASE_9B_CHOSEN.xi;
  const lambdaReg = options.lambdaReg ?? PHASE_9B_CHOSEN.lambdaReg;
  const refDate =
    options.refDate ?? matches.reduce((latest, m) => (m.dateIso > latest ? m.dateIso : latest), '0000-01-01');

  // Index teams. Roster includes any tournament teams (so cold-start nations
  // get a slot at α = δ = 0); we extend as more teams appear in matches.
  const teamIndex = new Map<string, number>();
  for (const team of teamRoster) {
    if (!teamIndex.has(team)) teamIndex.set(team, teamIndex.size);
  }
  for (const m of matches) {
    if (!teamIndex.has(m.homeTeam)) teamIndex.set(m.homeTeam, teamIndex.size);
    if (!teamIndex.has(m.awayTeam)) teamIndex.set(m.awayTeam, teamIndex.size);
  }

  const fitMatches: FitMatchNational[] = matches.map((m) => ({
    homeIdx: teamIndex.get(m.homeTeam)!,
    awayIdx: teamIndex.get(m.awayTeam)!,
    homeGoals: m.homeGoals,
    awayGoals: m.awayGoals,
    daysBeforeFit: Math.max(0, daysBetween(m.dateIso, refDate)),
    isNeutral: m.neutral,
  }));

  const result = fitDixonColesNational(fitMatches, teamIndex.size, {
    xi,
    lambdaReg,
    maxIterations: options.maxIterations ?? 500,
  });

  return { params: result.params, teamIndex, refDate };
}

/** Strength scalar used as the deterministic tiebreaker fallback in the
 *  group stage and best-third selection. Strength = αᵢ − δᵢ (attack minus
 *  defence in the fitted DC parameterisation). */
export function modelStrength(model: FittedModel, team: string): number {
  const idx = model.teamIndex.get(team);
  if (idx == null) return 0;
  return model.params.att[idx] - model.params.def[idx];
}

// =============================================================================
// MatchEngine — model-agnostic interface that simulate.ts depends on. The 9B
// implementation is built via `makeEngine(model)` below; the Phase 9B.2
// confed implementation lives in `matchModelConfed.ts` and exports a parallel
// `makeEngineConfed(model)`. Both produce the same shape, so simulate.ts can
// run with either model interchangeably.
// =============================================================================

export interface MatchEngine {
  /** Phase 9F: `neutral` defaults to `true` so existing call sites (knockout
   *  matches, non-host group matches) keep their neutral semantics. The
   *  simulator passes `neutral=false` for a host nation playing at home in
   *  the group stage; the math reduces to the same fitted homeAdv term that
   *  the Phase 9B predictor uses for venue-aware league matches. */
  scoreMatrixFor(homeTeam: string, awayTeam: string, neutral?: boolean): number[][];
  modelStrength(team: string): number;
  resolveKnockoutMatch(homeTeam: string, awayTeam: string, rng: RNG): KnockoutOutcome;
}

/** Build the (maxGoals+1)² score-probability matrix for one match.
 *
 *  Phase 9F: the simulator now passes `neutral=false` for host-at-home group
 *  matches (Mexico / Canada / USA). The matrix computation reduces to the
 *  same fitted homeAdv path the Phase 9B predictor uses for venue-aware
 *  matches — no new constant introduced. Knockouts continue to call this
 *  with the default `neutral=true`. */
export function scoreMatrixFor(
  model: FittedModel,
  homeTeam: string,
  awayTeam: string,
  neutral: boolean = true,
): number[][] {
  const hIdx = model.teamIndex.get(homeTeam);
  const aIdx = model.teamIndex.get(awayTeam);
  if (hIdx == null || aIdx == null) {
    throw new Error(
      `scoreMatrixFor: unknown team "${hIdx == null ? homeTeam : awayTeam}" — fit may have skipped this slug.`,
    );
  }
  return scoreMatrixNational(model.params, hIdx, aIdx, neutral);
}

/** Sample (homeGoals, awayGoals) from the score grid using a seedable RNG. */
export function sampleScoreline(
  grid: ReadonlyArray<ReadonlyArray<number>>,
  rng: RNG,
): { homeGoals: number; awayGoals: number } {
  const u = rng();
  let cum = 0;
  for (let x = 0; x < grid.length; x += 1) {
    for (let y = 0; y < grid[x].length; y += 1) {
      cum += grid[x][y];
      if (u <= cum) return { homeGoals: x, awayGoals: y };
    }
  }
  // Floating-point slack — fall through to (0, 0).
  return { homeGoals: 0, awayGoals: 0 };
}

/** Resolve a knockout match. The regulation scoreline is sampled from the
 *  DC grid; if it's a draw, extra time draws a second time. If still drawn,
 *  a penalty shootout coin flip is weighted by the model-strength delta:
 *
 *    p(home wins penalties) = sigmoid((strength_home − strength_away) / S)
 *
 *  with S = 0.5 (calibrated so that a ~0.5-strength gap produces ~73 %
 *  probability of the stronger team winning a shootout). Strength gaps in
 *  practice are typically < 0.4, so the sigmoid yields probabilities in
 *  roughly the [0.45, 0.55] band for evenly-matched sides — consistent with
 *  the observed real-world penalty-shootout coin-flippiness.
 */
export type KnockoutOutcome = {
  homeWon: boolean;
  /** The regulation goals; if drawn, we ALSO record ET + shootout. */
  homeGoalsRegulation: number;
  awayGoalsRegulation: number;
  wentToExtraTime: boolean;
  wentToShootout: boolean;
};

const SHOOTOUT_SCALE = 0.5;

/** Build a model-agnostic engine that simulate.ts can drive with the 9B
 *  `FittedModel`. The Phase 9B.2 confed variant exports a parallel
 *  `makeEngineConfed` for the confed-aware model. */
export function makeEngine(model: FittedModel): MatchEngine {
  return {
    scoreMatrixFor: (home, away, neutral) => scoreMatrixFor(model, home, away, neutral),
    modelStrength: (team) => modelStrength(model, team),
    resolveKnockoutMatch: (home, away, rng) => resolveKnockoutMatch(model, home, away, rng),
  };
}

export function resolveKnockoutMatch(
  model: FittedModel,
  homeTeam: string,
  awayTeam: string,
  rng: RNG,
): KnockoutOutcome {
  const grid = scoreMatrixFor(model, homeTeam, awayTeam);
  const reg = sampleScoreline(grid, rng);
  if (reg.homeGoals > reg.awayGoals) {
    return {
      homeWon: true,
      homeGoalsRegulation: reg.homeGoals,
      awayGoalsRegulation: reg.awayGoals,
      wentToExtraTime: false,
      wentToShootout: false,
    };
  }
  if (reg.homeGoals < reg.awayGoals) {
    return {
      homeWon: false,
      homeGoalsRegulation: reg.homeGoals,
      awayGoalsRegulation: reg.awayGoals,
      wentToExtraTime: false,
      wentToShootout: false,
    };
  }
  // Extra time — one more sample. If decisive, return.
  const et = sampleScoreline(grid, rng);
  if (et.homeGoals !== et.awayGoals) {
    return {
      homeWon: et.homeGoals > et.awayGoals,
      homeGoalsRegulation: reg.homeGoals,
      awayGoalsRegulation: reg.awayGoals,
      wentToExtraTime: true,
      wentToShootout: false,
    };
  }
  // Penalty shootout — sigmoid-weighted coin flip on strength delta.
  const sH = modelStrength(model, homeTeam);
  const sA = modelStrength(model, awayTeam);
  const pHomeWinsShootout = 1 / (1 + Math.exp(-(sH - sA) / SHOOTOUT_SCALE));
  return {
    homeWon: rng() < pHomeWinsShootout,
    homeGoalsRegulation: reg.homeGoals,
    awayGoalsRegulation: reg.awayGoals,
    wentToExtraTime: true,
    wentToShootout: true,
  };
}
