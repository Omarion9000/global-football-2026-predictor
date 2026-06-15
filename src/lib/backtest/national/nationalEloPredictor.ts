import type { HistoricalMatch } from '@/lib/data/history/parseHistoricalCsv';
import type { Predictor } from '@/lib/backtest/baselines';

// =============================================================================
// nationalEloPredictor.ts
// =============================================================================
// Phase 9B — standard Elo for national teams, with the same no-lookahead
// observe-then-update contract as the rolling-home-advantage predictor.
//
// Update rule (observe):
//   Let R_H, R_A be the current ratings; let h be the home-field bonus
//   (gated by the match's neutral flag — neutral matches contribute no h
//   to either side, mirroring the Dixon-Coles candidate).
//   Effective rating diff:   D = R_H − R_A + (neutral ? 0 : h)
//   Expected score (home):   E_H = 1 / (1 + 10^(−D / S))   where S = 400
//   Realised score:          0 (away win), 0.5 (draw), 1 (home win)
//   Symmetric update:        R_H ← R_H + K · (S_obs − E_H)
//                            R_A ← R_A − K · (S_obs − E_H)
//
// 3-way mapping (predict): standard extended-Elo with a draw shoulder d in
// Elo points. Let D̃ = (R_H − R_A) + (neutral ? 0 : h).
//   pH = 1 / (1 + 10^(−(D̃ − d) / S))   = P(D̃ exceeds +d)
//   pA = 1 / (1 + 10^(+(D̃ + d) / S))   = P(D̃ falls below −d)
//   pD = 1 − pH − pA                    = P(|D̃| ≤ d)
//
// With d ≈ 100 the draw shoulder produces ~25-30% draw probability at
// D̃ = 0, matching empirical international football draw rates.
//
// References:
//   - Elo, A. (1978) "The Rating of Chessplayers, Past and Present" (S = 400).
//   - Glickman, M. (1995) extension to soccer / 3-way outcomes.
//   - https://en.wikipedia.org/wiki/World_Football_Elo_Ratings (K + h ranges).
// =============================================================================

export type NationalEloConfig = {
  /** Starting Elo rating for unseen teams. Default: 1500 (Elo convention). */
  initialRating?: number;
  /** Step size on the rating update. Default: 30 (typical mid-range for
   *  national-team Elo systems). */
  k?: number;
  /** Home-field bonus in Elo points. Default: 65 (within the published
   *  international football range of 50-100). Gated by `neutral`. */
  homeAdvantage?: number;
  /** Draw shoulder in Elo points. Default: 100 (yields ~28 % draw probability
   *  at zero effective diff). */
  drawShoulder?: number;
  /** Logistic scale. Default: 400 (Elo convention). */
  scale?: number;
  /** Override the predictor name in reports. */
  name?: string;
};

export interface NationalEloPredictor extends Predictor {
  readonly stats: () => {
    teamsKnown: number;
    config: Required<Omit<NationalEloConfig, 'name'>>;
  };
  readonly ratings: () => Map<string, number>;
}

export function createNationalEloPredictor(
  config: NationalEloConfig = {},
): NationalEloPredictor {
  const cfg: Required<Omit<NationalEloConfig, 'name'>> = {
    initialRating: config.initialRating ?? 1500,
    k: config.k ?? 30,
    homeAdvantage: config.homeAdvantage ?? 65,
    drawShoulder: config.drawShoulder ?? 100,
    scale: config.scale ?? 400,
  };

  const ratings = new Map<string, number>();

  function ratingOf(team: string): number {
    let r = ratings.get(team);
    if (r == null) {
      r = cfg.initialRating;
      ratings.set(team, r);
    }
    return r;
  }

  function expectedHome(D: number): number {
    return 1 / (1 + Math.pow(10, -D / cfg.scale));
  }

  return {
    name: config.name ?? 'simple-elo',
    predict: (match: HistoricalMatch) => {
      const rH = ratingOf(match.homeTeam);
      const rA = ratingOf(match.awayTeam);
      const isNeutral = match.neutral === true;
      const D = rH - rA + (isNeutral ? 0 : cfg.homeAdvantage);

      // Extended Elo with draw shoulder.
      const pH = 1 / (1 + Math.pow(10, -(D - cfg.drawShoulder) / cfg.scale));
      const pA = 1 / (1 + Math.pow(10, (D + cfg.drawShoulder) / cfg.scale));
      let pD = 1 - pH - pA;
      // Numerical safety: floating-point can leave pD slightly negative when
      // the shoulder is small. Clip to 0 and renormalise. In practice this
      // never fires for d >= 50.
      if (pD < 0) pD = 0;
      const sum = pH + pD + pA;
      return [pH / sum, pD / sum, pA / sum] as const;
    },
    observe: (match: HistoricalMatch) => {
      const rH = ratingOf(match.homeTeam);
      const rA = ratingOf(match.awayTeam);
      const isNeutral = match.neutral === true;
      const D = rH - rA + (isNeutral ? 0 : cfg.homeAdvantage);

      // Realised score for the home team: 1 on win, 0.5 on draw, 0 on loss.
      let sObs: number;
      if (match.homeGoals > match.awayGoals) sObs = 1;
      else if (match.homeGoals < match.awayGoals) sObs = 0;
      else sObs = 0.5;

      const eH = expectedHome(D);
      const delta = cfg.k * (sObs - eH);
      ratings.set(match.homeTeam, rH + delta);
      ratings.set(match.awayTeam, rA - delta);
    },
    stats: () => ({ teamsKnown: ratings.size, config: cfg }),
    ratings: () => new Map(ratings),
  };
}
