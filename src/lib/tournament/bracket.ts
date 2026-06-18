// =============================================================================
// bracket.ts
// =============================================================================
// Phase 9E — OFFICIAL FIFA 2026 knockout bracket structure.
//
//   * The 16 R32 matches map group winners (1A..1L) and runners-up (2A..2L)
//     to FIFA's exact published pairings (M73..M88).
//   * The 8 third-place slots carry a CLUSTER of eligible groups instead of
//     a fixed "best third #N" rank. In a given simulation pass the 8 best
//     thirds are assigned to these slots via bipartite matching against the
//     cluster constraints (see `thirdPlaceAssignment.ts`). FIFA's Annex C
//     scenario table (495 enumerated cases) is NOT implemented — when no
//     perfect cluster-respecting assignment exists for a given set of 8
//     thirds the simulator falls back to a deterministic best-effort and
//     counts the occurrence so the approximation can be audited.
//   * The R16 → Final tree is fixed by FIFA bracket-position indices
//     (M89..M104), encoded here as 0-indexed pair arrays.
//   * Third-place playoff M103 is NOT modelled — title odds are unaffected.
// =============================================================================

export type SlotRef =
  | { readonly kind: 'winner'; readonly group: string }
  | { readonly kind: 'runnerUp'; readonly group: string }
  | { readonly kind: 'thirdPlace'; readonly cluster: ReadonlyArray<string> };

export const GROUP_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'] as const;

const t = (...cluster: ReadonlyArray<string>): SlotRef => ({ kind: 'thirdPlace', cluster });
const w = (group: string): SlotRef => ({ kind: 'winner', group });
const r = (group: string): SlotRef => ({ kind: 'runnerUp', group });

/** 16 R32 matches in FIFA M73..M88 order. R32 idx 0 = M73, idx 15 = M88. */
export const R32_MATCHES: ReadonlyArray<readonly [SlotRef, SlotRef]> = [
  [r('A'), r('B')], //                                M73  idx 0
  [w('E'), t('A', 'B', 'C', 'D', 'F')], //            M74  idx 1
  [w('F'), r('C')], //                                M75  idx 2
  [w('C'), r('F')], //                                M76  idx 3
  [w('I'), t('C', 'D', 'F', 'G', 'H')], //            M77  idx 4
  [r('E'), r('I')], //                                M78  idx 5
  [w('A'), t('C', 'E', 'F', 'H', 'I')], //            M79  idx 6
  [w('L'), t('E', 'H', 'I', 'J', 'K')], //            M80  idx 7
  [w('D'), t('B', 'E', 'F', 'I', 'J')], //            M81  idx 8
  [w('G'), t('A', 'E', 'H', 'I', 'J')], //            M82  idx 9
  [r('K'), r('L')], //                                M83  idx 10
  [w('H'), r('J')], //                                M84  idx 11
  [w('B'), t('E', 'F', 'G', 'I', 'J')], //            M85  idx 12
  [w('J'), r('H')], //                                M86  idx 13
  [w('K'), t('D', 'E', 'I', 'J', 'L')], //            M87  idx 14
  [r('D'), r('G')], //                                M88  idx 15
] as const;

/** R16 idx 0 = M89, ..., idx 7 = M96. Each entry pairs two R32 winners by R32 index.
 *  M89=(W74,W77) M90=(W73,W75) M91=(W76,W78) M92=(W79,W80)
 *  M93=(W83,W84) M94=(W81,W82) M95=(W86,W88) M96=(W85,W87) */
export const R16_PAIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 4], //   M89
  [0, 2], //   M90
  [3, 5], //   M91
  [6, 7], //   M92
  [10, 11], // M93
  [8, 9], //   M94
  [13, 15], // M95
  [12, 14], // M96
] as const;

/** QF idx 0 = M97, ..., idx 3 = M100. Pairs R16 winners by R16 index.
 *  M97=(W89,W90) M98=(W93,W94) M99=(W91,W92) M100=(W95,W96) */
export const QF_PAIRS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], //  M97
  [4, 5], //  M98
  [2, 3], //  M99
  [6, 7], //  M100
] as const;

/** SF idx 0 = M101, idx 1 = M102. Pairs QF winners by QF index.
 *  M101=(W97,W98) M102=(W99,W100) */
export const SF_PAIRS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], //  M101
  [2, 3], //  M102
] as const;

/** Final M104 = (W101, W102). */
export const FINAL_PAIR: readonly [number, number] = [0, 1] as const;

export const N_R32_MATCHES = R32_MATCHES.length;
export const N_R16_MATCHES = R16_PAIRS.length;
export const N_QF_MATCHES = QF_PAIRS.length;
export const N_SF_MATCHES = SF_PAIRS.length;

/** Total knockout matches: 16 + 8 + 4 + 2 + 1 = 31. M103 (third-place playoff)
 *  is intentionally not modelled — title odds are independent of it. */
export const N_KNOCKOUT_MATCHES =
  N_R32_MATCHES + N_R16_MATCHES + N_QF_MATCHES + N_SF_MATCHES + 1;

/** Helper: list every (r32Index, cluster) for the 8 third-place slots so the
 *  assignment module can iterate them without re-scanning R32_MATCHES. */
export type ThirdPlaceSlot = {
  readonly r32Index: number;
  /** Which side of the R32 match the third-placed team occupies. The other
   *  side is always a group winner. */
  readonly side: 'home' | 'away';
  readonly cluster: ReadonlyArray<string>;
};

export const THIRD_PLACE_SLOTS: ReadonlyArray<ThirdPlaceSlot> = R32_MATCHES.flatMap(
  ([home, away], idx) => {
    const out: ThirdPlaceSlot[] = [];
    if (home.kind === 'thirdPlace') {
      out.push({ r32Index: idx, side: 'home', cluster: home.cluster });
    }
    if (away.kind === 'thirdPlace') {
      out.push({ r32Index: idx, side: 'away', cluster: away.cluster });
    }
    return out;
  },
);
