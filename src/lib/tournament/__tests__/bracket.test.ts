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
  THIRD_PLACE_SLOTS,
} from '../bracket';

// Phase 9E — the bracket now mirrors FIFA's published 2026 structure.
// The expectations below pin the EXACT R32 pairings (M73..M88) and the
// fixed R16 → Final tree (M89..M104).

describe('bracket structure (official FIFA 2026)', () => {
  it('has exactly 16 R32 matches and 31 total knockout matches', () => {
    expect(N_R32_MATCHES).toBe(16);
    expect(R32_MATCHES.length).toBe(16);
    expect(N_KNOCKOUT_MATCHES).toBe(31);
  });

  it('references every group label exactly once as winner and once as runner-up', () => {
    const winners = new Set<string>();
    const runners = new Set<string>();
    for (const [a, b] of R32_MATCHES) {
      for (const slot of [a, b]) {
        if (slot.kind === 'winner') {
          expect(winners.has(slot.group)).toBe(false);
          winners.add(slot.group);
        } else if (slot.kind === 'runnerUp') {
          expect(runners.has(slot.group)).toBe(false);
          runners.add(slot.group);
        }
      }
    }
    expect(winners.size).toBe(12);
    expect(runners.size).toBe(12);
    for (const g of GROUP_LABELS) {
      expect(winners.has(g)).toBe(true);
      expect(runners.has(g)).toBe(true);
    }
  });

  it('exposes exactly 8 third-place slots, each with a 5-group FIFA cluster', () => {
    expect(THIRD_PLACE_SLOTS.length).toBe(8);
    for (const slot of THIRD_PLACE_SLOTS) {
      expect(slot.cluster.length).toBe(5);
      for (const g of slot.cluster) {
        expect(GROUP_LABELS.includes(g as (typeof GROUP_LABELS)[number])).toBe(true);
      }
      // No repeated groups within a cluster.
      expect(new Set(slot.cluster).size).toBe(slot.cluster.length);
    }
  });

  it('R32 pairings match the published table exactly', () => {
    // M73=2A vs 2B
    expect(R32_MATCHES[0][0]).toEqual({ kind: 'runnerUp', group: 'A' });
    expect(R32_MATCHES[0][1]).toEqual({ kind: 'runnerUp', group: 'B' });
    // M74=1E vs 3rd[A,B,C,D,F]
    expect(R32_MATCHES[1][0]).toEqual({ kind: 'winner', group: 'E' });
    expect(R32_MATCHES[1][1]).toMatchObject({ kind: 'thirdPlace', cluster: ['A', 'B', 'C', 'D', 'F'] });
    // M75=1F vs 2C
    expect(R32_MATCHES[2][0]).toEqual({ kind: 'winner', group: 'F' });
    expect(R32_MATCHES[2][1]).toEqual({ kind: 'runnerUp', group: 'C' });
    // M76=1C vs 2F
    expect(R32_MATCHES[3][0]).toEqual({ kind: 'winner', group: 'C' });
    expect(R32_MATCHES[3][1]).toEqual({ kind: 'runnerUp', group: 'F' });
    // M77=1I vs 3rd[C,D,F,G,H]
    expect(R32_MATCHES[4][0]).toEqual({ kind: 'winner', group: 'I' });
    expect(R32_MATCHES[4][1]).toMatchObject({ kind: 'thirdPlace', cluster: ['C', 'D', 'F', 'G', 'H'] });
    // M78=2E vs 2I
    expect(R32_MATCHES[5][0]).toEqual({ kind: 'runnerUp', group: 'E' });
    expect(R32_MATCHES[5][1]).toEqual({ kind: 'runnerUp', group: 'I' });
    // M79=1A vs 3rd[C,E,F,H,I]
    expect(R32_MATCHES[6][0]).toEqual({ kind: 'winner', group: 'A' });
    expect(R32_MATCHES[6][1]).toMatchObject({ kind: 'thirdPlace', cluster: ['C', 'E', 'F', 'H', 'I'] });
    // M80=1L vs 3rd[E,H,I,J,K]
    expect(R32_MATCHES[7][0]).toEqual({ kind: 'winner', group: 'L' });
    expect(R32_MATCHES[7][1]).toMatchObject({ kind: 'thirdPlace', cluster: ['E', 'H', 'I', 'J', 'K'] });
    // M81=1D vs 3rd[B,E,F,I,J]
    expect(R32_MATCHES[8][0]).toEqual({ kind: 'winner', group: 'D' });
    expect(R32_MATCHES[8][1]).toMatchObject({ kind: 'thirdPlace', cluster: ['B', 'E', 'F', 'I', 'J'] });
    // M82=1G vs 3rd[A,E,H,I,J]
    expect(R32_MATCHES[9][0]).toEqual({ kind: 'winner', group: 'G' });
    expect(R32_MATCHES[9][1]).toMatchObject({ kind: 'thirdPlace', cluster: ['A', 'E', 'H', 'I', 'J'] });
    // M83=2K vs 2L
    expect(R32_MATCHES[10][0]).toEqual({ kind: 'runnerUp', group: 'K' });
    expect(R32_MATCHES[10][1]).toEqual({ kind: 'runnerUp', group: 'L' });
    // M84=1H vs 2J
    expect(R32_MATCHES[11][0]).toEqual({ kind: 'winner', group: 'H' });
    expect(R32_MATCHES[11][1]).toEqual({ kind: 'runnerUp', group: 'J' });
    // M85=1B vs 3rd[E,F,G,I,J]
    expect(R32_MATCHES[12][0]).toEqual({ kind: 'winner', group: 'B' });
    expect(R32_MATCHES[12][1]).toMatchObject({ kind: 'thirdPlace', cluster: ['E', 'F', 'G', 'I', 'J'] });
    // M86=1J vs 2H
    expect(R32_MATCHES[13][0]).toEqual({ kind: 'winner', group: 'J' });
    expect(R32_MATCHES[13][1]).toEqual({ kind: 'runnerUp', group: 'H' });
    // M87=1K vs 3rd[D,E,I,J,L]
    expect(R32_MATCHES[14][0]).toEqual({ kind: 'winner', group: 'K' });
    expect(R32_MATCHES[14][1]).toMatchObject({ kind: 'thirdPlace', cluster: ['D', 'E', 'I', 'J', 'L'] });
    // M88=2D vs 2G
    expect(R32_MATCHES[15][0]).toEqual({ kind: 'runnerUp', group: 'D' });
    expect(R32_MATCHES[15][1]).toEqual({ kind: 'runnerUp', group: 'G' });
  });

  it('R16/QF/SF/Final pair arrays match the published feed table', () => {
    expect(R16_PAIRS).toEqual([
      [1, 4],
      [0, 2],
      [3, 5],
      [6, 7],
      [10, 11],
      [8, 9],
      [13, 15],
      [12, 14],
    ]);
    expect(QF_PAIRS).toEqual([
      [0, 1],
      [4, 5],
      [2, 3],
      [6, 7],
    ]);
    expect(SF_PAIRS).toEqual([
      [0, 1],
      [2, 3],
    ]);
    expect(FINAL_PAIR).toEqual([0, 1]);
  });

  it('every R32 index is referenced exactly once across the R16 feeds', () => {
    const seen = new Map<number, number>();
    for (const [a, b] of R16_PAIRS) {
      seen.set(a, (seen.get(a) ?? 0) + 1);
      seen.set(b, (seen.get(b) ?? 0) + 1);
    }
    expect(seen.size).toBe(N_R32_MATCHES);
    for (const c of seen.values()) expect(c).toBe(1);
  });
});
