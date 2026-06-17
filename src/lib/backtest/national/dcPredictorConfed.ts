import type { HistoricalMatch } from '@/lib/data/history/parseHistoricalCsv';
import type { Predictor } from '@/lib/backtest/baselines';
import {
  fitDixonColesConfed,
  type FitMatchConfed,
} from './dcFitConfed';
import {
  CONFEDERATIONS,
  cloneConfedParams,
  confederationIndex,
  makeInitialConfedParams,
  predictTripleConfed,
  type Confederation,
  type DcConfedParams,
} from './dixonColesConfed';
import { resolveNation } from '@/lib/data/sources/internationalResults/teamMap';

// =============================================================================
// dcPredictorConfed.ts
// =============================================================================
// Phase 9B.2 — lazy-refit predictor wrapping the confed-aware DC fit.
// Identical contract to dcPredictorNational (one fit per calendar date, no
// peeking at the current match) with two additions:
//
//   1. observe() / predict() resolve each team's confederation through the
//      Phase 9A teamMap. An unmapped team name throws — same hard-fail
//      contract as 9A.
//   2. The fitter receives a FitMatchConfed[] with the confederation indices
//      attached, so the gradient knows which conf[] partials each match
//      contributes to.
// =============================================================================

export type DcPredictorConfedConfig = {
  xi: number;
  lambdaReg: number;
  /** Ridge on conf[]. Default delegated to the fit (0.05). */
  lambdaRegConf?: number;
  maxIterationsCold?: number;
  maxIterationsWarm?: number;
  name?: string;
};

const MS_PER_DAY = 86_400_000;
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / MS_PER_DAY);
}

export interface DixonColesConfedPredictor extends Predictor {
  readonly stats: () => {
    refits: number;
    totalIterations: number;
    lastObjective: number;
    lastObjectives: ReadonlyArray<number>;
    teamsKnown: number;
    interconCount: number;
    finalParams: DcConfedParams | null;
    confLabels: ReadonlyArray<Confederation>;
  };
}

export function createDixonColesConfedPredictor(
  config: DcPredictorConfedConfig,
): DixonColesConfedPredictor {
  const teams: string[] = [];
  const teamLookup = new Map<string, number>();
  const teamConfIdx: number[] = []; // confederation index per team
  const buffered: Array<{
    homeIdx: number;
    awayIdx: number;
    homeConfIdx: number;
    awayConfIdx: number;
    homeGoals: number;
    awayGoals: number;
    dateIso: string;
    isNeutral: boolean;
  }> = [];

  let currentParams: DcConfedParams | null = null;
  let lastFitDate: string | null = null;
  let lastObjectives: number[] = [];

  let refits = 0;
  let totalIterations = 0;
  let lastObjective = Number.NEGATIVE_INFINITY;
  let interconCount = 0;

  function indexOf(teamName: string): number {
    let idx = teamLookup.get(teamName);
    if (idx == null) {
      idx = teams.length;
      teams.push(teamName);
      teamLookup.set(teamName, idx);
      // Resolve the team's confederation through the 9A canonical map.
      // resolveNation throws on unmapped names — same hard-fail contract.
      const canonical = resolveNation(teamName);
      teamConfIdx.push(confederationIndex(canonical.confederation));
    }
    return idx;
  }

  function refit(fitDate: string): void {
    const nTeams = teams.length;
    if (nTeams === 0) return;
    const fitMatches: FitMatchConfed[] = [];
    for (const m of buffered) {
      if (m.dateIso >= fitDate) continue;
      fitMatches.push({
        homeIdx: m.homeIdx,
        awayIdx: m.awayIdx,
        homeConfIdx: m.homeConfIdx,
        awayConfIdx: m.awayConfIdx,
        homeGoals: m.homeGoals,
        awayGoals: m.awayGoals,
        daysBeforeFit: daysBetween(m.dateIso, fitDate),
        isNeutral: m.isNeutral,
      });
    }
    if (fitMatches.length === 0) {
      currentParams = makeInitialConfedParams(nTeams);
      lastObjectives = [];
      lastObjective = 0;
      return;
    }
    let initial: DcConfedParams | undefined;
    if (currentParams != null) {
      const prev = cloneConfedParams(currentParams);
      while (prev.att.length < nTeams) {
        prev.att.push(0);
        prev.def.push(0);
      }
      initial = prev;
    }
    const isCold = initial == null;
    const result = fitDixonColesConfed(fitMatches, nTeams, {
      xi: config.xi,
      lambdaReg: config.lambdaReg,
      lambdaRegConf: config.lambdaRegConf,
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
    name: config.name ?? 'dixon-coles-confed',
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
      return predictTripleConfed(
        currentParams,
        hIdx, aIdx,
        teamConfIdx[hIdx], teamConfIdx[aIdx],
        isNeutral,
      );
    },
    observe: (match: HistoricalMatch) => {
      const homeIdx = indexOf(match.homeTeam);
      const awayIdx = indexOf(match.awayTeam);
      const homeConfIdx = teamConfIdx[homeIdx];
      const awayConfIdx = teamConfIdx[awayIdx];
      if (homeConfIdx !== awayConfIdx) interconCount += 1;
      buffered.push({
        homeIdx, awayIdx,
        homeConfIdx, awayConfIdx,
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
      interconCount,
      finalParams: currentParams,
      confLabels: CONFEDERATIONS,
    }),
  };
}
