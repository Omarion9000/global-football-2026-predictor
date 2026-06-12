import { describe, expect, it } from 'vitest';
import {
  MissingInputError,
  PREDICTION_RUN_TYPES,
  type ConfidenceBand,
  type MatchStage,
  type PredictionRunType,
  type ScorelineProbability,
} from '@/lib/types';
import type { FixtureStageRow } from '@/lib/data/persistence/types';

describe('domain types', () => {
  it('PREDICTION_RUN_TYPES contains exactly the five canonical values', () => {
    expect(PREDICTION_RUN_TYPES).toEqual([
      'T_MINUS_3H',
      'T_MINUS_1H',
      'T_ZERO',
      'HT',
      'FT',
    ]);
  });

  it('PredictionRunType union accepts each canonical value', () => {
    const values: PredictionRunType[] = [
      'T_MINUS_3H',
      'T_MINUS_1H',
      'T_ZERO',
      'HT',
      'FT',
    ];
    expect(values).toHaveLength(5);
  });

  it('ConfidenceBand union has three bands', () => {
    const bands: ConfidenceBand[] = ['LOW', 'MEDIUM', 'HIGH'];
    expect(bands).toHaveLength(3);
  });

  it('MatchStage union includes LEAGUE alongside the six tournament values (Phase 8D)', () => {
    const stages: MatchStage[] = [
      'GROUP',
      'R16',
      'QF',
      'SF',
      'F',
      'THIRD_PLACE',
      'LEAGUE',
    ];
    expect(stages).toHaveLength(7);
    // LEAGUE must be assignable to the type — this also documents the
    // 0002 migration's intent at the type level.
    const league: MatchStage = 'LEAGUE';
    expect(league).toBe('LEAGUE');
  });

  it('FixtureStageRow row union mirrors MatchStage including LEAGUE', () => {
    const rows: FixtureStageRow[] = [
      'GROUP',
      'R16',
      'QF',
      'SF',
      'F',
      'THIRD_PLACE',
      'LEAGUE',
    ];
    expect(rows).toHaveLength(7);
  });

  it('ScorelineProbability shape compiles and accepts probabilities', () => {
    const sample: ScorelineProbability = {
      teamAGoals: 1,
      teamBGoals: 0,
      probability: 0.2,
    };
    expect(sample.probability).toBeGreaterThanOrEqual(0);
    expect(sample.probability).toBeLessThanOrEqual(1);
  });

  it('MissingInputError carries its missing-field list', () => {
    const err = new MissingInputError(['lineup', 'inPlay']);
    expect(err).toBeInstanceOf(MissingInputError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('MissingInputError');
    expect(err.missingFields).toEqual(['lineup', 'inPlay']);
    expect(err.message).toContain('lineup');
    expect(err.message).toContain('inPlay');
  });
});
