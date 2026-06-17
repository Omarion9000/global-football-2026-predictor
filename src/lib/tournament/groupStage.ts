// =============================================================================
// groupStage.ts (pure)
// =============================================================================
// Phase 9C — group standings + 2026 tiebreakers + best-third ranking. Pure
// functions: no I/O, no Date.now(), no RNG. The simulator feeds completed
// match results in; this module returns standings + 1st / 2nd qualifiers
// per group + the 8 best thirds across all 12 groups.
//
// Tiebreaker order within a group (matches the 2026 format):
//   1. Points (3 win / 1 draw / 0 loss)
//   2. Head-to-head points among tied teams
//   3. Head-to-head goal difference among tied teams
//   4. Head-to-head goals scored among tied teams
//   5. Overall goal difference
//   6. Overall goals scored
//   7. Fallback: deterministic model-strength (caller-supplied) — real FIFA
//      uses fair-play points + ranking; we don't model conduct/cards, so we
//      use the 9B Dixon-Coles strength as the final separator and document
//      the simplification in docs/20.
//
// Best-third ranking across groups uses a simpler ordering:
//   1. Points    2. Overall GD    3. Goals scored    4. Model strength fallback
// This mirrors the way FIFA orders the third-placed sides (the head-to-head
// criteria don't apply across groups since the teams never played each other).
// =============================================================================

export type GroupMatchResult = {
  /** Home team — the order of the teams as they appear in groups.json. */
  home: string;
  away: string;
  homeGoals: number;
  awayGoals: number;
};

export type TeamStanding = {
  team: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
};

export type GroupStandings = {
  group: string;
  /** Sorted from 1st place to 4th place after tiebreakers are applied. */
  rows: TeamStanding[];
};

/** Caller-supplied model strength used as the final tiebreaker. Higher means
 *  stronger; ties are broken alphabetically by team name to keep the function
 *  fully deterministic. */
export type ModelStrengthFn = (team: string) => number;

function emptyStanding(team: string): TeamStanding {
  return {
    team,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
  };
}

function applyResultToStanding(
  s: TeamStanding,
  goalsFor: number,
  goalsAgainst: number,
): void {
  s.played += 1;
  s.goalsFor += goalsFor;
  s.goalsAgainst += goalsAgainst;
  s.goalDifference = s.goalsFor - s.goalsAgainst;
  if (goalsFor > goalsAgainst) {
    s.wins += 1;
    s.points += 3;
  } else if (goalsFor < goalsAgainst) {
    s.losses += 1;
  } else {
    s.draws += 1;
    s.points += 1;
  }
}

/** Build per-team aggregate standings from a list of group match results.
 *  Pure: same input → same output. Teams not appearing in any result are
 *  initialised at zero. */
export function buildStandings(
  teams: ReadonlyArray<string>,
  matches: ReadonlyArray<GroupMatchResult>,
): TeamStanding[] {
  const byTeam = new Map<string, TeamStanding>();
  for (const t of teams) byTeam.set(t, emptyStanding(t));
  for (const m of matches) {
    const hs = byTeam.get(m.home);
    const as = byTeam.get(m.away);
    if (!hs || !as) {
      throw new Error(
        `buildStandings: match ${m.home} vs ${m.away} references a team not in this group's roster.`,
      );
    }
    applyResultToStanding(hs, m.homeGoals, m.awayGoals);
    applyResultToStanding(as, m.awayGoals, m.homeGoals);
  }
  return [...byTeam.values()];
}

/** Head-to-head sub-standings among a specific subset of tied teams.
 *  Returns a Map from team → sub-standing computed using ONLY the matches
 *  where both teams are in `tiedTeams`. */
function headToHeadStandings(
  tiedTeams: ReadonlySet<string>,
  matches: ReadonlyArray<GroupMatchResult>,
): Map<string, TeamStanding> {
  const sub = new Map<string, TeamStanding>();
  for (const t of tiedTeams) sub.set(t, emptyStanding(t));
  for (const m of matches) {
    if (!tiedTeams.has(m.home) || !tiedTeams.has(m.away)) continue;
    applyResultToStanding(sub.get(m.home)!, m.homeGoals, m.awayGoals);
    applyResultToStanding(sub.get(m.away)!, m.awayGoals, m.homeGoals);
  }
  return sub;
}

/**
 * Compare two teams within a tied cohort using the 2026 within-group rules.
 *
 *   Returns negative if a outranks b, positive if b outranks a, zero if
 *   genuinely indistinguishable (which falls through to the caller's
 *   downstream fallback — the model-strength tiebreak then a name tiebreak).
 */
function compareWithinTied(
  a: TeamStanding,
  b: TeamStanding,
  tiedHeadToHead: Map<string, TeamStanding>,
): number {
  // (1) Points (overall) — caller has already grouped by this, but include
  //     it defensively in case this helper is called outside the cohort path.
  if (b.points !== a.points) return b.points - a.points;
  // (2) Head-to-head points among the tied cohort.
  const hhA = tiedHeadToHead.get(a.team)!;
  const hhB = tiedHeadToHead.get(b.team)!;
  if (hhB.points !== hhA.points) return hhB.points - hhA.points;
  // (3) Head-to-head goal difference.
  if (hhB.goalDifference !== hhA.goalDifference)
    return hhB.goalDifference - hhA.goalDifference;
  // (4) Head-to-head goals scored.
  if (hhB.goalsFor !== hhA.goalsFor) return hhB.goalsFor - hhA.goalsFor;
  // (5) Overall goal difference.
  if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
  // (6) Overall goals scored.
  if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
  return 0;
}

