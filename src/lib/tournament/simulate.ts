// =============================================================================
// simulate.ts (pure given an RNG)
// =============================================================================
// Phase 9C — Monte Carlo over the 2026 tournament. Treats every
// already-played match in `playedResults` as fixed (variance 0 for that
// match) and samples every other match from the Phase 9B DC model.
//
// One simulation pass = one walk through: group stage (6 matches × 12
// groups = 72) → 1st/2nd qualifiers + 8 best thirds → R32 (16) → R16 (8) →
// QF (4) → SF (2) → Final (1). Total 103 matches per pass.
//
// Pure with respect to the RNG: identical seed + identical inputs →
// identical aggregated probabilities.
// =============================================================================

import {
  defaultGroupSchedule,
  rankAllGroups,
  selectBestThirds,
  type GroupMatchResult,
  type GroupStandings,
} from './groupStage';
import {
  sampleScoreline,
  type MatchEngine,
} from './matchModel';
import {
  FINAL_PAIR,
  N_QF_MATCHES,
  N_R16_MATCHES,
  N_R32_MATCHES,
  N_SF_MATCHES,
  QF_PAIRS,
  R16_PAIRS,
  R32_MATCHES,
  SF_PAIRS,
  type SlotRef,
} from './bracket';
import { HOST_NATIONS } from './hostNations';
import { assignThirds, type AdvancingThird } from './thirdPlaceAssignment';
import type { RNG } from '@/lib/utils/rng';

export type GroupRoster = { group: string; teams: ReadonlyArray<string> };

export type PlayedResult = {
  stage: 'group' | 'r32' | 'r16' | 'qf' | 'sf' | 'final' | 'third_place';
  home: string;
  away: string;
  homeGoals: number;
  awayGoals: number;
};

export type SimOptions = {
  groups: ReadonlyArray<GroupRoster>;
  playedResults: ReadonlyArray<PlayedResult>;
  /** Model-agnostic engine. Build with `makeEngine` (9B) or `makeEngineConfed`
   *  (9B.2). */
  engine: MatchEngine;
  rng: RNG;
};

/** Aggregated counts across N simulation passes. Probabilities are computed
 *  at report time by dividing by N. */
export type SimAggregate = {
  passes: number;
  /** team → count of passes where that team reached each stage. */
  reachedR32: Map<string, number>;
  reachedR16: Map<string, number>;
  reachedQF: Map<string, number>;
  reachedSF: Map<string, number>;
  reachedFinal: Map<string, number>;
  wonTitle: Map<string, number>;
  /** Per-group: team → count of passes where they finished {1st, 2nd, 3rd, 4th}. */
  groupFinish: Map<string, Map<string, [number, number, number, number]>>;
  /** Phase 9E (Option 1a): number of passes in which the third-place cluster
   *  constraints could not be perfectly satisfied and the deterministic
   *  fallback was used to fill the 8 R32 slots. */
  thirdPlaceFallbackCount: number;
};

function emptyAggregate(groups: ReadonlyArray<GroupRoster>): SimAggregate {
  const groupFinish = new Map<string, Map<string, [number, number, number, number]>>();
  for (const g of groups) {
    const inner = new Map<string, [number, number, number, number]>();
    for (const t of g.teams) inner.set(t, [0, 0, 0, 0]);
    groupFinish.set(g.group, inner);
  }
  return {
    passes: 0,
    reachedR32: new Map(),
    reachedR16: new Map(),
    reachedQF: new Map(),
    reachedSF: new Map(),
    reachedFinal: new Map(),
    wonTitle: new Map(),
    groupFinish,
    thirdPlaceFallbackCount: 0,
  };
}

function inc(m: Map<string, number>, key: string): void {
  m.set(key, (m.get(key) ?? 0) + 1);
}

// ---------------------------------------------------------------------------
// Played-result indexing
// ---------------------------------------------------------------------------

/** Key for matching a played result back to a scheduled match.
 *  Unordered — `key(A, B) === key(B, A)`. */
function pairKey(a: string, b: string): string {
  return a < b ? `${a}||${b}` : `${b}||${a}`;
}

type PlayedIndex = {
  group: Map<string, GroupMatchResult>;
  // For knockout matches we don't know the bracket position upfront, so we
  // also index by team-pair: when we see a knockout match between A and B
  // and there's a played result, we use it.
  knockoutByPair: Map<string, PlayedResult>;
};

