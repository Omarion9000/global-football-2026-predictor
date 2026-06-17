// =============================================================================
// bracket.ts
// =============================================================================
// Phase 9C — knockout bracket structure for the 32-team round of 32 onwards.
// Committed constant; the simulator reads this to determine which group
// positions feed each R32 match and how R32 winners propagate through R16,
// QF, SF, and the final.
//
// IMPORTANT — placeholder structure note:
//   The exact FIFA-published 2026 bracket maps group winners, runners-up, and
//   the 8 best third-placed teams to specific R32 slots via a published table
//   that depends on which 8 of the 12 groups produce qualifying thirds.
//
//   This file encodes a deterministic, plausible structure that respects the
//   broad constraints (16 R32 pairs, single-elimination tree through to the
//   final, each pair drawn from distinct groups) but does NOT claim to match
//   FIFA's exact published pairings for 2026 — that table was not in the
//   inputs given to the simulator. The structure is easy to amend in place:
//   the only edit needed to swap in the official pairings is the
//   `R32_MATCHES` array below. The downstream tree (R16 / QF / SF / F) is
//   defined by R32 match indices, so it does not need to change.
//
// Test coverage:
//   - every group label A..L appears exactly twice across R32 (once as
//     winner, once as runner-up)
//   - exactly 8 third-place slots are referenced (one per `thirdRank` 1..8)
//   - every R32 match pairs two slots from different groups (where group
//     membership is known)
// =============================================================================

export type SlotRef =
  | { readonly kind: 'winner'; readonly group: string }
  | { readonly kind: 'runnerUp'; readonly group: string }
  | { readonly kind: 'thirdPlace'; readonly thirdRank: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 };

export const GROUP_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'] as const;

/** 16 R32 matches. Pairs map a slot reference to a slot reference. The match
 *  index (0..15) is the unique identifier used by downstream rounds. */
export const R32_MATCHES: ReadonlyArray<readonly [SlotRef, SlotRef]> = [
  // Eight group winners vs eight best thirds (winners A..H face thirds 1..8).
  [{ kind: 'winner', group: 'A' }, { kind: 'thirdPlace', thirdRank: 8 }], // 0
  [{ kind: 'winner', group: 'B' }, { kind: 'thirdPlace', thirdRank: 7 }], // 1
  [{ kind: 'winner', group: 'C' }, { kind: 'thirdPlace', thirdRank: 6 }], // 2
  [{ kind: 'winner', group: 'D' }, { kind: 'thirdPlace', thirdRank: 5 }], // 3
  [{ kind: 'winner', group: 'E' }, { kind: 'thirdPlace', thirdRank: 4 }], // 4
  [{ kind: 'winner', group: 'F' }, { kind: 'thirdPlace', thirdRank: 3 }], // 5
  [{ kind: 'winner', group: 'G' }, { kind: 'thirdPlace', thirdRank: 2 }], // 6
  [{ kind: 'winner', group: 'H' }, { kind: 'thirdPlace', thirdRank: 1 }], // 7
  // Four group winners vs four runners-up — winners I-L pair against
  // runners-up from the opposite end of the alphabet.
  [{ kind: 'winner', group: 'I' }, { kind: 'runnerUp', group: 'L' }], // 8
  [{ kind: 'winner', group: 'J' }, { kind: 'runnerUp', group: 'K' }], // 9
  [{ kind: 'winner', group: 'K' }, { kind: 'runnerUp', group: 'J' }], // 10
  [{ kind: 'winner', group: 'L' }, { kind: 'runnerUp', group: 'I' }], // 11
  // Four pairs of runners-up.
  [{ kind: 'runnerUp', group: 'A' }, { kind: 'runnerUp', group: 'B' }], // 12
  [{ kind: 'runnerUp', group: 'C' }, { kind: 'runnerUp', group: 'D' }], // 13
  [{ kind: 'runnerUp', group: 'E' }, { kind: 'runnerUp', group: 'F' }], // 14
  [{ kind: 'runnerUp', group: 'G' }, { kind: 'runnerUp', group: 'H' }], // 15
] as const;

/** R16: 8 matches, each pairing the winners of two R32 matches.
 *  Element [i] = [r32MatchIndexA, r32MatchIndexB]. */
export const R16_PAIRS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [2, 3],
  [4, 5],
  [6, 7],
  [8, 9],
  [10, 11],
  [12, 13],
  [14, 15],
] as const;

/** QF: 4 matches; element [i] pairs the winners of two R16 matches. */
export const QF_PAIRS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [2, 3],
  [4, 5],
  [6, 7],
] as const;

/** SF: 2 matches; element [i] pairs the winners of two QF matches. */
export const SF_PAIRS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [2, 3],
] as const;

/** Final: 1 match; the two SF winners. */
export const FINAL_PAIR: readonly [number, number] = [0, 1] as const;

export const N_R32_MATCHES = R32_MATCHES.length;
export const N_R16_MATCHES = R16_PAIRS.length;
export const N_QF_MATCHES = QF_PAIRS.length;
export const N_SF_MATCHES = SF_PAIRS.length;

/** Total knockout matches: 16 + 8 + 4 + 2 + 1 = 31. */
export const N_KNOCKOUT_MATCHES =
  N_R32_MATCHES + N_R16_MATCHES + N_QF_MATCHES + N_SF_MATCHES + 1;
