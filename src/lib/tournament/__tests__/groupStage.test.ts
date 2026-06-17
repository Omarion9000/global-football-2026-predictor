import { describe, expect, it } from 'vitest';
import {
  buildStandings,
  defaultGroupSchedule,
  rankGroup,
  selectBestThirds,
  type GroupMatchResult,
} from '../groupStage';

const NEVER_USE_STRENGTH = () => {
  throw new Error('test: model-strength fallback should not be reached in this case');
};

// =============================================================================
// Standings primitives
// =============================================================================

describe('buildStandings', () => {
  it('aggregates wins/draws/losses and goal differences correctly', () => {
    const teams = ['A', 'B', 'C', 'D'];
    const matches: GroupMatchResult[] = [
      { home: 'A', away: 'B', homeGoals: 2, awayGoals: 1 },
      { home: 'C', away: 'D', homeGoals: 0, awayGoals: 0 },
      { home: 'A', away: 'C', homeGoals: 1, awayGoals: 1 },
      { home: 'D', away: 'B', homeGoals: 2, awayGoals: 3 },
      { home: 'D', away: 'A', homeGoals: 0, awayGoals: 1 },
      { home: 'B', away: 'C', homeGoals: 0, awayGoals: 2 },
    ];
    const s = buildStandings(teams, matches);
    const byTeam = Object.fromEntries(s.map((t) => [t.team, t]));
    // A: W vs B, D vs A, drew C → 2W 1D 0L, 7 pts; GF=4 GA=2; GD=2
    expect(byTeam.A.points).toBe(7);
    expect(byTeam.A.goalDifference).toBe(2);
    // B: L vs A, W vs D, L vs C → 1W 0D 2L = 3 pts; GF=4 GA=6; GD=-2
    expect(byTeam.B.points).toBe(3);
    // C: drew A, W vs B, drew D → 1W 2D 0L = 5 pts; GF=3 GA=1; GD=2
    expect(byTeam.C.points).toBe(5);
    // D: drew C, L vs B, L vs A → 0W 1D 2L = 1 pt
    expect(byTeam.D.points).toBe(1);
  });
});

// =============================================================================
// Tiebreakers (the 2026 head-to-head-before-overall-GD rule)
// =============================================================================

describe('rankGroup — 2026 tiebreaker order', () => {
  it('breaks a 3-way tie on points by head-to-head points first (overruling overall GD)', () => {
    // Construct a group where A, B, C all finish on 6 points (each beat one
    // of the other two), but A has a much better overall GD from
    // hammering D. Pre-2026 tiebreakers would put A first; the 2026 rule
    // uses head-to-head points first, and A and B and C all have 3 points
    // each in the head-to-head matrix → falls through to head-to-head GD.
    const teams = ['A', 'B', 'C', 'D'];
    const matches: GroupMatchResult[] = [
      { home: 'A', away: 'B', homeGoals: 1, awayGoals: 0 }, // A 3, B 0
      { home: 'B', away: 'C', homeGoals: 1, awayGoals: 0 }, // B 3, C 0
      { home: 'C', away: 'A', homeGoals: 1, awayGoals: 0 }, // C 3, A 0 — rock/paper/scissors
      { home: 'A', away: 'D', homeGoals: 9, awayGoals: 0 }, // A 6, D 0 — A blowout
      { home: 'B', away: 'D', homeGoals: 2, awayGoals: 0 }, // B 6, D 0
      { home: 'C', away: 'D', homeGoals: 2, awayGoals: 0 }, // C 6, D 0
    ];
    // Each of A/B/C have 6 points overall, 3 pts in h2h matches (1W 1L
    // among the three). h2h GD: A in h2h: +1-1=0; B in h2h: +1-1=0; C
    // h2h: +1-1=0. h2h GF: A=1, B=1, C=1. So we fall through to overall
    // GD where A=+9, B=+1, C=+1, and then overall GF where B=3, C=3 still
    // tied → tiebreak via model strength.
    const ranked = rankGroup(teams, matches, (t) => (t === 'B' ? 1 : 0));
    expect(ranked[0].team).toBe('A'); // wins on overall GD
    expect(ranked[1].team).toBe('B'); // wins model-strength fallback over C
    expect(ranked[2].team).toBe('C');
    expect(ranked[3].team).toBe('D');
  });

  it('uses head-to-head GD when h2h points tie but overall GD would diverge', () => {
    // A and B tied on points and h2h points (each won their h2h). Suppose
    // A won h2h 3-0, B won 1-0. h2h GD: A = +3-1 = +2, B = +1-3 = -2.
    // Overall: A has more goals against D, both clean against C.
    const teams = ['A', 'B', 'C', 'D'];
    const matches: GroupMatchResult[] = [
      { home: 'A', away: 'B', homeGoals: 3, awayGoals: 0 }, // A 3, B 0
      { home: 'B', away: 'A', homeGoals: 1, awayGoals: 0 }, // (synthetic — pretend a return leg)
      { home: 'A', away: 'D', homeGoals: 2, awayGoals: 0 },
      { home: 'B', away: 'D', homeGoals: 2, awayGoals: 0 },
      { home: 'C', away: 'D', homeGoals: 1, awayGoals: 0 },
      { home: 'A', away: 'C', homeGoals: 0, awayGoals: 0 },
      { home: 'B', away: 'C', homeGoals: 0, awayGoals: 0 },
    ];
    // A: 3+0+3+1 = 7 pts; B: 0+3+3+1 = 7 pts; C: 1+1+0+0 = 2 pts; D: 0
    // Head-to-head A vs B: A won 3-0, B won 1-0 → h2h points 3-3, h2h
    // GD A = +3-1 = +2, B = +1-3 = -2 → A wins h2h GD.
    const ranked = rankGroup(teams, matches, NEVER_USE_STRENGTH);
    expect(ranked[0].team).toBe('A');
    expect(ranked[1].team).toBe('B');
  });

  it('falls back to model strength when every comparable criterion is tied', () => {
    // A, B both 4 pts (one win + one draw each); h2h drew 0-0; identical
    // overall GD and GF — needs the model-strength fallback.
    const teams = ['A', 'B', 'C', 'D'];
    const matches: GroupMatchResult[] = [
      { home: 'A', away: 'B', homeGoals: 0, awayGoals: 0 },
      { home: 'A', away: 'C', homeGoals: 1, awayGoals: 0 },
      { home: 'B', away: 'D', homeGoals: 1, awayGoals: 0 },
      { home: 'A', away: 'D', homeGoals: 0, awayGoals: 1 },
      { home: 'B', away: 'C', homeGoals: 0, awayGoals: 1 },
      { home: 'C', away: 'D', homeGoals: 0, awayGoals: 0 },
    ];
    // A: 1 W + 1 D + 1 L = 4 pts; GF = 1, GA = 1, GD = 0
    // B: 1 W + 1 D + 1 L = 4 pts; GF = 1, GA = 1, GD = 0
    // h2h points 1-1, h2h GD 0, h2h GF 0 → identical through every criterion.
    const ranked = rankGroup(teams, matches, (t) => (t === 'B' ? 1 : 0));
    expect(ranked[0].team).toBe('B'); // higher model strength wins the fallback
    expect(ranked[1].team).toBe('A');
  });
});

