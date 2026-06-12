import { describe, expect, it } from 'vitest';
import {
  createMarketImpliedPredictor,
  createRollingHomeAdvantagePredictor,
  createUniformPredictor,
} from '../baselines';
import { EVAL_START_DATE, runBacktest } from '../harness';
import type { HistoricalMatch } from '@/lib/data/history/parseHistoricalCsv';

function m(overrides: Partial<HistoricalMatch>): HistoricalMatch {
  return {
    season: '2024-25',
    dateIso: '2024-08-16',
    homeTeam: 'Foo',
    awayTeam: 'Bar',
    homeGoals: 1,
    awayGoals: 0,
    ...overrides,
  };
}

// =============================================================================
// Burn-in: matches with dateIso < EVAL_START_DATE are observed but never scored.
// =============================================================================

describe('runBacktest — burn-in window', () => {
  it('observes pre-2016-08-01 matches but does not score them', () => {
    const burnIn: HistoricalMatch[] = [
      m({ season: '2015-16', dateIso: '2015-08-08' }),
      m({ season: '2015-16', dateIso: '2016-05-15' }),
    ];
    const scored: HistoricalMatch[] = [
      m({ season: '2016-17', dateIso: '2016-08-13' }),
      m({ season: '2016-17', dateIso: '2016-08-14' }),
    ];

    const rolling = createRollingHomeAdvantagePredictor();
    const report = runBacktest([...burnIn, ...scored], [rolling]);

    expect(report.matchesObserved).toBe(4);
    expect(report.matchesScored).toBe(2);
    const r = report.predictors[0];
    expect(r.overall.matchesScored).toBe(2);
    expect(r.bySeason.length).toBe(1);
    expect(r.bySeason[0].season).toBe('2016-17');
    expect(r.bySeason[0].matchesScored).toBe(2);
  });

  it('still updates rolling predictor state during burn-in', () => {
    // 50 burn-in home wins → rolling state strongly biased toward H. When we
    // hit the first scored match (a home win), the brier should be small,
    // not the burn-in-unaware ~0.667 a fresh predictor would produce.
    const burnIn: HistoricalMatch[] = [];
    for (let i = 0; i < 50; i += 1) {
      burnIn.push(
        m({
          season: '2015-16',
          dateIso: '2016-01-01',
          homeGoals: 2,
          awayGoals: 0,
        }),
      );
    }
    const scored: HistoricalMatch[] = [
      m({
        season: '2016-17',
        dateIso: '2016-08-13',
        homeGoals: 2,
        awayGoals: 0,
      }),
    ];
    const rolling = createRollingHomeAdvantagePredictor();
    const r = runBacktest([...burnIn, ...scored], [rolling]).predictors[0];
    // Brier on the scored match must be low because rolling now thinks H is
    // ~50/53 likely. (1 - 51/53)² + 2 × (1/53)²
    const expected = (1 - 51 / 53) ** 2 + 2 * (1 / 53) ** 2;
    expect(r.overall.brier).toBeCloseTo(expected, 9);
  });

  it('honours an overridden evalStartDate option', () => {
    const all: HistoricalMatch[] = [
      m({ season: '2015-16', dateIso: '2016-05-15' }),
      m({ season: '2016-17', dateIso: '2016-08-13' }),
    ];
    const rolling = createRollingHomeAdvantagePredictor();
    const r = runBacktest(all, [rolling], { evalStartDate: '2099-01-01' });
    expect(r.predictors[0].overall.matchesScored).toBe(0);
  });
});

// =============================================================================
// No-lookahead: every predictor's `predict` runs before any `observe`. We
// verify this by inserting a probe predictor that records its observation
// count at predict-time; the count must trail by exactly one match each step.
// =============================================================================

