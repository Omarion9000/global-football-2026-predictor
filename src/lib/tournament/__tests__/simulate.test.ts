import { describe, expect, it } from 'vitest';
import {
  fitOnce,
  makeEngine,
  resolveKnockoutMatch,
  sampleScoreline,
} from '../matchModel';
import { runMonteCarlo, titleTable, type PlayedResult } from '../simulate';
import { makeRNG } from '@/lib/utils/rng';

// =============================================================================
// Synthetic 4-team groups (×12) using a tiny corpus so the DC fit completes
// in milliseconds. Every test pins a fixed seed for reproducibility.
// =============================================================================

const TEAMS_BY_GROUP = Array.from({ length: 12 }, (_, i) => ({
  group: String.fromCharCode(65 + i), // A..L
  teams: [`T${i}a`, `T${i}b`, `T${i}c`, `T${i}d`] as const,
}));
const ALL_TEAMS = TEAMS_BY_GROUP.flatMap((g) => g.teams);

function tinyCorpus() {
  // Each team plays ~6 matches against random opponents. Keeps the fit fast.
  const out: Array<{
    dateIso: string;
    homeTeam: string;
    awayTeam: string;
    homeGoals: number;
    awayGoals: number;
    neutral: boolean;
  }> = [];
  let day = 1;
  for (let i = 0; i < ALL_TEAMS.length; i += 1) {
    for (let j = i + 1; j < ALL_TEAMS.length; j += 1) {
      if ((i + j) % 7 !== 0) continue; // skip most pairs to keep the matrix small
      out.push({
        dateIso: `2024-01-${(day % 28 + 1).toString().padStart(2, '0')}`,
        homeTeam: ALL_TEAMS[i],
        awayTeam: ALL_TEAMS[j],
        homeGoals: 1 + ((i * j) % 3),
        awayGoals: (i + j) % 3,
        neutral: true,
      });
      day += 1;
    }
  }
  return out;
}

// =============================================================================
// Determinism: same seed + same inputs → identical aggregates
// =============================================================================

describe('runMonteCarlo — determinism', () => {
  it('produces identical aggregates for the same seed', () => {
    const corpus = tinyCorpus();
    const model = fitOnce(corpus, ALL_TEAMS, { maxIterations: 50 });
    const groups = TEAMS_BY_GROUP.map((g) => ({ group: g.group, teams: [...g.teams] }));
    const rng1 = makeRNG(123);
    const rng2 = makeRNG(123);
    const a1 = runMonteCarlo({ groups, playedResults: [], engine: makeEngine(model), rng: rng1 }, 50);
    const a2 = runMonteCarlo({ groups, playedResults: [], engine: makeEngine(model), rng: rng2 }, 50);
    // Champions count by team — should be identical.
    expect([...a1.wonTitle.entries()].sort()).toEqual([...a2.wonTitle.entries()].sort());
  });
});

// =============================================================================
// Pinned played results — variance is zero on those matches
// =============================================================================

describe('runMonteCarlo — pinned group result has 100% incidence', () => {
  it('a pinned 9-0 win shows the winner advancing as 1st with probability ≈ 1', () => {
    const corpus = tinyCorpus();
    const model = fitOnce(corpus, ALL_TEAMS, { maxIterations: 50 });
    const groups = TEAMS_BY_GROUP.map((g) => ({ group: g.group, teams: [...g.teams] }));

    // Pin EVERY group A match so T0a always sweeps the group 3-0-0.
    // The schedule helper produces a specific match order; we pin all 6.
    const playedResults: PlayedResult[] = [
      { stage: 'group', home: 'T0a', away: 'T0b', homeGoals: 9, awayGoals: 0 },
      { stage: 'group', home: 'T0c', away: 'T0d', homeGoals: 0, awayGoals: 0 },
      { stage: 'group', home: 'T0a', away: 'T0c', homeGoals: 9, awayGoals: 0 },
      { stage: 'group', home: 'T0d', away: 'T0b', homeGoals: 0, awayGoals: 0 },
      { stage: 'group', home: 'T0d', away: 'T0a', homeGoals: 0, awayGoals: 9 },
      { stage: 'group', home: 'T0b', away: 'T0c', homeGoals: 0, awayGoals: 0 },
    ];

    const rng = makeRNG(42);
    const agg = runMonteCarlo({ groups, playedResults, engine: makeEngine(model), rng }, 100);
    const inner = agg.groupFinish.get('A')!;
    // T0a finished 1st in every single pass (9-0 wins + 27 points, can't lose).
    expect(inner.get('T0a')![0]).toBe(100);
    // T0a never finishes anywhere else.
    expect(inner.get('T0a')![1]).toBe(0);
    expect(inner.get('T0a')![2]).toBe(0);
    expect(inner.get('T0a')![3]).toBe(0);
  });
});

