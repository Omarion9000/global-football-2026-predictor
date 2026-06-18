// =============================================================================
// thirdPlaceAssignment.ts — Phase 9E (Option 1a)
// =============================================================================
// Map the 8 best third-placed teams (each carrying their group letter) onto
// the 8 R32 third-place slots, respecting each slot's FIFA cluster constraint.
//
// Approach:
//   1. Try to find a perfect matching in the bipartite graph where third t
//      connects to slot s iff t.group ∈ s.cluster. Augmenting-path matching
//      is O(V·E); with V=8 and E≤40 this runs in well under a microsecond.
//   2. If no perfect matching exists for the supplied set, run a deterministic
//      best-effort fallback so the simulator still produces a complete R32 —
//      and mark `isFallback: true` so the runner can count occurrences.
//
// The fallback matters because the cluster sets do not enumerate all 495
// FIFA Annex C scenarios; some advancing-third combinations cannot be matched
// perfectly under the cluster constraints alone. Counting fallbacks lets us
// audit how often the approximation degrades.
//
// Pure module — no engine imports, no randomness.
// =============================================================================

import { THIRD_PLACE_SLOTS, type ThirdPlaceSlot } from './bracket';

export type AdvancingThird = {
  /** Group letter (e.g. 'A', 'B', ...). The simulator already knows this
   *  from `ThirdPlaceEntry.group`. */
  readonly group: string;
  /** The team string (same identity used elsewhere in the simulator). */
  readonly team: string;
};

export type ThirdPlaceAssignment = {
  /** r32Index → team. Always contains exactly 8 entries (one per slot). */
  readonly mapping: ReadonlyMap<number, string>;
  /** True iff a perfect cluster-respecting assignment could not be found and
   *  the fallback path was used. */
  readonly isFallback: boolean;
};

/** Run augmenting-path bipartite matching. Returns null when no perfect
 *  matching exists. Slot order is preserved from the input array. */
function tryPerfectMatching(
  slots: ReadonlyArray<ThirdPlaceSlot>,
  thirds: ReadonlyArray<AdvancingThird>,
): Map<number, string> | null {
  const nSlots = slots.length;
  const nThirds = thirds.length;
  if (nThirds < nSlots) return null;

  // matchSlot[slotIdx] = thirdIdx or -1
  const matchSlot = new Array<number>(nSlots).fill(-1);
  // matchThird[thirdIdx] = slotIdx or -1
  const matchThird = new Array<number>(nThirds).fill(-1);

  function tryAssign(slotIdx: number, visited: Uint8Array): boolean {
    const cluster = slots[slotIdx].cluster;
    for (let ti = 0; ti < nThirds; ti += 1) {
      if (visited[ti]) continue;
      if (!cluster.includes(thirds[ti].group)) continue;
      visited[ti] = 1;
      if (matchThird[ti] === -1 || tryAssign(matchThird[ti], visited)) {
        matchSlot[slotIdx] = ti;
        matchThird[ti] = slotIdx;
        return true;
      }
    }
    return false;
  }

  for (let si = 0; si < nSlots; si += 1) {
    const visited = new Uint8Array(nThirds);
    if (!tryAssign(si, visited)) return null;
  }

  const out = new Map<number, string>();
  for (let si = 0; si < nSlots; si += 1) {
    const ti = matchSlot[si];
    if (ti === -1) return null; // shouldn't happen if every si succeeded
    out.set(slots[si].r32Index, thirds[ti].team);
  }
  return out;
}

/** Deterministic best-effort assignment when no perfect matching exists.
 *  Slots are processed in order of fewest remaining eligible thirds (most
 *  constrained first); ties broken by R32 index. Within a slot, eligible
 *  thirds are preferred over ineligible ones; among eligible the third whose
 *  group sorts earliest is taken; among ineligible the same tiebreak. */
function fallbackAssign(
  slots: ReadonlyArray<ThirdPlaceSlot>,
  thirds: ReadonlyArray<AdvancingThird>,
): Map<number, string> {
  const remaining = new Set<number>(thirds.map((_, i) => i));
  const out = new Map<number, string>();
  const slotOrder = slots
    .map((s, i) => ({ slot: s, originalIdx: i }))
    .slice()
    .sort((a, b) => {
      const countA = a.slot.cluster.filter((g) =>
        [...remaining].some((ti) => thirds[ti].group === g),
      ).length;
      const countB = b.slot.cluster.filter((g) =>
        [...remaining].some((ti) => thirds[ti].group === g),
      ).length;
      if (countA !== countB) return countA - countB;
      return a.slot.r32Index - b.slot.r32Index;
    });

  for (const { slot } of slotOrder) {
    let chosen = -1;
    // Prefer an eligible candidate (group in cluster).
    let bestGroup = '';
    for (const ti of remaining) {
      if (!slot.cluster.includes(thirds[ti].group)) continue;
      if (chosen === -1 || thirds[ti].group < bestGroup) {
        chosen = ti;
        bestGroup = thirds[ti].group;
      }
    }
    if (chosen === -1) {
      // No eligible candidate — assign any remaining third deterministically.
      for (const ti of remaining) {
        if (chosen === -1 || thirds[ti].group < bestGroup) {
          chosen = ti;
          bestGroup = thirds[ti].group;
        }
      }
    }
    if (chosen === -1) {
      throw new Error('thirdPlaceAssignment: ran out of advancing thirds — pool was too small.');
    }
    out.set(slot.r32Index, thirds[chosen].team);
    remaining.delete(chosen);
  }
  return out;
}

/** Assign the 8 best third-placed teams to the 8 R32 third-place slots,
 *  respecting each slot's FIFA cluster where possible. */
export function assignThirds(
  thirds: ReadonlyArray<AdvancingThird>,
  slots: ReadonlyArray<ThirdPlaceSlot> = THIRD_PLACE_SLOTS,
): ThirdPlaceAssignment {
  if (thirds.length !== slots.length) {
    throw new Error(
      `assignThirds: expected ${slots.length} advancing thirds, got ${thirds.length}.`,
    );
  }
  const matched = tryPerfectMatching(slots, thirds);
  if (matched) {
    return { mapping: matched, isFallback: false };
  }
  return { mapping: fallbackAssign(slots, thirds), isFallback: true };
}