describe('runBacktest — no-lookahead order of operations', () => {
  it('calls every predictor.predict() before any predictor.observe() for a given match', () => {
    let observeCountAtPredict = -1;
    let observeCount = 0;
    const probe = {
      name: 'probe',
      predict: () => {
        // Record the observed count at the instant of prediction. If the
        // harness ever calls observe before predict on the same match, this
        // value would be exactly the index of the current match instead of
        // the index minus one.
        observeCountAtPredict = observeCount;
        return [1 / 3, 1 / 3, 1 / 3] as const;
      },
      observe: () => {
        observeCount += 1;
      },
    };
    const corpus: HistoricalMatch[] = [];
    for (let i = 0; i < 5; i += 1) {
      corpus.push(
        m({ season: '2016-17', dateIso: `2016-08-1${i}` }),
      );
    }
    // Use a second predictor whose observe is meaningful — verifies the
    // "every predict before any observe" rule across predictors too.
    const rolling = createRollingHomeAdvantagePredictor();
    runBacktest(corpus, [probe, rolling]);
    // After 5 matches, observeCount becomes 5. The LAST recorded value of
    // observeCountAtPredict must equal 4 — the count just before the 5th
    // observe.
    expect(observeCount).toBe(5);
    expect(observeCountAtPredict).toBe(4);
  });
});

// =============================================================================
// Cross-predictor symmetry: same matches in same order.
// =============================================================================

describe('runBacktest — multi-predictor accounting', () => {
  it('scores the same matches under each predictor', () => {
    const corpus: HistoricalMatch[] = [
      m({ season: '2016-17', dateIso: '2016-08-13', homeGoals: 1, awayGoals: 0 }),
      m({ season: '2016-17', dateIso: '2016-08-14', homeGoals: 0, awayGoals: 2 }),
      m({ season: '2016-17', dateIso: '2016-08-15', homeGoals: 1, awayGoals: 1 }),
    ];
    const u = createUniformPredictor();
    const r = createRollingHomeAdvantagePredictor();
    const mkt = createMarketImpliedPredictor();
    const report = runBacktest(corpus, [u, r, mkt]);
    for (const p of report.predictors) {
      expect(p.overall.matchesScored).toBe(3);
    }
  });

  it('uniform predictor scores exactly 2/3 Brier and ln(3) logLoss', () => {
    const corpus: HistoricalMatch[] = [
      m({ season: '2016-17', dateIso: '2016-08-13', homeGoals: 1, awayGoals: 0 }),
      m({ season: '2016-17', dateIso: '2016-08-14', homeGoals: 0, awayGoals: 2 }),
      m({ season: '2016-17', dateIso: '2016-08-15', homeGoals: 1, awayGoals: 1 }),
    ];
    const u = createUniformPredictor();
    const r = runBacktest(corpus, [u]).predictors[0];
    expect(r.overall.brier).toBeCloseTo(2 / 3, 12);
    expect(r.overall.logLoss).toBeCloseTo(Math.log(3), 12);
  });
});

// =============================================================================
// Pooled calibration pairs — 3 per scored match per predictor.
// =============================================================================

describe('runBacktest — calibration pairs', () => {
  it('produces exactly 3 × matchesScored pairs per predictor', () => {
    const corpus: HistoricalMatch[] = [];
    for (let i = 0; i < 17; i += 1) {
      corpus.push(
        m({
          season: '2016-17',
          dateIso: `2016-09-${(i + 1).toString().padStart(2, '0')}`,
          homeGoals: i % 3 === 0 ? 1 : i % 3 === 1 ? 0 : 2,
          awayGoals: i % 3 === 0 ? 0 : i % 3 === 1 ? 1 : 2,
        }),
      );
    }
    const u = createUniformPredictor();
    const r = runBacktest(corpus, [u]).predictors[0];
    expect(r.calibration.length).toBe(17 * 3);
  });
});

// =============================================================================
// Sanity: default EVAL_START_DATE.
// =============================================================================

describe('EVAL_START_DATE export', () => {
  it('is the documented 2016-08-01 burn-in cutoff', () => {
    expect(EVAL_START_DATE).toBe('2016-08-01');
  });
});
