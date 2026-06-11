import { describe, expect, it } from 'vitest';
import {
  getDemoFixtures,
  getDemoLatestPrediction,
  getDemoMostRecentPrediction,
  getDemoPredictionsForFixture,
  getDemoScorelinesForRun,
  getDemoTeams,
} from '@/lib/data/demoPredictions';
import { PREDICTION_RUN_TYPES } from '@/lib/types';

describe('demoPredictions', () => {
  it('exposes the mock fixtures and teams', () => {
    expect(getDemoFixtures().length).toBeGreaterThanOrEqual(4);
    expect(getDemoTeams().length).toBeGreaterThanOrEqual(8);
  });

  it('every fixture has at least one persisted demo prediction row', () => {
    for (const f of getDemoFixtures()) {
      const runs = getDemoPredictionsForFixture(f.id);
      expect(runs.length).toBeGreaterThan(0);
    }
  });

  it('only generates pre-match run types in Phase 6 (T-3h, T-1h, T_ZERO)', () => {
    const allowed = new Set(['T_MINUS_3H', 'T_MINUS_1H', 'T_ZERO']);
    for (const f of getDemoFixtures()) {
      for (const run of getDemoPredictionsForFixture(f.id)) {
        expect(allowed.has(run.run_type)).toBe(true);
      }
    }
  });

  it('every persisted run has valid probabilities and well-formed metadata', () => {
    for (const f of getDemoFixtures()) {
      for (const r of getDemoPredictionsForFixture(f.id)) {
        const sum =
          r.team_a_win_probability +
          r.draw_probability +
          r.team_b_win_probability;
        expect(sum).toBeCloseTo(1, 5);
        expect(r.model_version).toMatch(/^v\d+\.\d+\.\d+$/);
        expect(PREDICTION_RUN_TYPES).toContain(r.run_type);
        expect(['LOW', 'MEDIUM', 'HIGH']).toContain(r.confidence_band);
      }
    }
  });

  it('getDemoMostRecentPrediction returns scorelines that match the parent run', () => {
    const f = getDemoFixtures()[0];
    const recent = getDemoMostRecentPrediction(f.id);
    expect(recent).not.toBeNull();
    if (!recent) return;
    expect(recent.scorelines.length).toBeGreaterThan(0);
    expect(recent.scorelines.every((s) => s.prediction_run_id === recent.run.id))
      .toBe(true);

    const direct = getDemoScorelinesForRun(recent.run.id);
    expect(direct.length).toBe(recent.scorelines.length);
  });

  it('getDemoLatestPrediction filters by run type', () => {
    const f = getDemoFixtures()[0];
    const t0 = getDemoLatestPrediction(f.id, 'T_ZERO');
    expect(t0?.run_type).toBe('T_ZERO');
  });

  it('returns null for unknown ids', () => {
    expect(getDemoMostRecentPrediction('not-a-fixture')).toBeNull();
    expect(getDemoLatestPrediction('not-a-fixture')).toBeNull();
    expect(getDemoScorelinesForRun('not-a-run').length).toBe(0);
  });
});