/** Phase 9F: simulate a single group-stage match, applying the model's
 *  fitted home-advantage term to a host nation playing at home — even when
 *  the round-robin schedule has the host listed as the "away" team. Returns
 *  the scoreline in the schedule's home/away orientation so downstream
 *  tiebreakers + pinned-result lookups stay consistent.
 *
 *  Rules:
 *    - Exactly one of the two teams is a host → apply homeAdv to the host.
 *    - Neither is a host → neutral matrix in schedule orientation (status quo).
 *    - Both are hosts (impossible in 2026 since each host is in a different
 *      group, but guarded anyway) → neutral.
 */
function sampleHostAwareGroupMatch(
  engine: MatchEngine,
  fixture: { home: string; away: string },
  rng: RNG,
): { homeGoals: number; awayGoals: number } {
  const homeIsHost = HOST_NATIONS.has(fixture.home);
  const awayIsHost = HOST_NATIONS.has(fixture.away);
  if (homeIsHost && !awayIsHost) {
    // Schedule home is the host — natural orientation.
    const grid = engine.scoreMatrixFor(fixture.home, fixture.away, false);
    return sampleScoreline(grid, rng);
  }
  if (!homeIsHost && awayIsHost) {
    // Schedule away is the host — host physically plays at home. Compute
    // the matrix with the host on the home side, then flip the resulting
    // scoreline back to the schedule's orientation.
    const grid = engine.scoreMatrixFor(fixture.away, fixture.home, false);
    const s = sampleScoreline(grid, rng);
    return { homeGoals: s.awayGoals, awayGoals: s.homeGoals };
  }
  const grid = engine.scoreMatrixFor(fixture.home, fixture.away, true);
  return sampleScoreline(grid, rng);
}

function indexPlayed(playedResults: ReadonlyArray<PlayedResult>): PlayedIndex {
  const group = new Map<string, GroupMatchResult>();
  const knockoutByPair = new Map<string, PlayedResult>();
  for (const r of playedResults) {
    if (r.stage === 'group') {
      // Group matches index by (home, away) since the schedule pins home/away.
      group.set(`${r.home}||${r.away}`, {
        home: r.home,
        away: r.away,
        homeGoals: r.homeGoals,
        awayGoals: r.awayGoals,
      });
    } else {
      knockoutByPair.set(pairKey(r.home, r.away), r);
    }
  }
  return { group, knockoutByPair };
}

// ---------------------------------------------------------------------------
// One simulation pass
// ---------------------------------------------------------------------------

