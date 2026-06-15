import type { HistoricalMatch } from '@/lib/data/history/parseHistoricalCsv';
import type { Predictor } from '@/lib/backtest/baselines';
import {
  fitDixonColesNational,
  type FitMatchNational,
} from './dcFitNational';
import {
  cloneParams,
  makeInitialParams,
  predictTripleNational,
  type DcParams,
} from './dixonColesNational';

// =============================================================================
// dcPredictorNational.ts
// =============================================================================
// Phase 9B — national-team adapter of the Phase 8B `dcPredictor`. Identical
// lazy-refit contract (one fit per calendar date, never peeking at the current
// match), but the underlying math and gradient gate the home-advantage term
// on the match's `neutral` flag.
//
// Match shape: HistoricalMatch (re-used so we can pipe the predictor through
// `runBacktest` from Phase 8C without forking the harness). Phase 9B added an
// optional `neutral?: boolean` field to that struct — when absent we treat
// the match as non-neutral, matching the EPL semantics.
// =============================================================================

export type DcPredictorNationalConfig = {
  xi: number;
  lambdaReg: number;
  maxIterationsCold?: number;
  maxIterationsWarm?: number;
  name?: string;
};

const MS_PER_DAY = 86_400_000;
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / MS_PER_DAY);
}

export interface DixonColesNationalPredictor extends Predictor {
  readonly stats: () => {
    refits: number;
    totalIterations: number;
    lastObjective: number;
    lastObjectives: ReadonlyArray<number>;
    teamsKnown: number;
    finalParams: DcParams | null;
  };
}

export function createDixonColesNationalPredictor(
  config: DcPredictorNationalConfig,
): DixonColesNationalPredictor {
  const teams: string[] = [];
  const teamLookup = new Map<string, number>();
  const buffered: Array<{
    homeIdx: number;
    awayIdx: number;
    homeGoals: number;
    awayGoals: number;
    dateIso: string;
    isNeutral: boolean;
  }> = [];

  let currentParams: DcParams | null = null;
  let lastFitDate: string | null = null;
  let lastObjectives: number[] = [];

  let refits = 0;
  let totalIterations = 0;
  let lastObjective = Number.NEGATIVE_INFINITY;

  function indexOf(team: string): number {
    let idx = teamLookup.get(team);
    if (idx == null) {
      idx = teams.length;
      teams.push(team);
      teamLookup.set(team, idx);
    }
    return idx;
  }

  function refit(fitDate: string): void {
    const nTeams = teams.length;
    if (nTeams === 0) return;
    const fitMatches: FitMatchNational[] = [];
    for (const m of buffered) {
      if (m.dateIso >= fitDate) continue;
      fitMatches.push({
        homeIdx: m.homeIdx,
        awayIdx: m.awayIdx,
        homeGoals: m.homeGoals,
        awayGoals: m.awayGoals,
        daysBeforeFit: daysBetween(m.dateIso, fitDate),
        isNeutral: m.isNeutral,
      });
    }
    if (fitMatches.length === 0) {
      currentParams = makeInitialParams(nTeams);
      lastObjectives = [];
      lastObjective = 0;
      return;
    }
    let initial: DcParams | undefined;
    if (currentParams != null) {
      const prev = cloneParams(currentParams);
      while (prev.att.length < nTeams) {
        prev.att.push(0);
        prev.def.push(0);
      }
      initial = prev;
    }
    const isCold = initial == null;
    const result = fitDixonColesNational(fitMatches, nTeams, {
      xi: config.xi,
      lambdaReg: config.lambdaReg,
      maxIterations: isCold
        ? config.maxIterationsCold ?? 500
        : config.maxIterationsWarm ?? 100,
      initial,
    });
    currentParams = result.params;
    lastObjectives = result.objectives;
    lastObjective = result.finalObjective;
    refits += 1;
    totalIterations += result.iterations;
  }

  return {
    name: config.name ?? 'dixon-coles-national',
    predict: (match: HistoricalMatch) => {
      const hIdx = indexOf(match.homeTeam);
      const aIdx = indexOf(match.awayTeam);
      const isNeutral = match.neutral === true;

      if (lastFitDate == null || match.dateIso !== lastFitDate) {
        refit(match.dateIso);
        lastFitDate = match.dateIso;
      }

      if (currentParams == null) {
        const third = 1 / 3;
        return [third, third, third] as const;
      }
      while (currentParams.att.length < teams.length) {
        currentParams.att.push(0);
        currentParams.def.push(0);
      }
      return predictTripleNational(currentParams, hIdx, aIdx, isNeutral);
    },
    observe: (match: HistoricalMatch) => {
      const homeIdx = indexOf(match.homeTeam);
      const awayIdx = indexOf(match.awayTeam);
      buffered.push({
        homeIdx,
        awayIdx,
        homeGoals: match.homeGoals,
        awayGoals: match.awayGoals,
        dateIso: match.dateIso,
        isNeutral: match.neutral === true,
      });
    },
    stats: () => ({
      refits,
      totalIterations,
      lastObjective,
      lastObjectives,
      teamsKnown: teams.length,
      finalParams: currentParams,
    }),
  };
}