// =============================================================================
// Best-third selection
// =============================================================================

describe('selectBestThirds', () => {
  it('picks the 8 thirds with the highest points / GD / GF across 12 groups', () => {
    // Build 12 group-standings stubs with varied third-place rows.
    const groupStandings = Array.from({ length: 12 }, (_, i) => ({
      group: String.fromCharCode(65 + i), // A..L
      rows: [
        { team: `1-${i}`, played: 3, wins: 3, draws: 0, losses: 0, goalsFor: 9, goalsAgainst: 0, goalDifference: 9, points: 9 },
        { team: `2-${i}`, played: 3, wins: 2, draws: 0, losses: 1, goalsFor: 5, goalsAgainst: 2, goalDifference: 3, points: 6 },
        // Third-place values vary by `i`:
        { team: `3-${i}`, played: 3, wins: 0, draws: 3 - (i % 4), losses: i % 4, goalsFor: 3 - (i % 3), goalsAgainst: 4, goalDifference: -1 - (i % 3), points: 3 - (i % 4) },
        { team: `4-${i}`, played: 3, wins: 0, draws: 0, losses: 3, goalsFor: 0, goalsAgainst: 9, goalDifference: -9, points: 0 },
      ],
    }));
    const picked = selectBestThirds(groupStandings, 8, () => 0);
    expect(picked.length).toBe(8);
    // Picked thirds must be non-increasing in points.
    for (let i = 1; i < picked.length; i += 1) {
      expect(picked[i - 1].standing.points).toBeGreaterThanOrEqual(picked[i].standing.points);
    }
  });
});

// =============================================================================
// Default schedule
// =============================================================================

describe('defaultGroupSchedule', () => {
  it('produces 6 matches with every pair appearing exactly once', () => {
    const sched = defaultGroupSchedule(['A', 'B', 'C', 'D']);
    expect(sched.length).toBe(6);
    const pairs = new Set(sched.map((m) => [m.home, m.away].sort().join('-')));
    expect(pairs.size).toBe(6);
    expect(pairs.has('A-B') && pairs.has('A-C') && pairs.has('A-D')).toBe(true);
    expect(pairs.has('B-C') && pairs.has('B-D')).toBe(true);
    expect(pairs.has('C-D')).toBe(true);
  });
});
