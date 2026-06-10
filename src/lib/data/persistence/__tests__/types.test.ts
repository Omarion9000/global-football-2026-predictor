import { describe, expect, it } from 'vitest';
import { PREDICTION_RUN_TYPES } from '@/lib/types';
import {
  DATA_SOURCES_CANONICAL_COLUMNS,
  type DataSourceInsert,
  type RunTypeRow,
} from '../types';

describe('RunTypeRow matches the canonical PredictionRunType enum', () => {
  it('every canonical PredictionRunType is a valid RunTypeRow literal', () => {
    // Compile-time assertion: assigning each enum value to RunTypeRow must
    // typecheck. Runtime assertion below mirrors the SQL CHECK constraint.
    const samples: readonly RunTypeRow[] = PREDICTION_RUN_TYPES;
    expect(samples).toEqual([
      'T_MINUS_3H',
      'T_MINUS_1H',
      'T_ZERO',
      'HT',
      'FT',
    ]);
  });
});

describe('DataSourceInsert carries every docs/04 §4.3 canonical column', () => {
  it('exports exactly the ten canonical column names', () => {
    expect([...DATA_SOURCES_CANONICAL_COLUMNS]).toEqual([
      'provider_name',
      'endpoint',
      'data_type',
      'license_terms_notes',
      'attribution_required',
      'allowed_usage',
      'rate_limits',
      'fetched_at',
      'added_at',
      'reviewed_at',
    ]);
  });

  it('a constructed DataSourceInsert object includes every canonical column key', () => {
    const insert: DataSourceInsert = {
      provider_name: 'API-Football',
      endpoint: '/fixtures',
      data_type: 'fixtures',
      license_terms_notes: 'analytical use permitted with attribution',
      attribution_required: true,
      attribution_string: 'Data: API-Football',
      allowed_usage: 'non-commercial analytical',
      rate_limits: '100 req/day',
      fetched_at: null,
      reviewed_at: null,
    };
    const keys = Object.keys(insert);
    for (const expected of DATA_SOURCES_CANONICAL_COLUMNS) {
      // added_at is optional on insert and may be omitted (server-defaulted).
      if (expected === 'added_at') continue;
      expect(keys).toContain(expected);
    }
  });
});
