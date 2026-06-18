import { describe, expect, it } from 'vitest';
import { FLAG_CODE_BY_SLUG } from '../flagCodes';
import { getTournamentSim } from '../loadTournamentSim';

// Phase 9D — contract tests for the committed UI JSON. These guard the
// invariants the three views (title odds, groups, bracket) silently assume.

const sim = getTournamentSim();

describe('tournament-sim.json — meta', () => {
  it('declares the canonical model and a reproducible seed/n', () => {
    expect(sim.meta.model).toBe('confed');
    expect(sim.meta.seed).toBeTypeOf('number');
    expect(sim.meta.n).toBeGreaterThanOrEqual(10000);
  });

  it('was generated within a sensible window', () => {
    const t = Date.parse(sim.meta.generatedAt);
    expect(Number.isFinite(t)).toBe(true);
    expect(t).toBeGreaterThan(Date.parse('2026-01-01T00:00:00Z'));
  });
});

describe('tournament-sim.json — teams', () => {
  it('has all 48 tournament teams', () => {
    expect(sim.teams).toHaveLength(48);
  });

  it('sorts teams by P(title) descending', () => {
    for (let i = 1; i < sim.teams.length; i += 1) {
      expect(sim.teams[i - 1].pTitle).toBeGreaterThanOrEqual(sim.teams[i].pTitle);
    }
  });

  it('sums P(title) to ≈ 1 across all 48 teams (one champion per tournament)', () => {
    const sum = sim.teams.reduce((s, t) => s + t.pTitle, 0);
    expect(sum).toBeCloseTo(1, 5);
  });

  it('respects cumulative round invariant pR16 ≥ pQF ≥ pSF ≥ pFinal ≥ pTitle', () => {
    for (const t of sim.teams) {
      expect(t.pR16).toBeGreaterThanOrEqual(t.pQF);
      expect(t.pQF).toBeGreaterThanOrEqual(t.pSF);
      expect(t.pSF).toBeGreaterThanOrEqual(t.pFinal);
      expect(t.pFinal).toBeGreaterThanOrEqual(t.pTitle);
    }
  });

  it('every team has a flag code present in the flagCodes map', () => {
    const known = new Set(Object.values(FLAG_CODE_BY_SLUG));
    for (const t of sim.teams) {
      expect(known.has(t.iso2)).toBe(true);
    }
  });

  it('every team has a non-empty slug, displayName, ISO 3-letter code, and group label A–L', () => {
    const groups = new Set(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']);
    for (const t of sim.teams) {
      expect(t.slug.length).toBeGreaterThan(0);
      expect(t.displayName.length).toBeGreaterThan(0);
      expect(t.code).toMatch(/^[A-Z]{3}$/);
      expect(groups.has(t.group)).toBe(true);
    }
  });

  it('every team has a recognised confederation', () => {
    const confs = new Set(['AFC', 'CAF', 'CONCACAF', 'CONMEBOL', 'OFC', 'UEFA']);
    for (const t of sim.teams) {
      expect(confs.has(t.confederation)).toBe(true);
    }
  });
});

describe('tournament-sim.json — groups', () => {
  it('has 12 groups labelled A through L', () => {
    expect(sim.groups).toHaveLength(12);
    expect(sim.groups.map((g) => g.group)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']);
  });

  it('each group has exactly 4 teams', () => {
    for (const g of sim.groups) {
      expect(g.teams).toHaveLength(4);
    }
  });

  it('each team in each group has p1st + p2nd + p3rd + p4th = 1', () => {
    for (const g of sim.groups) {
      for (const t of g.teams) {
        const sum = t.p1st + t.p2nd + t.p3rd + t.p4th;
        expect(sum).toBeCloseTo(1, 3);
      }
    }
  });

  it('the sum of P(1st) across all teams in a group is 1 (exactly one winner)', () => {
    for (const g of sim.groups) {
      const sum = g.teams.reduce((s, t) => s + t.p1st, 0);
      expect(sum).toBeCloseTo(1, 3);
    }
  });

  it('teams are sorted by P(1st) descending within their group', () => {
    for (const g of sim.groups) {
      for (let i = 1; i < g.teams.length; i += 1) {
        expect(g.teams[i - 1].p1st).toBeGreaterThanOrEqual(g.teams[i].p1st);
      }
    }
  });

  it('the union of group teams equals the 48-team set', () => {
    const groupSlugs = new Set(sim.groups.flatMap((g) => g.teams.map((t) => t.slug)));
    expect(groupSlugs.size).toBe(48);
  });
});

describe('tournament-sim.json — bracket', () => {
  it('has 16 R32 matches, 8 R16 pairs, 4 QF pairs, 2 SF pairs, 1 Final', () => {
    expect(sim.bracket.r32).toHaveLength(16);
    expect(sim.bracket.r16Pairs).toHaveLength(8);
    expect(sim.bracket.qfPairs).toHaveLength(4);
    expect(sim.bracket.sfPairs).toHaveLength(2);
    expect(sim.bracket.finalPair).toHaveLength(2);
  });

  it('every R16/QF/SF/Final pair indexes into the previous round', () => {
    for (const [a, b] of sim.bracket.r16Pairs) {
      expect(a).toBeLessThan(16);
      expect(b).toBeLessThan(16);
    }
    for (const [a, b] of sim.bracket.qfPairs) {
      expect(a).toBeLessThan(8);
      expect(b).toBeLessThan(8);
    }
    for (const [a, b] of sim.bracket.sfPairs) {
      expect(a).toBeLessThan(4);
      expect(b).toBeLessThan(4);
    }
    expect(sim.bracket.finalPair[0]).toBeLessThan(2);
    expect(sim.bracket.finalPair[1]).toBeLessThan(2);
  });

  it('every R32 slot resolves to a known group letter or FIFA cluster', () => {
    const groups = new Set(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']);
    for (const m of sim.bracket.r32) {
      for (const slot of [m.home, m.away]) {
        if (slot.kind === 'thirdPlace') {
          // Phase 9E: third-place slots carry a FIFA cluster set, not a rank.
          expect(slot.cluster.length).toBe(5);
          for (const g of slot.cluster) {
            expect(groups.has(g)).toBe(true);
          }
          // No repeated groups within a cluster.
          expect(new Set(slot.cluster).size).toBe(slot.cluster.length);
        } else {
          expect(groups.has(slot.group)).toBe(true);
        }
        expect(slot.label.length).toBeGreaterThan(0);
      }
    }
  });

  it('the bracket has exactly 8 third-place slots across the 16 R32 matches', () => {
    let count = 0;
    for (const m of sim.bracket.r32) {
      if (m.home.kind === 'thirdPlace') count += 1;
      if (m.away.kind === 'thirdPlace') count += 1;
    }
    expect(count).toBe(8);
  });

  it('every R32 idx is unique 0..15', () => {
    const seen = new Set<number>();
    for (const m of sim.bracket.r32) seen.add(m.idx);
    expect([...seen].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  });

  it('surfaces the placeholder-bracket note', () => {
    expect(sim.bracket.placeholderNote.length).toBeGreaterThan(20);
  });
});
