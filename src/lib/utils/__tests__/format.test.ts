import { describe, expect, it } from 'vitest';
import {
  formatDayHeader,
  formatExecutedAt,
  formatKickoff,
} from '../format';

describe('formatKickoff', () => {
  it('renders the canonical broadcast-style kickoff string', () => {
    expect(formatKickoff('2026-06-13T18:30:00Z')).toBe(
      'Sat, Jun 13 · 18:30 GMT',
    );
  });
  it('zero-pads minutes', () => {
    expect(formatKickoff('2026-06-11T20:05:00Z')).toBe(
      'Thu, Jun 11 · 20:05 GMT',
    );
  });
  it('passes through invalid input untouched', () => {
    expect(formatKickoff('not-a-date')).toBe('not-a-date');
  });
});

describe('formatDayHeader', () => {
  it('renders day-of-week + short month + day-of-month', () => {
    expect(formatDayHeader('2026-06-11')).toBe('Thu, Jun 11');
    expect(formatDayHeader('2026-06-13')).toBe('Sat, Jun 13');
  });
});

describe('formatExecutedAt', () => {
  it('renders a compact GMT timestamp', () => {
    expect(formatExecutedAt('2026-06-11T17:00:05Z')).toBe(
      'Jun 11, 17:00 GMT',
    );
  });
});