function simulateOnePass(opts: SimOptions, played: PlayedIndex): SimPassResult {
  // Phase 1: group stage. For each group, play all 6 scheduled matches —
  // use the played result when present, otherwise sample from the model.
  //
  // Phase 9F: a host nation playing in the group stage is at home, even when
  // the round-robin schedule labels them as "away". We compute the score
  // matrix with the host on the home side (so the fitted homeAdv term applies
  // in the host's favour) and, when the schedule's away team is the host,
  // we map the sampled scoreline back to the schedule's home/away
  // orientation so downstream tiebreakers + pinned-result indexing stay
  // consistent. Knockouts continue to call the engine with the default
  // neutral=true.
  const matchesByGroup = new Map<string, GroupMatchResult[]>();
  for (const g of opts.groups) {
    const schedule = defaultGroupSchedule(g.teams);
    const out: GroupMatchResult[] = [];
    for (const fixture of schedule) {
      const pinned = played.group.get(`${fixture.home}||${fixture.away}`);
      if (pinned) {
        out.push(pinned);
        continue;
      }
      const score = sampleHostAwareGroupMatch(opts.engine, fixture, opts.rng);
      out.push({
        home: fixture.home,
        away: fixture.away,
        homeGoals: score.homeGoals,
        awayGoals: score.awayGoals,
      });
    }
    matchesByGroup.set(g.group, out);
  }

  // Phase 2: rank each group; pick 8 best thirds.
  const standings = rankAllGroups(
    opts.groups,
    matchesByGroup,
    (team) => opts.engine.modelStrength(team),
  );
  const bestThirds = selectBestThirds(standings, 8, (team) => opts.engine.modelStrength(team));

  // Phase 3: resolve each R32 slot to a team.
  const standingsByGroup = new Map<string, GroupStandings>();
  for (const s of standings) standingsByGroup.set(s.group, s);

  // Phase 9E: third-place slots are cluster-constrained. Assign the 8 best
  // thirds to the 8 R32 third-place slots via bipartite matching against the
  // FIFA clusters. Falls back to a deterministic assignment when no perfect
  // matching exists; we propagate the fallback flag up so the aggregate can
  // count occurrences.
  const advancingThirds: AdvancingThird[] = bestThirds.map((entry) => ({
    group: entry.group,
    team: entry.standing.team,
  }));
  const thirdsAssignment = assignThirds(advancingThirds);

  function teamForSlot(slot: SlotRef, r32Index: number): string {
    if (slot.kind === 'winner') return standingsByGroup.get(slot.group)!.rows[0].team;
    if (slot.kind === 'runnerUp') return standingsByGroup.get(slot.group)!.rows[1].team;
    const team = thirdsAssignment.mapping.get(r32Index);
    if (!team) {
      throw new Error(`simulate: third-place slot at R32 index ${r32Index} was not assigned.`);
    }
    return team;
  }

  // Phase 4: knockout walk. Use played results when present.
  const r32Winners = new Array<string>(N_R32_MATCHES);
  for (let i = 0; i < N_R32_MATCHES; i += 1) {
    const [sA, sB] = R32_MATCHES[i];
    const a = teamForSlot(sA, i);
    const b = teamForSlot(sB, i);
    const pinned = played.knockoutByPair.get(pairKey(a, b));
    if (pinned) {
      // Pinned knockout result — caller is responsible for ensuring the
      // result is decisive (one team scored more than the other after any
      // ET / penalties). We respect the listed scores; tie-with-penalties
      // outcomes can be encoded by the caller as (1, 0) etc.
      if (pinned.homeGoals === pinned.awayGoals) {
        throw new Error(
          `simulate: pinned knockout result ${a} vs ${b} is a draw — must be decisive.`,
        );
      }
      r32Winners[i] = pinned.homeGoals > pinned.awayGoals ? pinned.home : pinned.away;
    } else {
      const outcome = opts.engine.resolveKnockoutMatch(a, b, opts.rng);
      r32Winners[i] = outcome.homeWon ? a : b;
    }
  }

  // R16
  const r16Winners = new Array<string>(N_R16_MATCHES);
  for (let i = 0; i < N_R16_MATCHES; i += 1) {
    const [ia, ib] = R16_PAIRS[i];
    const a = r32Winners[ia];
    const b = r32Winners[ib];
    const pinned = played.knockoutByPair.get(pairKey(a, b));
    if (pinned) {
      if (pinned.homeGoals === pinned.awayGoals) {
        throw new Error(`simulate: pinned R16 result ${a} vs ${b} is a draw — must be decisive.`);
      }
      r16Winners[i] = pinned.homeGoals > pinned.awayGoals ? pinned.home : pinned.away;
    } else {
      const outcome = opts.engine.resolveKnockoutMatch(a, b, opts.rng);
      r16Winners[i] = outcome.homeWon ? a : b;
    }
  }

  // QF
  const qfWinners = new Array<string>(N_QF_MATCHES);
  for (let i = 0; i < N_QF_MATCHES; i += 1) {
    const [ia, ib] = QF_PAIRS[i];
    const a = r16Winners[ia];
    const b = r16Winners[ib];
    const pinned = played.knockoutByPair.get(pairKey(a, b));
    if (pinned) {
      if (pinned.homeGoals === pinned.awayGoals) {
        throw new Error(`simulate: pinned QF result ${a} vs ${b} is a draw — must be decisive.`);
      }
      qfWinners[i] = pinned.homeGoals > pinned.awayGoals ? pinned.home : pinned.away;
    } else {
      const outcome = opts.engine.resolveKnockoutMatch(a, b, opts.rng);
      qfWinners[i] = outcome.homeWon ? a : b;
    }
  }

  // SF
  const sfWinners = new Array<string>(N_SF_MATCHES);
  for (let i = 0; i < N_SF_MATCHES; i += 1) {
    const [ia, ib] = SF_PAIRS[i];
    const a = qfWinners[ia];
    const b = qfWinners[ib];
    const pinned = played.knockoutByPair.get(pairKey(a, b));
    if (pinned) {
      if (pinned.homeGoals === pinned.awayGoals) {
        throw new Error(`simulate: pinned SF result ${a} vs ${b} is a draw — must be decisive.`);
      }
      sfWinners[i] = pinned.homeGoals > pinned.awayGoals ? pinned.home : pinned.away;
    } else {
      const outcome = opts.engine.resolveKnockoutMatch(a, b, opts.rng);
      sfWinners[i] = outcome.homeWon ? a : b;
    }
  }

  // Final
  const [fa, fb] = FINAL_PAIR;
  const finalA = sfWinners[fa];
  const finalB = sfWinners[fb];
  let champion: string;
  const pinnedFinal = played.knockoutByPair.get(pairKey(finalA, finalB));
  if (pinnedFinal) {
    if (pinnedFinal.homeGoals === pinnedFinal.awayGoals) {
      throw new Error(`simulate: pinned final result ${finalA} vs ${finalB} is a draw — must be decisive.`);
    }
    champion = pinnedFinal.homeGoals > pinnedFinal.awayGoals ? pinnedFinal.home : pinnedFinal.away;
  } else {
    const outcome = opts.engine.resolveKnockoutMatch(finalA, finalB, opts.rng);
    champion = outcome.homeWon ? finalA : finalB;
  }

  return {
    standings,
    bestThirds: bestThirds.map((b) => b.standing.team),
    r32Winners,
    r16Winners,
    qfWinners,
    sfWinners,
    finalists: [finalA, finalB],
    champion,
    thirdPlaceFallback: thirdsAssignment.isFallback,
  };
}

