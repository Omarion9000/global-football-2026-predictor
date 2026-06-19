import {
  fitDixonColesConfed,
  type FitMatchConfed,
} from '@/lib/backtest/national/dcFitConfed';
import {
  confederationIndex,
  scoreMatrixConfed,
  type DcConfedParams,
} from '@/lib/backtest/national/dixonColesConfed';
import { resolveNation } from '@/lib/data/sources/internationalResults/teamMap';
import type { RNG } from '@/lib/utils/rng';
import {
  sampleScoreline,
  type KnockoutOutcome,
  type MatchEngine,
} from './matchModel';

// =============================================================================
// matchModelConfed.ts
// =============================================================================
// Phase 9B.2 — confed-aware variant of matchModel.ts. Fits the Phase 9B.2
// dixon-coles-confed model once at simulator startup using the chosen
// hyperparameters (xi = 0.0005, lambdaReg = 1) and exposes the standard
// `MatchEngine` interface so simulate.ts can run with either model
// interchangeably.
// =============================================================================

/** Hyperparameters chosen by the Phase 9B.2 tuning grid. */
export const PHASE_9B2_CHOSEN = {
  xi: 0.0005,
  lambdaReg: 1,
} as const;

export type FittedModelConfed = {
  params: DcConfedParams;
  teamIndex: Map<string, number>;
  teamConfIdx: number[]; // confederation index per team (parallel to teamIndex order)
  refDate: string;
};

export type FitOptionsConfed = {
  xi?: number;
  lambdaReg?: number;
  lambdaRegConf?: number;
  maxIterations?: number;
  refDate?: string;
};

const MS_PER_DAY = 86_400_000;
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / MS_PER_DAY);
}

/** Fit the confed DC model once on the supplied historical corpus. Same
 *  semantics as matchModel.fitOnce but tracks each team's confederation. */
export function fitOnceConfed(
  matches: ReadonlyArray<{
    dateIso: string;
    homeTeam: string;
    awayTeam: string;
    homeGoals: number;
    awayGoals: number;
    neutral: boolean;
  }>,
  teamRoster: ReadonlyArray<string>,
  options: FitOptionsConfed = {},
): FittedModelConfed {
  const xi = options.xi ?? PHASE_9B2_CHOSEN.xi;
  const lambdaReg = options.lambdaReg ?? PHASE_9B2_CHOSEN.lambdaReg;
  const refDate =
    options.refDate ?? matches.reduce((latest, m) => (m.dateIso > latest ? m.dateIso : latest), '0000-01-01');

  const teamIndex = new Map<string, number>();
  const teamConfIdx: number[] = [];

  function indexOf(team: string): number {
    let idx = teamIndex.get(team);
    if (idx == null) {
      idx = teamIndex.size;
      teamIndex.set(team, idx);
      const canonical = resolveNation(team);
      teamConfIdx.push(confederationIndex(canonical.confederation));
    }
    return idx;
  }

  // Pre-register the tournament roster so cold-start teams get a slot at
  // α = δ = 0; their confederation is recorded too.
  for (const team of teamRoster) indexOf(team);
  for (const m of matches) {
    indexOf(m.homeTeam);
    indexOf(m.awayTeam);
  }

  const fitMatches: FitMatchConfed[] = matches.map((m) => ({
    homeIdx: teamIndex.get(m.homeTeam)!,
    awayIdx: teamIndex.get(m.awayTeam)!,
    homeConfIdx: teamConfIdx[teamIndex.get(m.homeTeam)!],
    awayConfIdx: teamConfIdx[teamIndex.get(m.awayTeam)!],
    homeGoals: m.homeGoals,
    awayGoals: m.awayGoals,
    daysBeforeFit: Math.max(0, daysBetween(m.dateIso, refDate)),
    isNeutral: m.neutral,
  }));

  const result = fitDixonColesConfed(fitMatches, teamIndex.size, {
    xi,
    lambdaReg,
    lambdaRegConf: options.lambdaRegConf,
    maxIterations: options.maxIterations ?? 500,
  });

  return { params: result.params, teamIndex, teamConfIdx, refDate };
}

export function modelStrengthConfed(model: FittedModelConfed, team: string): number {
  const idx = model.teamIndex.get(team);
  if (idx == null) return 0;
  // Same definition as 9B (α − δ); confederation strength is intentionally
  // EXCLUDED from the tiebreaker scalar so it stays comparable to 9B's
  // strength column and the docs/19 tiebreaker description.
  return model.params.att[idx] - model.params.def[idx];
}

export function scoreMatrixForConfed(
  model: FittedModelConfed,
  homeTeam: string,
  awayTeam: string,
  neutral: boolean = true,
): number[][] {
  const hIdx = model.teamIndex.get(homeTeam);
  const aIdx = model.teamIndex.get(awayTeam);
  if (hIdx == null || aIdx == null) {
    throw new Error(
      `scoreMatrixForConfed: unknown team "${hIdx == null ? homeTeam : awayTeam}".`,
    );
  }
  // Phase 9F: `neutral=false` is passed by the simulator only when a host
  // nation plays at home in the group stage. The confederation term still
  // fires either way because it is independent of homeAdv.
  return scoreMatrixConfed(
    model.params,
    hIdx,
    aIdx,
    model.teamConfIdx[hIdx],
    model.teamConfIdx[aIdx],
    neutral,
  );
}

const SHOOTOUT_SCALE = 0.5;

export function resolveKnockoutMatchConfed(
  model: FittedModelConfed,
  homeTeam: string,
  awayTeam: string,
  rng: RNG,
): KnockoutOutcome {
  const grid = scoreMatrixForConfed(model, homeTeam, awayTeam);
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
  const sH = modelStrengthConfed(model, homeTeam);
  const sA = modelStrengthConfed(model, awayTeam);
  const pHomeWinsShootout = 1 / (1 + Math.exp(-(sH - sA) / SHOOTOUT_SCALE));
  return {
    homeWon: rng() < pHomeWinsShootout,
    homeGoalsRegulation: reg.homeGoals,
    awayGoalsRegulation: reg.awayGoals,
    wentToExtraTime: true,
    wentToShootout: true,
  };
}

/** Build a model-agnostic engine that simulate.ts can drive. */
export function makeEngineConfed(model: FittedModelConfed): MatchEngine {
  return {
    scoreMatrixFor: (home, away, neutral) => scoreMatrixForConfed(model, home, away, neutral),
    modelStrength: (team) => modelStrengthConfed(model, team),
    resolveKnockoutMatch: (home, away, rng) => resolveKnockoutMatchConfed(model, home, away, rng),
  };
}
