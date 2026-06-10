import { describe, expect, it } from 'vitest';
import { getScheduledFor } from '../scheduleWindows';

const KICKOFF = '2026-06-11T20:00:00Z';

describe('getScheduledFor', () => {
  it('T_MINUS_3H = kickoff - 3h', () => {
    expect(getScheduledFor(KICKOFF, 'T_MINUS_3H')).toBe('2026-06-11T17:00:00.000Z');
  });
  it('T_MINUS_1H = kickoff - 1h', () => {
    expect(getScheduledFor(KICKOFF, 'T_MINUS_1H')).toBe('2026-06-11T19:00:00.000Z');
  });
  it('T_ZERO = kickoff', () => {
    expect(getScheduledFor(KICKOFF, 'T_ZERO')).toBe('2026-06-11T20:00:00.000Z');
  });
  it('HT = kickoff + 45 min (nominal; due-check additionally requires status)', () => {
    expect(getScheduledFor(KICKOFF, 'HT')).toBe('2026-06-11T20:45:00.000Z');
  });
  it('FT = kickoff + 110 min (nominal)', () => {
    expect(getScheduledFor(KICKOFF, 'FT')).toBe('2026-06-11T21:50:00.000Z');
  });
  it('rejects invalid kickoff strings', () => {
    expect(() => getScheduledFor('not-a-date', 'T_MINUS_3H')).toThrow();
  });
});