type SimPassResult = {
  standings: GroupStandings[];
  bestThirds: string[];
  r32Winners: string[];
  r16Winners: string[];
  qfWinners: string[];
  sfWinners: string[];
  finalists: [string, string];
  champion: string;
  thirdPlaceFallback: boolean;
};

/** Run `n` independent Monte Carlo passes and aggregate per-team counts. */
export function runMonteCarlo(opts: SimOptions, n: number): SimAggregate {
  const played = indexPlayed(opts.playedResults);
  const agg = emptyAggregate(opts.groups);
  for (let pass = 0; pass < n; pass += 1) {
    const r = simulateOnePass(opts, played);
    // Group finishing positions.
    for (const s of r.standings) {
      const inner = agg.groupFinish.get(s.group)!;
      for (let pos = 0; pos < s.rows.length; pos += 1) {
        const arr = inner.get(s.rows[pos].team)!;
        arr[pos] += 1;
      }
    }
    // R32 entrants: 12 winners + 12 runners-up + 8 best thirds = 32.
    const r32Entrants = new Set<string>();
    for (const s of r.standings) {
      r32Entrants.add(s.rows[0].team);
      r32Entrants.add(s.rows[1].team);
    }
    for (const t of r.bestThirds) r32Entrants.add(t);
    for (const t of r32Entrants) inc(agg.reachedR32, t);

    for (const t of r.r32Winners) inc(agg.reachedR16, t);
    for (const t of r.r16Winners) inc(agg.reachedQF, t);
    for (const t of r.qfWinners) inc(agg.reachedSF, t);
    for (const t of r.sfWinners) inc(agg.reachedFinal, t);
    inc(agg.wonTitle, r.champion);
    if (r.thirdPlaceFallback) agg.thirdPlaceFallbackCount += 1;
    agg.passes += 1;
  }
  return agg;
}

// ---------------------------------------------------------------------------
// Reporting helpers
// ---------------------------------------------------------------------------

export type TitleRow = {
  team: string;
  pTitle: number;
  pFinal: number;
  pSF: number;
  pQF: number;
  pR16: number;
};

export function titleTable(agg: SimAggregate, teams: ReadonlyArray<string>): TitleRow[] {
  const n = agg.passes;
  return teams
    .map((team) => ({
      team,
      pTitle: (agg.wonTitle.get(team) ?? 0) / n,
      pFinal: (agg.reachedFinal.get(team) ?? 0) / n,
      pSF: (agg.reachedSF.get(team) ?? 0) / n,
      pQF: (agg.reachedQF.get(team) ?? 0) / n,
      pR16: (agg.reachedR16.get(team) ?? 0) / n,
    }))
    .sort((a, b) => b.pTitle - a.pTitle || b.pFinal - a.pFinal || b.pSF - a.pSF);
}
