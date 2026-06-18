import { describe, expect, it } from 'vitest';
import { THIRD_PLACE_SLOTS } from '../bracket';
import { assignThirds, type AdvancingThird } from '../thirdPlaceAssignment';

// Phase 9E (Option 1a) — third-place assignment respects FIFA clusters.

function makeThird(group: string): AdvancingThird {
  return { group, team: `${group}-third` };
}

describe('assignThirds — perfect matching cases', () => {
  it('assigns 8 advancing thirds covering distinct groups so the matching is straightforward', () => {
    // Pick the 8 groups that appear most frequently across the clusters so a
    // perfect matching is guaranteed.
    const thirds = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map(makeThird);
    const r = assignThirds(thirds);
    expect(r.isFallback).toBe(false);
    expect(r.mapping.size).toBe(8);
    // Every slot received a third whose group is in the slot's cluster.
    for (const slot of THIRD_PLACE_SLOTS) {
      const team = r.mapping.get(slot.r32Index);
      expect(team).toBeDefined();
      const groupLetter = team!.charAt(0);
      expect(slot.cluster.includes(groupLetter)).toBe(true);
    }
  });

  it('respects clusters when 8 thirds span an arbitrary subset of groups', () => {
    // Try several other valid 8-of-12 subsets.
    const subsets: ReadonlyArray<ReadonlyArray<string>> = [
      ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
      ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'],
      ['A', 'C', 'E', 'G', 'I', 'K', 'B', 'D'],
      ['B', 'D', 'F', 'H', 'J', 'L', 'A', 'C'],
    ];
    for (const subset of subsets) {
      const thirds = subset.map(makeThird);
      const r = assignThirds(thirds);
      // Whether perfect or fallback, every slot's assigned third (where it
      // matches the cluster) confirms the constraint is respected on the
      // perfect-matching path.
      if (!r.isFallback) {
        for (const slot of THIRD_PLACE_SLOTS) {
          const team = r.mapping.get(slot.r32Index)!;
          expect(slot.cluster.includes(team.charAt(0))).toBe(true);
        }
      }
      // Either way every slot is filled exactly once with a distinct third.
      const teams = new Set([...r.mapping.values()]);
      expect(teams.size).toBe(8);
    }
  });
});

describe('assignThirds — fallback cases', () => {
  it('marks isFallback=true and still fills 8 slots when clusters are impossible to satisfy perfectly', () => {
    // Construct a degenerate input: 8 thirds from a single group letter that
    // is NOT in any third-place cluster (no such letter exists across all 8
    // clusters, but we can force impossibility by repeating one group).
    // Easier route: pick 8 thirds from a set that is too small to spread —
    // 4× group 'A' and 4× group 'B'. Clusters reference A in at most 3 slots
    // and B in at most 2; with 4 A-thirds we exceed the supply.
    const thirds: AdvancingThird[] = [];
    for (let i = 0; i < 4; i += 1) thirds.push({ group: 'A', team: `A-${i}` });
    for (let i = 0; i < 4; i += 1) thirds.push({ group: 'B', team: `B-${i}` });
    const r = assignThirds(thirds);
    expect(r.isFallback).toBe(true);
    expect(r.mapping.size).toBe(8);
    // Every team still ends up somewhere.
    const teams = new Set([...r.mapping.values()]);
    expect(teams.size).toBe(8);
  });

  it('throws when the third pool size does not match the slot count', () => {
    expect(() => assignThirds([])).toThrow(/expected 8 advancing thirds/);
    expect(() => assignThirds([makeThird('A')])).toThrow(/expected 8 advancing thirds/);
  });
});

describe('assignThirds — determinism', () => {
  it('produces identical mappings for identical inputs', () => {
    const thirds = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map(makeThird);
    const r1 = assignThirds(thirds);
    const r2 = assignThirds(thirds);
    expect([...r1.mapping.entries()].sort()).toEqual([...r2.mapping.entries()].sort());
    expect(r1.isFallback).toBe(r2.isFallback);
  });
});
