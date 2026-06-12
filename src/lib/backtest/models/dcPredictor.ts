// =============================================================================
// dcPredictor.ts
// =============================================================================
// Phase 8B — wraps the DC fitter into the harness predictor contract.
//
// Contract (matches src/lib/backtest/baselines.ts):
//   predict(match): [pH, pD, pA]  — must not mutate any other predictor's state
//   observe(match): void          — buffers the match for the next refit
//
// Lazy-refit policy:
//   * On the first predict() with date D, fit using every observed match
//     with dateIso < D.
//   * Subsequent predict() calls on the same date D reuse the cached fit.
//   * The first predict() with date D' > D re-fits using every observed
//     match with dateIso < D'.
//
// Strict no-lookahead: a match is added to the fit ONLY through observe(),
// and observe() is always called by the harness AFTER predict() (see
// harness.ts loop invariants).
// =============================================================================

import type { HistoricalMatch } from '@/lib/data/history/parseHistoricalCsv';
import type { Predictor } from '@/lib/backtest/baselines';
import { fitDixonColes, type FitMatch } from './dcFit';
import {
  cloneParams,
  makeInitialParams,
  predictTriple,
  type DcParams,
} from './dixonColes';

export type DcPredictorConfig = {
  /** Time-decay rate (per day). */
  xi: number;
  /** Ridge penalty. */
  lambdaReg: number;
  /** Cap on warm-start fit iterations. Cold-start (first fit) uses
   *  `maxIterationsCold`. */
  maxIterationsWarm?: number;
  maxIterationsCold?: number;
  /** Optional override of the predictor name (used by tuning grid). */
  name?: string;
};

const MS_PER_DAY = 86_400_000;

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / MS_PER_DAY);
}

export interface DixonColesPredictor extends Predictor {
  /** Diagnostic: total refits, total fit iterations summed, last fit objective.
   *  Used by the runner to enforce GATE D and report tuning convergence. */
  readonly stats: () => {
    refits: number;
    totalIterations: number;
    lastObjective: number;
    lastObjectives: ReadonlyArray<number>;
    teamsKnown: number;
    finalParams: DcParams | null;
  };
}

/**
 * Build a Dixon-Coles predictor with the harness contract. The returned
 * object's `predict` and `observe` mutate the predictor's INTERNAL state
 * only — no other predictor is affected.
 */
export function createDixonColesPredictor(
  config: DcPredictorConfig,
): DixonColesPredictor {
  const teams: string[] = [];
  const teamLookup = new Map<string, number>();
  const buffered: Array<{
    homeIdx: number;
    awayIdx: number;
    homeGoals: number;
    awayGoals: number;
    dateIso: string;
  }> = [];

  let currentParams: DcParams | null = null;
  /** Date the cached params were fitted for; null before the first fit. */
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
    // Only matches strictly before fitDate enter the buffer for this refit.
    const fitMatches: FitMatch[] = [];
    for (const m of buffered) {
      if (m.dateIso >= fitDate) continue;
      fitMatches.push({
        homeIdx: m.homeIdx,
        awayIdx: m.awayIdx,
        homeGoals: m.homeGoals,
        awayGoals: m.awayGoals,
        daysBeforeFit: daysBetween(m.dateIso, fitDate),
      });
    }
    if (fitMatches.length === 0) {
      currentParams = makeInitialParams(nTeams);
      lastObjectives = [];
      lastObjective = 0;
      return;
    }
    // Warm start: extend the previous params with zeros for newly-seen teams.
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
    const result = fitDixonColes(fitMatches, nTeams, {
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
    name: config.name ?? 'dixon-coles-v0.2-candidate',
    predict: (match: HistoricalMatch) => {
      // Ensure both teams are in the index so predict can address them even
      // when they're new to the model (cold start at α = δ = 0).
      const hIdx = indexOf(match.homeTeam);
      const aIdx = indexOf(match.awayTeam);

      // Lazy refit boundary: only when we see a strictly-newer date.
      if (lastFitDate == null || match.dateIso !== lastFitDate) {
        refit(match.dateIso);
        lastFitDate = match.dateIso;
      }

      if (currentParams == null) {
        // First fit had no eligible matches (buffer is empty / all
        // dateIso >= match.dateIso). Fall back to uniform.
        const third = 1 / 3;
        return [third, third, third] as const;
      }
      // Extend params to match the team index size if predict introduced new
      // teams between observe() and refit() (e.g. away team newly seen in the
      // SAME match used for the refit). They start at α=δ=0.
      while (currentParams.att.length < teams.length) {
        currentParams.att.push(0);
        currentParams.def.push(0);
      }
      return predictTriple(currentParams, hIdx, aIdx);
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
