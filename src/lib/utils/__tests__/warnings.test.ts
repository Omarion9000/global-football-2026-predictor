import { describe, expect, it } from 'vitest';
import { humanizeWarning, humanizeWarnings } from '../warnings';

describe('humanizeWarning', () => {
  it('maps a missing-lineup warning to friendly copy with caution kind', () => {
    const raw =
      'runType=T_MINUS_1H expects lineup data; lineupAvailable=false';
    const h = humanizeWarning(raw);
    expect(h.title).toBe('Lineup data unavailable');
    expect(h.body).toMatch(/Starting lineups/);
    expect(h.kind).toBe('caution');
    expect(h.raw).toBe(raw);
  });

  it('maps a missing in-play warning to a half-time message', () => {
    const raw = 'runType=HT expects in-play state; inPlayAvailable=false';
    const h = humanizeWarning(raw);
    expect(h.title).toBe('In-play data unavailable');
    expect(h.body).toMatch(/half-time recalibration/);
    expect(h.kind).toBe('caution');
  });

  it('maps a Monte Carlo divergence note to an info-kind message', () => {
    const raw =
      'Monte Carlo deviates from analytic marginals by 1.80% (threshold 1.5%); analytic values preferred for headline probabilities.';
    const h = humanizeWarning(raw);
    expect(h.title).toBe('Simulator note');
    expect(h.body).toMatch(/analytic values/);
    expect(h.kind).toBe('info');
  });

  it('falls back to a generic "Model note" for unknown shapes', () => {
    const raw = 'something unexpected from the engine';
    const h = humanizeWarning(raw);
    expect(h.title).toBe('Model note');
    expect(h.body).toBe(raw);
    expect(h.kind).toBe('info');
    expect(h.raw).toBe(raw);
  });

  it('humanizeWarnings maps an array element-wise', () => {
    const out = humanizeWarnings([
      'runType=T_ZERO expects lineup data; lineupAvailable=false',
      'Monte Carlo deviates from analytic marginals by 1.6%',
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].kind).toBe('caution');
    expect(out[1].kind).toBe('info');
  });
});
