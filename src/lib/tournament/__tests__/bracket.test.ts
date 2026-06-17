import { describe, expect, it } from 'vitest';
import {
  FINAL_PAIR,
  GROUP_LABELS,
  N_KNOCKOUT_MATCHES,
  N_QF_MATCHES,
  N_R16_MATCHES,
  N_R32_MATCHES,
  N_SF_MATCHES,
  QF_PAIRS,
  R16_PAIRS,
  R32_MATCHES,
  SF_PAIRS,
} from '../bracket';

describe('bracket structure', () => {
  it('has exactly 16 R32 matches', () => {
    expect(N_R32_MATCHES).toBe(16);
    expect(R32_MATCHES.length).toBe(16);
  });

  it('exposes 31 total knockout matches', () => {
    expect(N_KNOCKOUT_MATCHES).toBe(31);
    expect(N_R32_MATCHES + N_R16_MATCHES + N_QF_MATCHES + N_SF_MATCHES + 1).toBe(31);
  });

  it('references every group label exactly once as winner and once as runner-up', () => {
    const winners = new Set<string>();
    const runners = new Set<string>();
    const thirds = new Set<number>();
    for (const [a, b] of R32_MATCHES) {
      for (const slot of [a, b]) {
        if (slot.kind === 'winner') {
          expect(winners.has(slot.group)).toBe(false);
          winners.add(slot.group);
        } else if (slot.kind === 'runnerUp') {
          expect(runners.has(slot.group)).toBe(false);
          runners.add(slot.group);
        } else {
          expect(thirds.has(slot.thirdRank)).toBe(false);
          thirds.add(slot.thirdRank);
        }
      }
    }
    expect(winners.size).toBe(12);
    expect(runners.size).toBe(12);
    expect(thirds.size).toBe(8);
    for (const g of GROUP_LABELS) {
      expect(winners.has(g)).toBe(true);
      expect(runners.has(g)).toBe(true);
    }
  });

  it('R16 / QF / SF / Final indices are in bounds and cover every preceding slot', () => {
    const r16Seen = new Set<number>();
    for (const [a, b] of R16_PAIRS) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(N_R32_MATCHES);
      r16Seen.add(a);
      r16Seen.add(b);
    }
    expect(r16Seen.size).toBe(N_R32_MATCHES);

    const qfSeen = new Set<number>();
    for (const [a, b] of QF_PAIRS) {
      expect(a).toBeLessThan(N_R16_MATCHES);
      expect(b).toBeLessThan(N_R16_MATCHES);
      qfSeen.add(a);
      qfSeen.add(b);
    }
    expect(qfSeen.size).toBe(N_R16_MATCHES);

    const sfSeen = new Set<number>();
    for (const [a, b] of SF_PAIRS) {
      sfSeen.add(a);
      sfSeen.add(b);
    }
    expect(sfSeen.size).toBe(N_QF_MATCHES);
    expect(FINAL_PAIR[0]).toBeLessThan(N_SF_MATCHES);
    expect(FINAL_PAIR[1]).toBeLessThan(N_SF_MATCHES);
    expect(FINAL_PAIR[0]).not.toBe(FINAL_PAIR[1]);
  });
});
