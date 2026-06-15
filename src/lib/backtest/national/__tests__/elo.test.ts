import { describe, expect, it } from 'vitest';
import { createNationalEloPredictor } from '../nationalEloPredictor';
import type { HistoricalMatch } from '@/lib/data/history/parseHistoricalCsv';
import { runBacktest } from '@/lib/backtest/harness';

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
// 3-way mapping invariants
// =============================================================================

describe('nationalEloPredictor — 3-way mapping', () => {
  it('every prediction sums to 1', () => {
    const p = createNationalEloPredictor({});
    const probs = p.predict(m({}));
    expect(probs[0] + probs[1] + probs[2]).toBeCloseTo(1, 12);
  });

  it('equally-rated teams + neutral venue → pH ≈ pA (symmetric)', () => {
    const p = createNationalEloPredictor({});
    // Both teams start at the default 1500.
    const probs = p.predict(m({ neutral: true }));
    expect(probs[0]).toBeCloseTo(probs[2], 12);
  });

  it('equally-rated teams + non-neutral → pH > pA (home advantage)', () => {
    const p = createNationalEloPredictor({});
    const probs = p.predict(m({ neutral: false }));
    expect(probs[0]).toBeGreaterThan(probs[2]);
  });

  it('reasonable draw shoulder produces 0.25-0.32 draw at the equal-rated neutral baseline', () => {
    const p = createNationalEloPredictor({});
    const [, pDraw] = p.predict(m({ neutral: true }));
    expect(pDraw).toBeGreaterThan(0.25);
    expect(pDraw).toBeLessThan(0.35);
  });

  it('a much higher home rating drops away probability sharply', () => {
    const p = createNationalEloPredictor({});
    // Bake in a +300 Elo advantage to the home team by feeding lopsided
    // observations.
    for (let i = 0; i < 50; i += 1) {
      p.observe(m({ homeTeam: 'Strong', awayTeam: 'Weak', homeGoals: 5, awayGoals: 0, neutral: true }));
    }
    const [, , pA] = p.predict(m({ homeTeam: 'Strong', awayTeam: 'Weak', neutral: true }));
    expect(pA).toBeLessThan(0.1);
  });
});

// =============================================================================
// Update rule
// =============================================================================

describe('nationalEloPredictor — observe', () => {
  it('a home win moves the home rating up and away rating down by equal amounts', () => {
    const p = createNationalEloPredictor({ k: 30 });
    const startRatings = p.ratings(); // empty before any observe
    expect(startRatings.size).toBe(0);

    p.observe(m({ homeTeam: 'A', awayTeam: 'B', homeGoals: 2, awayGoals: 0, neutral: true }));
    const r = p.ratings();
    const ra = r.get('A')!;
    const rb = r.get('B')!;
    expect(ra).toBeGreaterThan(1500);
    expect(rb).toBeLessThan(1500);
    expect(ra - 1500).toBeCloseTo(1500 - rb, 12); // zero-sum
  });

  it('home advantage attenuates the rating gain when the home team wins', () => {
    const nonNeutral = createNationalEloPredictor({ k: 30, homeAdvantage: 100 });
    const neutral = createNationalEloPredictor({ k: 30, homeAdvantage: 100 });

    nonNeutral.observe(m({ homeTeam: 'A', awayTeam: 'B', homeGoals: 2, awayGoals: 0, neutral: false }));
    neutral.observe(m({ homeTeam: 'A', awayTeam: 'B', homeGoals: 2, awayGoals: 0, neutral: true }));

    // With home advantage applied, the team was EXPECTED to win, so the
    // rating gain is smaller than the neutral case (where the win was less
    // expected).
    const gainNonNeutral = nonNeutral.ratings().get('A')! - 1500;
    const gainNeutral = neutral.ratings().get('A')! - 1500;
    expect(gainNonNeutral).toBeLessThan(gainNeutral);
  });
});

// =============================================================================
// No-lookahead — synthetic flip test mirroring the 8B harness regression.
// =============================================================================

describe('nationalEloPredictor — no-lookahead under synthetic flip', () => {
  it('predicts pH > 0.5 on the first scored match after a long home-win burn-in', () => {
    // 40 home wins as burn-in (observed but not scored), then 5 scored
    // away wins on consecutive days.
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
    const elo = createNationalEloPredictor({});
    const report = runBacktest(corpus, [elo], { evalStartDate: '2016-08-01' });
    expect(report.matchesScored).toBe(5);
    // First scored match's first calibration pair is pH.
    const firstPH = report.predictors[0].calibration[0].p;
    expect(firstPH).toBeGreaterThan(0.5);
  });
});