// =============================================================================
// Probability sums
// =============================================================================

describe('runMonteCarlo — probability sums', () => {
  it('per-group position probabilities sum to 1 per team across positions', () => {
    const corpus = tinyCorpus();
    const model = fitOnce(corpus, ALL_TEAMS, { maxIterations: 30 });
    const groups = TEAMS_BY_GROUP.map((g) => ({ group: g.group, teams: [...g.teams] }));
    const rng = makeRNG(7);
    const N = 100;
    const agg = runMonteCarlo({ groups, playedResults: [], engine: makeEngine(model), rng }, N);
    for (const [, inner] of agg.groupFinish) {
      for (const [, counts] of inner) {
        const sum = counts[0] + counts[1] + counts[2] + counts[3];
        expect(sum).toBe(N);
      }
    }
  });

  it('title probabilities over all 48 teams sum to 1', () => {
    const corpus = tinyCorpus();
    const model = fitOnce(corpus, ALL_TEAMS, { maxIterations: 30 });
    const groups = TEAMS_BY_GROUP.map((g) => ({ group: g.group, teams: [...g.teams] }));
    const rng = makeRNG(9);
    const agg = runMonteCarlo({ groups, playedResults: [], engine: makeEngine(model), rng }, 200);
    const rows = titleTable(agg, ALL_TEAMS);
    const sumTitle = rows.reduce((s, r) => s + r.pTitle, 0);
    expect(sumTitle).toBeCloseTo(1, 5);
  });
});

// =============================================================================
// Knockout never returns a draw
// =============================================================================

describe('resolveKnockoutMatch', () => {
  it('always produces a decisive winner across 200 random matchups', () => {
    const corpus = tinyCorpus();
    const model = fitOnce(corpus, ALL_TEAMS, { maxIterations: 30 });
    const rng = makeRNG(11);
    for (let i = 0; i < 200; i += 1) {
      const ia = i % ALL_TEAMS.length;
      const ib = (i + 7) % ALL_TEAMS.length;
      if (ia === ib) continue;
      const outcome = resolveKnockoutMatch(model, ALL_TEAMS[ia], ALL_TEAMS[ib], rng);
      // homeWon is a definite boolean; there is no "draw" result.
      expect(typeof outcome.homeWon).toBe('boolean');
    }
  });
});

// =============================================================================
// Score sampler integrity
// =============================================================================

describe('sampleScoreline', () => {
  it('returns valid coordinates for a uniform 11×11 grid', () => {
    const grid: number[][] = [];
    const cell = 1 / (11 * 11);
    for (let x = 0; x < 11; x += 1) grid.push(new Array(11).fill(cell));
    const rng = makeRNG(3);
    for (let i = 0; i < 100; i += 1) {
      const { homeGoals, awayGoals } = sampleScoreline(grid, rng);
      expect(homeGoals).toBeGreaterThanOrEqual(0);
      expect(homeGoals).toBeLessThan(11);
      expect(awayGoals).toBeGreaterThanOrEqual(0);
      expect(awayGoals).toBeLessThan(11);
    }
  });
});
