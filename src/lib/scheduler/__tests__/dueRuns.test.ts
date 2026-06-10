import { describe, expect, it } from 'vitest';
import { mockFixtures } from '@/mock';
import type { Fixture } from '@/lib/types';
import type { PredictionRunRow } from '@/lib/data';
import { getDuePredictionRuns } from '../dueRuns';

const MODEL_VERSION = 'v0.1.0';
const KICKOFF = '2026-06-11T20:00:00Z';

function fixtureAt(status: Fixture['status'] = 'SCHEDULED'): Fixture {
  return { ...mockFixtures[0], kickoffUtc: KICKOFF, status };
}

function existingRun(overrides: Partial<PredictionRunRow>): PredictionRunRow {
  return {
    id: 'r1',
    fixture_id: mockFixtures[0].id,
    run_type: 'T_MINUS_3H',
    model_version: MODEL_VERSION,
    scheduled_for: '2026-06-11T17:00:00.000Z',
    executed_at: '2026-06-11T17:00:01.000Z',
    data_snapshot_id: 's1',
    team_a_win_probability: 0.5,
    draw_probability: 0.3,
    team_b_win_probability: 0.2,
    team_a_expected_goals: 1.4,
    team_b_expected_goals: 0.9,
    confidence_score: 0.6,
    confidence_band: 'MEDIUM',
    warnings: [],
    created_at: '2026-06-11T17:00:01.000Z',
    ...overrides,
  };
}

describe('getDuePredictionRuns — pre-match timing', () => {
  it('T_MINUS_3H is due at exactly kickoff - 3h', () => {
    const { due } = getDuePredictionRuns({
      now: new Date('2026-06-11T17:00:00Z'),
      fixtures: [fixtureAt()],
      existingRuns: [],
      modelVersion: MODEL_VERSION,
    });
    expect(due.map((d) => d.runType)).toContain('T_MINUS_3H');
    const c = due.find((d) => d.runType === 'T_MINUS_3H');
    expect(c?.scheduledFor).toBe('2026-06-11T17:00:00.000Z');
  });

  it('T_MINUS_3H is not due before kickoff - 3h', () => {
    const { due } = getDuePredictionRuns({
      now: new Date('2026-06-11T16:59:59Z'),
      fixtures: [fixtureAt()],
      existingRuns: [],
      modelVersion: MODEL_VERSION,
    });
    expect(due.find((d) => d.runType === 'T_MINUS_3H')).toBeUndefined();
  });

  it('T_MINUS_1H is due at kickoff - 1h, T_MINUS_3H also still due (idempotency dedup handled separately)', () => {
    const { due } = getDuePredictionRuns({
      now: new Date('2026-06-11T19:00:00Z'),
      fixtures: [fixtureAt()],
      existingRuns: [],
      modelVersion: MODEL_VERSION,
    });
    expect(due.map((d) => d.runType).sort()).toEqual(['T_MINUS_1H', 'T_MINUS_3H']);
  });

  it('T_ZERO is due at kickoff', () => {
    const { due } = getDuePredictionRuns({
      now: new Date(KICKOFF),
      fixtures: [fixtureAt()],
      existingRuns: [],
      modelVersion: MODEL_VERSION,
    });
    expect(due.map((d) => d.runType)).toContain('T_ZERO');
  });
});

describe('getDuePredictionRuns — idempotency', () => {
  it('does not return a candidate when an existing run matches (fixture_id, run_type, model_version, scheduled_for)', () => {
    const { due } = getDuePredictionRuns({
      now: new Date(KICKOFF),
      fixtures: [fixtureAt()],
      existingRuns: [existingRun({})],
      modelVersion: MODEL_VERSION,
    });
    expect(due.find((d) => d.runType === 'T_MINUS_3H')).toBeUndefined();
  });

  it('returns the candidate when an existing run has a different model_version', () => {
    const { due } = getDuePredictionRuns({
      now: new Date(KICKOFF),
      fixtures: [fixtureAt()],
      existingRuns: [existingRun({ model_version: 'v0.0.9' })],
      modelVersion: MODEL_VERSION,
    });
    expect(due.find((d) => d.runType === 'T_MINUS_3H')).toBeDefined();
  });
});

describe('getDuePredictionRuns — HT gating', () => {
  it('HT is NOT due when nominal HT time has passed but status is SCHEDULED (warning added)', () => {
    const result = getDuePredictionRuns({
      now: new Date('2026-06-11T21:00:00Z'), // past nominal HT
      fixtures: [fixtureAt('SCHEDULED')],
      existingRuns: [],
      modelVersion: MODEL_VERSION,
    });
    expect(result.due.find((d) => d.runType === 'HT')).toBeUndefined();
    expect(result.warnings.some((w) => w.includes('HT skipped'))).toBe(true);
  });

  it('HT IS due when status is HALF_TIME and nominal HT time has passed', () => {
    const { due } = getDuePredictionRuns({
      now: new Date('2026-06-11T20:45:00Z'),
      fixtures: [fixtureAt('HALF_TIME')],
      existingRuns: [],
      modelVersion: MODEL_VERSION,
    });
    expect(due.find((d) => d.runType === 'HT')).toBeDefined();
  });
});

describe('getDuePredictionRuns — FT gating', () => {
  it('FT is NOT due when status is anything other than FULL_TIME (silent skip)', () => {
    const result = getDuePredictionRuns({
      now: new Date('2026-06-11T22:00:00Z'),
      fixtures: [fixtureAt('IN_PROGRESS')],
      existingRuns: [],
      modelVersion: MODEL_VERSION,
    });
    expect(result.due.find((d) => d.runType === 'FT')).toBeUndefined();
    // FT skips are intentionally silent — no warning generated
    expect(result.warnings.some((w) => w.includes('FT'))).toBe(false);
  });

  it('FT IS due when status is FULL_TIME', () => {
    const { due } = getDuePredictionRuns({
      now: new Date('2026-06-11T22:00:00Z'),
      fixtures: [fixtureAt('FULL_TIME')],
      existingRuns: [],
      modelVersion: MODEL_VERSION,
    });
    expect(due.find((d) => d.runType === 'FT')).toBeDefined();
  });
});
