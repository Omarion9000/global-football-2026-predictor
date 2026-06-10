import { describe, expect, it } from 'vitest';
import * as mock from '@/mock';

const FORBIDDEN_PREDICTION_KEYS = [
  'teamAWinProbability',
  'drawProbability',
  'teamBWinProbability',
  'teamAExpectedGoals',
  'teamBExpectedGoals',
  'confidenceScore',
  'confidenceBand',
];

function findPredictionShapedValue(value: unknown, path: string): string | null {
  if (value === null || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = findPredictionShapedValue(value[i], `${path}[${i}]`);
      if (hit) return hit;
    }
    return null;
  }
  const keys = Object.keys(value as Record<string, unknown>);
  for (const k of FORBIDDEN_PREDICTION_KEYS) {
    if (keys.includes(k)) return `${path}.${k}`;
  }
  for (const k of keys) {
    const hit = findPredictionShapedValue(
      (value as Record<string, unknown>)[k],
      `${path}.${k}`,
    );
    if (hit) return hit;
  }
  return null;
}

describe('mock module hygiene', () => {
  it('exports no symbol named like a prediction output', () => {
    const exportNames = Object.keys(mock);
    for (const name of exportNames) {
      expect(name.toLowerCase()).not.toMatch(/prediction(s|output|run)/);
      expect(name.toLowerCase()).not.toMatch(/probabilit/);
    }
  });

  it('contains no PredictionOutput-shaped values anywhere in mock data', () => {
    for (const [name, value] of Object.entries(mock)) {
      const hit = findPredictionShapedValue(value, name);
      expect(hit).toBeNull();
    }
  });
});