/**
 * Sort a group's standings into 1st → 4th using the 2026 tiebreaker order
 * with a caller-supplied deterministic final fallback (model strength, then
 * name).
 */
export function rankGroup(
  teams: ReadonlyArray<string>,
  matches: ReadonlyArray<GroupMatchResult>,
  modelStrength: ModelStrengthFn,
): TeamStanding[] {
  const standings = buildStandings(teams, matches);
  // First-pass sort: by points (rough partition).
  standings.sort((a, b) => b.points - a.points);

  // Walk cohorts of teams with equal points and resolve internally.
  const final: TeamStanding[] = [];
  let i = 0;
  while (i < standings.length) {
    let j = i;
    while (j + 1 < standings.length && standings[j + 1].points === standings[i].points) {
      j += 1;
    }
    if (j === i) {
      final.push(standings[i]);
      i += 1;
      continue;
    }
    const cohort = standings.slice(i, j + 1);
    const tiedSet = new Set(cohort.map((s) => s.team));
    const hh = headToHeadStandings(tiedSet, matches);
    cohort.sort((a, b) => {
      const cmp = compareWithinTied(a, b, hh);
      if (cmp !== 0) return cmp;
      // Final fallback chain: model strength desc, then alphabetical for
      // total determinism.
      const ms = modelStrength(b.team) - modelStrength(a.team);
      if (ms !== 0) return ms;
      return a.team.localeCompare(b.team);
    });
    final.push(...cohort);
    i = j + 1;
  }
  return final;
}

export function rankAllGroups(
  groupRosters: ReadonlyArray<{ group: string; teams: ReadonlyArray<string> }>,
  matchesByGroup: ReadonlyMap<string, ReadonlyArray<GroupMatchResult>>,
  modelStrength: ModelStrengthFn,
): GroupStandings[] {
  return groupRosters.map(({ group, teams }) => ({
    group,
    rows: rankGroup(teams, matchesByGroup.get(group) ?? [], modelStrength),
  }));
}

// ---------------------------------------------------------------------------
// Best-third ranking
// ---------------------------------------------------------------------------

export type ThirdPlaceEntry = {
  group: string;
  /** The standing of the third-placed team in its group. */
  standing: TeamStanding;
};

/** Pick the N best third-placed teams across the 12 groups, sorted from
 *  rank 1 (best) to rank N. Uses: points, GD, GF, then model strength, then
 *  alphabetical. */
export function selectBestThirds(
  allGroupStandings: ReadonlyArray<GroupStandings>,
  n: number,
  modelStrength: ModelStrengthFn,
): ThirdPlaceEntry[] {
  if (allGroupStandings.length < n) {
    throw new Error(
      `selectBestThirds: requested ${n} thirds but only ${allGroupStandings.length} groups available.`,
    );
  }
  const candidates: ThirdPlaceEntry[] = allGroupStandings.map((g) => {
    if (g.rows.length < 3) {
      throw new Error(`selectBestThirds: group ${g.group} has fewer than 3 ranked teams.`);
    }
    return { group: g.group, standing: g.rows[2] };
  });
  candidates.sort((a, b) => {
    if (b.standing.points !== a.standing.points) return b.standing.points - a.standing.points;
    if (b.standing.goalDifference !== a.standing.goalDifference)
      return b.standing.goalDifference - a.standing.goalDifference;
    if (b.standing.goalsFor !== a.standing.goalsFor) return b.standing.goalsFor - a.standing.goalsFor;
    const ms = modelStrength(b.standing.team) - modelStrength(a.standing.team);
    if (ms !== 0) return ms;
    return a.standing.team.localeCompare(b.standing.team);
  });
  return candidates.slice(0, n);
}

// ---------------------------------------------------------------------------
// Round-robin schedule helper — every group plays 6 matches (4 teams * 3 / 2).
// We construct the schedule in a fixed order (1-2, 3-4, 1-3, 4-2, 4-1, 2-3)
// which mirrors the published 2026 group calendar. Pure: same teams → same
// schedule.
// ---------------------------------------------------------------------------

export function defaultGroupSchedule(
  teams: ReadonlyArray<string>,
): Array<{ home: string; away: string }> {
  if (teams.length !== 4) {
    throw new Error(
      `defaultGroupSchedule: expected exactly 4 teams, got ${teams.length}.`,
    );
  }
  const [t1, t2, t3, t4] = teams;
  // Matchday 1: t1 v t2, t3 v t4
  // Matchday 2: t1 v t3, t4 v t2
  // Matchday 3: t4 v t1, t2 v t3
  return [
    { home: t1, away: t2 },
    { home: t3, away: t4 },
    { home: t1, away: t3 },
    { home: t4, away: t2 },
    { home: t4, away: t1 },
    { home: t2, away: t3 },
  ];
}
