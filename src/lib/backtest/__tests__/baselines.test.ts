import { describe, expect, it } from 'vitest';
import {
  createMarketImpliedPredictor,
  createRollingHomeAdvantagePredictor,
  createUniformPredictor,
  outcomeFromMatch,
} from '../baselines';
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
// Uniform
// =============================================================================

describe('createUniformPredictor', () => {
  it('always returns [1/3, 1/3, 1/3]', () => {
    const p = createUniformPredictor();
    const probs = p.predict(m({}));
    expect(probs[0]).toBeCloseTo(1 / 3, 12);
    expect(probs[1]).toBeCloseTo(1 / 3, 12);
    expect(probs[2]).toBeCloseTo(1 / 3, 12);
    expect(probs[0] + probs[1] + probs[2]).toBeCloseTo(1, 12);
  });

  it('observe is a no-op (predict stays uniform after thousands of observations)', () => {
    const p = createUniformPredictor();
    for (let i = 0; i < 1000; i += 1) p.observe(m({ homeGoals: 5, awayGoals: 0 }));
    expect(p.predict(m({}))).toEqual([1 / 3, 1 / 3, 1 / 3]);
  });
});

// =============================================================================
// Rolling home advantage
// =============================================================================

describe('createRollingHomeAdvantagePredictor', () => {
  it('seeds at [1/3, 1/3, 1/3] before any observations (add-one smoothing)', () => {
    const p = createRollingHomeAdvantagePredictor();
    const probs = p.predict(m({}));
    expect(probs[0]).toBeCloseTo(1 / 3, 12);
    expect(probs[1]).toBeCloseTo(1 / 3, 12);
    expect(probs[2]).toBeCloseTo(1 / 3, 12);
  });

  it('shifts toward H after a stream of home wins', () => {
    const p = createRollingHomeAdvantagePredictor();
    for (let i = 0; i < 100; i += 1) p.observe(m({ homeGoals: 2, awayGoals: 0 }));
    const [h, d, a] = p.predict(m({}));
    expect(h).toBeGreaterThan(0.9);
    expect(d).toBeLessThan(0.05);
    expect(a).toBeLessThan(0.05);
    expect(h + d + a).toBeCloseTo(1, 12);
  });

  it('does not peek at the current match — predict at observation k reflects only k-1 observations', () => {
    // Synthetic corpus whose home-win rate flips drastically mid-stream:
    // first 50 are all home wins, next 50 are all away wins. predict at
    // index k must reflect ONLY the first k observations, never index k.
    const p = createRollingHomeAdvantagePredictor();
    const corpus: HistoricalMatch[] = [];
    for (let i = 0; i < 50; i += 1) corpus.push(m({ homeGoals: 2, awayGoals: 0 }));
    for (let i = 0; i < 50; i += 1) corpus.push(m({ homeGoals: 0, awayGoals: 2 }));

    const predictions: Array<readonly number[]> = [];
    for (const match of corpus) {
      predictions.push(p.predict(match));
      p.observe(match);
    }

    // Prediction at match 0: no observations yet, uniform.
    expect(predictions[0][0]).toBeCloseTo(1 / 3, 12);

    // Prediction at match 50 (just after the flip): every prior observation
    // was a home win → H probability dominates. If observe leaked into
    // predict, this would already include the first away win.
    const [h50, , a50] = predictions[50];
    expect(h50).toBeGreaterThan(0.9);
    expect(a50).toBeLessThan(0.05);

    // Prediction at match 99 (final): observations are 50 H + 49 A so far,
    // so H probability is just above 1/2 (with add-one smoothing).
    const [h99, , a99] = predictions[99];
    expect(h99).toBeCloseTo((50 + 1) / (99 + 3), 6);
    expect(a99).toBeCloseTo((49 + 1) / (99 + 3), 6);
  });
});

// =============================================================================
// Market implied — normalisation + fallback counter.
// =============================================================================

describe('createMarketImpliedPredictor', () => {
  it('normalises a synthetic 7% overround to a probability triple summing to 1', () => {
    // Overround = 1/2 + 1/4 + 1/4.27... = ~1.07. Use clean numbers: pick odds
    // such that the raw implied probabilities sum to exactly 1.07.
    // 1/oH + 1/oD + 1/oA = 1.07 with components 0.50, 0.30, 0.27
    // → oH=2, oD=10/3, oA=1/0.27
    const odds = { home: 1 / 0.5, draw: 1 / 0.3, away: 1 / 0.27 };
    const sumRaw = 1 / odds.home + 1 / odds.draw + 1 / odds.away;
    expect(sumRaw).toBeCloseTo(1.07, 12);

    const p = createMarketImpliedPredictor();
    const [h, d, a] = p.predict(m({ odds }));
    expect(h + d + a).toBeCloseTo(1, 12);
    expect(h).toBeCloseTo(0.5 / 1.07, 12);
    expect(d).toBeCloseTo(0.3 / 1.07, 12);
    expect(a).toBeCloseTo(0.27 / 1.07, 12);
  });

  it('removes the standard ~5% overround for a real match', () => {
    // Recreate the Man United v Fulham row from the 2024-25 sample.
    const odds = { home: 1.6, draw: 4.2, away: 5.25 };
    const sumRaw = 1 / 1.6 + 1 / 4.2 + 1 / 5.25;
    expect(sumRaw).toBeGreaterThan(1.04);
    expect(sumRaw).toBeLessThan(1.07);

    const p = createMarketImpliedPredictor();
    const [h, d, a] = p.predict(m({ odds }));
    expect(h + d + a).toBeCloseTo(1, 12);
    // Sanity: home is clearly favoured.
    expect(h).toBeGreaterThan(d);
    expect(h).toBeGreaterThan(a);
  });

  it('falls back to uniform and increments oddsFallback when odds are missing', () => {
    const p = createMarketImpliedPredictor();
    const probs = p.predict(m({ odds: undefined }));
    expect(probs[0]).toBeCloseTo(1 / 3, 12);
    expect(p.stats()).toEqual({ predictions: 1, oddsFallback: 1 });
  });

  it('falls back to uniform when an odds component is non-finite', () => {
    const p = createMarketImpliedPredictor();
    p.predict(m({ odds: { home: NaN, draw: 4, away: 4 } }));
    expect(p.stats().oddsFallback).toBe(1);
  });

  it('falls back to uniform when an odds component is <= 1 (book error)', () => {
    const p = createMarketImpliedPredictor();
    p.predict(m({ odds: { home: 0.9, draw: 4, away: 4 } }));
    expect(p.stats().oddsFallback).toBe(1);
  });

  it('counts every prediction call in stats.predictions', () => {
    const p = createMarketImpliedPredictor();
    for (let i = 0; i < 7; i += 1) p.predict(m({ odds: { home: 2, draw: 4, away: 4 } }));
    expect(p.stats()).toEqual({ predictions: 7, oddsFallback: 0 });
  });
});

// =============================================================================
// outcomeFromMatch — H / D / A derivation.
// =============================================================================

describe('outcomeFromMatch', () => {
  it('returns H when home goals > away goals', () => {
    expect(outcomeFromMatch(m({ homeGoals: 2, awayGoals: 1 }))).toBe('H');
  });
  it('returns A when away goals > home goals', () => {
    expect(outcomeFromMatch(m({ homeGoals: 0, awayGoals: 1 }))).toBe('A');
  });
  it('returns D on a draw', () => {
    expect(outcomeFromMatch(m({ homeGoals: 2, awayGoals: 2 }))).toBe('D');
    expect(outcomeFromMatch(m({ homeGoals: 0, awayGoals: 0 }))).toBe('D');
  });
});
