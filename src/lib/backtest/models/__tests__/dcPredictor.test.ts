import { describe, expect, it } from 'vitest';
import type { HistoricalMatch } from '@/lib/data/history/parseHistoricalCsv';
import { runBacktest } from '@/lib/backtest/harness';
import { createDixonColesPredictor } from '../dcPredictor';

function m(overrides: Partial<HistoricalMatch>): HistoricalMatch {
  return {
    season: '2016-17',
    dateIso: '2016-08-13',
    homeTeam: 'A',
    awayTeam: 'B',
    homeGoals: 1,
    awayGoals: 0,
    ...overrides,
  };
}

// =============================================================================
// Lazy refit — at most one fit per calendar date.
// =============================================================================

describe('DixonColesPredictor — lazy refit boundary', () => {
  it('refits ONCE for two matches on the same date', () => {
    const p = createDixonColesPredictor({ xi: 0.002, lambdaReg: 1 });
    // Burn in a few matches first so the predictor actually has work to do
    // on the first scored date.
    p.observe(m({ dateIso: '2016-08-13', homeTeam: 'A', awayTeam: 'B', homeGoals: 2, awayGoals: 0 }));
    p.observe(m({ dateIso: '2016-08-14', homeTeam: 'C', awayTeam: 'D', homeGoals: 1, awayGoals: 1 }));
    p.observe(m({ dateIso: '2016-08-15', homeTeam: 'A', awayTeam: 'D', homeGoals: 0, awayGoals: 1 }));

    // Two predictions on the SAME new date.
    p.predict(m({ dateIso: '2016-08-20', homeTeam: 'A', awayTeam: 'C' }));
    const beforeSecond = p.stats().refits;
    p.predict(m({ dateIso: '2016-08-20', homeTeam: 'B', awayTeam: 'D' }));
    const afterSecond = p.stats().refits;
    expect(afterSecond).toBe(beforeSecond);
  });

  it('refits AGAIN once the date strictly advances', () => {
    const p = createDixonColesPredictor({ xi: 0.002, lambdaReg: 1 });
    p.observe(m({ dateIso: '2016-08-13', homeTeam: 'A', awayTeam: 'B', homeGoals: 2, awayGoals: 0 }));
    p.observe(m({ dateIso: '2016-08-14', homeTeam: 'C', awayTeam: 'D', homeGoals: 1, awayGoals: 1 }));

    p.predict(m({ dateIso: '2016-08-20', homeTeam: 'A', awayTeam: 'C' }));
    const after1 = p.stats().refits;
    p.predict(m({ dateIso: '2016-08-27', homeTeam: 'B', awayTeam: 'D' }));
    const after2 = p.stats().refits;
    expect(after2).toBe(after1 + 1);
  });
});

// =============================================================================
// No-lookahead synthetic flip — predictor's view at match k reflects only the
// first k observed matches. Verified by reusing the harness loop (which
// predicts BEFORE any observe) and asserting the predictor never "knew"
// about a future flip.
// =============================================================================

describe('DixonColesPredictor — no-lookahead under synthetic flip', () => {
  it('reflects only pre-k observations when home-win rate flips mid-stream', () => {
    // Burn-in window (dateIso < 2016-08-01) lets the predictor accumulate a
    // home-win prior, then the scored window flips to a stream of away wins.
    // If the predictor peeked at observe() during predict(), the scored
    // matches would show low pH; instead, the predictor lags by exactly one
    // observation and the first scored match retains pH > 0.5.
    const corpus: HistoricalMatch[] = [];
    for (let i = 0; i < 40; i += 1) {
      corpus.push(
        m({
          season: '2015-16',
          dateIso: `2016-0${2 + Math.floor(i / 20)}-${(i % 20 + 1).toString().padStart(2, '0')}`,
          homeTeam: i % 2 === 0 ? 'A' : 'C',
          awayTeam: i % 2 === 0 ? 'B' : 'D',
          homeGoals: 3,
          awayGoals: 0,
        }),
      );
    }
    // Scored window: 5 away-win matches on consecutive days.
    for (let i = 0; i < 5; i += 1) {
      corpus.push(
        m({
          season: '2016-17',
          dateIso: `2016-08-${(13 + i).toString().padStart(2, '0')}`,
          homeTeam: 'A',
          awayTeam: 'C',
          homeGoals: 0,
          awayGoals: 2,
        }),
      );
    }

    const dc = createDixonColesPredictor({ xi: 0.002, lambdaReg: 1 });
    const report = runBacktest(corpus, [dc]);
    // First scored prediction (after 40 burn-in home wins, before any scored
    // away win has been observed) should still favour H heavily.
    expect(report.matchesScored).toBe(5);
    // Check first scored match's calibration row: the first 3 calibration
    // pairs are (pH, hit:false / true(A) / etc). pH is the first pair's p.
    const firstPH = report.predictors[0].calibration[0].p;
    expect(firstPH).toBeGreaterThan(0.5);
  });
});

// =============================================================================
// Cold-start when both teams are new — predictor falls back to league average.
// =============================================================================

describe('DixonColesPredictor — cold start on newcomer teams', () => {
  it('returns a symmetric H≈A triple at α=δ=0 (Poisson(1,1) marginals)', () => {
    // No observe() calls yet — both teams unseen, all parameters at 0. The
    // predictor's λ_H = λ_A = exp(0) = 1, so by Poisson symmetry the home
    // and away win marginals match. The triple is NOT exactly [1/3,1/3,1/3]
    // (Poisson(1)×Poisson(1) renormalises over the 11×11 grid to ~0.346 /
    // ~0.308 / ~0.346) — see docs/16 §"cold-start limitations".
    const p = createDixonColesPredictor({ xi: 0.002, lambdaReg: 1 });
    const probs = p.predict(m({ dateIso: '2016-08-13', homeTeam: 'X', awayTeam: 'Y' }));
    expect(probs[0] + probs[1] + probs[2]).toBeCloseTo(1, 12);
    expect(probs[0]).toBeCloseTo(probs[2], 12); // symmetry: pH = pA at zero params
    // Sanity: draw probability is non-trivial (not the uniform 1/3).
    expect(probs[1]).toBeGreaterThan(0.25);
    expect(probs[1]).toBeLessThan(0.4);
  });

  it('returns a probability triple summing to 1 even when only one team is new', () => {
    const p = createDixonColesPredictor({ xi: 0.002, lambdaReg: 1 });
    for (let i = 0; i < 10; i += 1) {
      p.observe(m({ dateIso: '2016-07-01', homeTeam: 'A', awayTeam: 'B', homeGoals: 2, awayGoals: 0 }));
      p.observe(m({ dateIso: '2016-07-02', homeTeam: 'B', awayTeam: 'A', homeGoals: 0, awayGoals: 1 }));
    }
    const probs = p.predict(m({ dateIso: '2016-08-13', homeTeam: 'A', awayTeam: 'Z' }));
    expect(probs[0] + probs[1] + probs[2]).toBeCloseTo(1, 10);
  });
});
