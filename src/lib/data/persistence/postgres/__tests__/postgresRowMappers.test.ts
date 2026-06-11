import { describe, expect, it } from 'vitest';
import {
  mapPostgresPredictionRunRow,
  mapPostgresScorelineRow,
} from '../postgresRowMappers';

// =============================================================================
// Postgres returns `numeric` columns as JS strings. These mappers must coerce
// them to numbers so downstream consumers (UI, scheduler, accuracy dashboards)
// can rely on the row type's `number` declaration. Phase 7F surfaced the
// regression as a Production 500 (TypeError: ... .toFixed is not a function).
// =============================================================================

describe('mapPostgresPredictionRunRow — numeric coercion', () => {
  function rawRow(): Record<string, unknown> {
    // All numeric columns arrive as strings from @neondatabase/serverless
    // (and node-postgres). Reproduce that shape here.
    return {
      id: '11111111-1111-1111-1111-111111111111',
      fixture_id: 'fixture-004',
      run_type: 'T_ZERO',
      model_version: 'v0.1.0',
      scheduled_for: '2026-06-13T18:30:00.000Z',
      executed_at: '2026-06-13T18:30:01.000Z',
      data_snapshot_id: 'smoke-snap-fixture-004-T_ZERO-v0.1.0',
      team_a_win_probability: '0.6500',
      draw_probability: '0.2000',
      team_b_win_probability: '0.1500',
      team_a_expected_goals: '1.6500000',
      team_b_expected_goals: '0.8500000',
      confidence_score: '0.7500',
      confidence_band: 'MEDIUM',
      warnings: [],
      created_at: '2026-06-13T18:30:01.000Z',
    };
  }

  it('coerces every numeric column from string to number', () => {
    const mapped = mapPostgresPredictionRunRow(rawRow());

    for (const field of [
      'team_a_win_probability',
      'draw_probability',
      'team_b_win_probability',
      'team_a_expected_goals',
      'team_b_expected_goals',
      'confidence_score',
    ] as const) {
      expect(typeof mapped[field]).toBe('number');
    }
  });

  it('preserves numeric values exactly for the bounded V1 range', () => {
    const mapped = mapPostgresPredictionRunRow(rawRow());
    expect(mapped.team_a_win_probability).toBe(0.65);
    expect(mapped.draw_probability).toBe(0.2);
    expect(mapped.team_b_win_probability).toBe(0.15);
    expect(mapped.team_a_expected_goals).toBe(1.65);
    expect(mapped.team_b_expected_goals).toBe(0.85);
    expect(mapped.confidence_score).toBe(0.75);
  });

  it('produces a row whose probabilities support `.toFixed()` (the Production bug)', () => {
    const mapped = mapPostgresPredictionRunRow(rawRow());
    // Direct re-creation of the line that crashed Production:
    //   <p>{recent.run.team_a_expected_goals.toFixed(2)}</p>
    expect(mapped.team_a_expected_goals.toFixed(2)).toBe('1.65');
    expect(mapped.team_b_expected_goals.toFixed(2)).toBe('0.85');
  });

  it('passes through string columns unchanged', () => {
    const mapped = mapPostgresPredictionRunRow(rawRow());
    expect(mapped.id).toBe('11111111-1111-1111-1111-111111111111');
    expect(mapped.fixture_id).toBe('fixture-004');
    expect(mapped.run_type).toBe('T_ZERO');
    expect(mapped.model_version).toBe('v0.1.0');
    expect(mapped.confidence_band).toBe('MEDIUM');
  });

  it('defaults a missing warnings column to an empty array', () => {
    const raw = rawRow();
    delete (raw as Record<string, unknown>).warnings;
    const mapped = mapPostgresPredictionRunRow(raw);
    expect(mapped.warnings).toEqual([]);
  });

  it('preserves warnings when the driver already parsed jsonb', () => {
    const raw = { ...rawRow(), warnings: ['lineupAvailable=false'] };
    const mapped = mapPostgresPredictionRunRow(raw);
    expect(mapped.warnings).toEqual(['lineupAvailable=false']);
  });
});

describe('mapPostgresScorelineRow — numeric coercion', () => {
  function rawScoreline(): Record<string, unknown> {
    return {
      id: '22222222-2222-2222-2222-222222222222',
      prediction_run_id: '11111111-1111-1111-1111-111111111111',
      // Integer columns may already be numbers (pg parses int4/int8) but
      // running them through Number() defensively is a no-op.
      team_a_goals: 2,
      team_b_goals: 1,
      probability: '0.1850',
      rank: 1,
      created_at: '2026-06-13T18:30:01.000Z',
    };
  }

  it('coerces probability from string to number', () => {
    const mapped = mapPostgresScorelineRow(rawScoreline());
    expect(typeof mapped.probability).toBe('number');
    expect(mapped.probability).toBe(0.185);
  });

  it('keeps int columns numeric whether the driver returned int or string', () => {
    const numericInts = mapPostgresScorelineRow(rawScoreline());
    expect(typeof numericInts.team_a_goals).toBe('number');
    expect(typeof numericInts.team_b_goals).toBe('number');
    expect(typeof numericInts.rank).toBe('number');

    // Defensive: if the driver ever returns int columns as strings, the
    // mapper still produces numbers.
    const stringInts = mapPostgresScorelineRow({
      ...rawScoreline(),
      team_a_goals: '2',
      team_b_goals: '1',
      rank: '1',
    });
    expect(typeof stringInts.team_a_goals).toBe('number');
    expect(typeof stringInts.team_b_goals).toBe('number');
    expect(typeof stringInts.rank).toBe('number');
  });
});
