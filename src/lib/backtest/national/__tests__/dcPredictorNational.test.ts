import { describe, expect, it } from 'vitest';
import type { HistoricalMatch } from '@/lib/data/history/parseHistoricalCsv';
import { runBacktest } from '@/lib/backtest/harness';
import { createDixonColesNationalPredictor } from '../dcPredictorNational';

function m(o: Partial<HistoricalMatch>): HistoricalMatch {
  return {
    season: '2024',
    dateIso: '2024-06-14',
    homeTeam: 'A',
    awayTeam: 'B',
    homeGoals: 1,
    awayGoals: 0,
    ...o,
  };
}

// =============================================================================
// Lazy refit — at most once per calendar date.
// =============================================================================

describe('DixonColesNationalPredictor — lazy refit boundary', () => {
  it('refits ONCE for two matches on the same date', () => {
    const p = createDixonColesNationalPredictor({ xi: 0.001, lambdaReg: 1 });
    p.observe(m({ dateIso: '2024-06-01', homeTeam: 'A', awayTeam: 'B', homeGoals: 2, awayGoals: 0, neutral: true }));
    p.observe(m({ dateIso: '2024-06-02', homeTeam: 'C', awayTeam: 'D', homeGoals: 1, awayGoals: 1, neutral: true }));
    p.predict(m({ dateIso: '2024-06-14', homeTeam: 'A', awayTeam: 'C' }));
    const after1 = p.stats().refits;
    p.predict(m({ dateIso: '2024-06-14', homeTeam: 'B', awayTeam: 'D' }));
    expect(p.stats().refits).toBe(after1);
  });

  it('refits AGAIN once the date strictly advances', () => {
    const p = createDixonColesNationalPredictor({ xi: 0.001, lambdaReg: 1 });
    p.observe(m({ dateIso: '2024-06-01', homeTeam: 'A', awayTeam: 'B', homeGoals: 2, awayGoals: 0 }));
    p.predict(m({ dateIso: '2024-06-14', homeTeam: 'A', awayTeam: 'B' }));
    const after1 = p.stats().refits;
    p.predict(m({ dateIso: '2024-06-15', homeTeam: 'A', awayTeam: 'B' }));
    expect(p.stats().refits).toBe(after1 + 1);
  });
});

// =============================================================================
// Synthetic flip — no lookahead on the national variant
// =============================================================================

describe('DixonColesNationalPredictor — no-lookahead under synthetic flip', () => {
  it('predicts pH > 0.5 on the first scored match after a long home-win burn-in', () => {
    const corpus: HistoricalMatch[] = [];
    for (let i = 0; i < 40; i += 1) {
      corpus.push(
        m({
          season: '2015',
          dateIso: `2016-0${2 + Math.floor(i / 20)}-${(i % 20 + 1).toString().padStart(2, '0')}`,
          homeTeam: 'A',
          awayTeam: 'B',
          homeGoals: 3,
          awayGoals: 0,
          neutral: true,
        }),
      );
    }
    for (let i = 0; i < 5; i += 1) {
      corpus.push(
        m({
          season: '2016',
          dateIso: `2016-08-${(13 + i).toString().padStart(2, '0')}`,
          homeTeam: 'A',
          awayTeam: 'B',
          homeGoals: 0,
          awayGoals: 2,
          neutral: true,
        }),
      );
    }
    const dc = createDixonColesNationalPredictor({ xi: 0.001, lambdaReg: 1 });
    const report = runBacktest(corpus, [dc], { evalStartDate: '2016-08-01' });
    expect(report.matchesScored).toBe(5);
    const firstPH = report.predictors[0].calibration[0].p;
    expect(firstPH).toBeGreaterThan(0.5);
  });
});

// =============================================================================
// Cold-start neutral vs non-neutral on a never-trained pair.
// =============================================================================

describe('DixonColesNationalPredictor — cold start', () => {
  it('all-zero params + neutral=true → triple sums to 1 and pH ≈ pA', () => {
    const p = createDixonColesNationalPredictor({ xi: 0.001, lambdaReg: 1 });
    const probs = p.predict(m({ neutral: true, homeTeam: 'X', awayTeam: 'Y' }));
    expect(probs[0] + probs[1] + probs[2]).toBeCloseTo(1, 12);
    expect(probs[0]).toBeCloseTo(probs[2], 12);
  });
});
