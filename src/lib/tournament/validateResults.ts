// =============================================================================
// validateResults.ts — Phase 9F.1
// =============================================================================
// Strict validation for `data/tournament/results.json`.
//
// Why: prior to 9F.1, a typo'd team name, an inverted home/away order, or a
// misspelled `stage` caused the runner to SILENTLY drop the pinned match and
// simulate it from the model instead. The UI then read `meta.playedMatches: N`
// while the sim had actually re-rolled some of those N matches. Phase 9F.1
// makes those mistakes throw a clear `Error` BEFORE the 12-second fit so the
// operator can fix the JSON and re-run, instead of shipping a silently-broken
// canonical prediction.
//
// This module is pure: no engine math, no model state, no schema, no
// simulation logic. It only reads + checks.
// =============================================================================

import { defaultGroupSchedule } from './groupStage';
import { resolveNation } from '@/lib/data/sources/internationalResults/teamMap';

export const VALID_STAGES = [
  'group',
  'r32',
  'r16',
  'qf',
  'sf',
  'final',
  'third_place',
] as const;
export type Stage = (typeof VALID_STAGES)[number];

const VALID_STAGES_SET: ReadonlySet<string> = new Set(VALID_STAGES);
const KNOCKOUT_STAGES: ReadonlySet<string> = new Set([
  'r32',
  'r16',
  'qf',
  'sf',
  'final',
  'third_place',
]);

export type RawResult = {
  readonly stage?: unknown;
  readonly home?: unknown;
  readonly away?: unknown;
  readonly homeGoals?: unknown;
  readonly awayGoals?: unknown;
};

export type GroupRosterCanonical = {
  readonly group: string;
  /** Teams in the canonical groups.json order (matters for defaultGroupSchedule). */
  readonly teams: ReadonlyArray<string>;
};

/** Throw on the first invalid entry. Error messages always name:
 *    - the result's 1-based index (so the operator can `jq` straight to it),
 *    - the entry's raw home/away strings as the user wrote them,
 *    - the specific rule that failed, with a hint when there's an obvious
 *      fix (canonical name to use, schedule orientation to swap, etc.).
 *
 *  Pure: no global state, no I/O, deterministic. Safe to call before the fit. */
export function validateResults(
  rawResults: ReadonlyArray<RawResult>,
  groupsRoster: ReadonlyArray<GroupRosterCanonical>,
): void {
  if (!Array.isArray(rawResults)) {
    throw new Error('validateResults: top-level "results" must be an array.');
  }

  // Pre-compute per-group schedules + a canonical-name → group letter index
  // for fast cross-checks. These derive from `defaultGroupSchedule`, so a
  // schema change there flows through automatically.
  const groupSchedules = new Map<string, ReadonlyArray<{ home: string; away: string }>>();
  const groupOfTeam = new Map<string, string>();
  const allRosterTeams = new Set<string>();
  for (const grp of groupsRoster) {
    groupSchedules.set(grp.group, defaultGroupSchedule(grp.teams));
    for (const t of grp.teams) {
      groupOfTeam.set(t, grp.group);
      allRosterTeams.add(t);
    }
  }

  // Track (stage, homeSlug, awaySlug) tuples to detect duplicates.
  const seen = new Map<string, number>(); // key → first index where we saw it

  for (let i = 0; i < rawResults.length; i += 1) {
    const entry = rawResults[i];
    const label = `results[${i}]`;

    // ── (a) stage validity ───────────────────────────────────────────────
    if (typeof entry.stage !== 'string' || !VALID_STAGES_SET.has(entry.stage)) {
      throw new Error(
        `${label}: invalid stage "${String(entry.stage)}". Must be one of: ${[...VALID_STAGES].join(', ')}.`,
      );
    }
    const stage = entry.stage as Stage;

    // ── (b) team string presence ─────────────────────────────────────────
    if (typeof entry.home !== 'string' || entry.home.length === 0) {
      throw new Error(`${label}: "home" must be a non-empty string (got ${describe(entry.home)}).`);
    }
    if (typeof entry.away !== 'string' || entry.away.length === 0) {
      throw new Error(`${label}: "away" must be a non-empty string (got ${describe(entry.away)}).`);
    }
    const rawHome = entry.home;
    const rawAway = entry.away;

    // ── (b cont.) resolve to canonical names ────────────────────────────
    const homeNation = tryResolve(rawHome, label, 'home');
    const awayNation = tryResolve(rawAway, label, 'away');
    const homeCanonical = homeNation.displayName;
    const awayCanonical = awayNation.displayName;

    // The team must be one of the 48 in the current tournament roster,
    // not merely a known nation. Catches e.g. "Italy" or "Russia" — both
    // resolve to canonical nations but are not in groups.json.
    if (!allRosterTeams.has(homeCanonical)) {
      throw new Error(
        `${label}: "home" team "${rawHome}" (canonical "${homeCanonical}") is not in this tournament's groups.json roster.`,
      );
    }
    if (!allRosterTeams.has(awayCanonical)) {
      throw new Error(
        `${label}: "away" team "${rawAway}" (canonical "${awayCanonical}") is not in this tournament's groups.json roster.`,
      );
    }

    // ── (c) home != away ─────────────────────────────────────────────────
    if (homeCanonical === awayCanonical) {
      throw new Error(
        `${label}: home and away resolve to the same team "${homeCanonical}". A team cannot play itself.`,
      );
    }

    // ── (d) goals are non-negative integers ──────────────────────────────
    if (!Number.isInteger(entry.homeGoals) || (entry.homeGoals as number) < 0) {
      throw new Error(
        `${label}: "homeGoals" must be a non-negative integer (got ${describe(entry.homeGoals)}).`,
      );
    }
    if (!Number.isInteger(entry.awayGoals) || (entry.awayGoals as number) < 0) {
      throw new Error(
        `${label}: "awayGoals" must be a non-negative integer (got ${describe(entry.awayGoals)}).`,
      );
    }
    const homeGoals = entry.homeGoals as number;
    const awayGoals = entry.awayGoals as number;

    // ── (e) group-stage orientation ──────────────────────────────────────
    if (stage === 'group') {
      const homeGroup = groupOfTeam.get(homeCanonical);
      const awayGroup = groupOfTeam.get(awayCanonical);
      if (homeGroup !== awayGroup) {
        throw new Error(
          `${label}: group-stage pair ${homeCanonical} (Group ${homeGroup}) vs ` +
            `${awayCanonical} (Group ${awayGroup}) — teams are in different groups.`,
        );
      }
      const schedule = groupSchedules.get(homeGroup!)!;
      let exactMatch = false;
      let reverseMatch = false;
      for (const fix of schedule) {
        if (fix.home === homeCanonical && fix.away === awayCanonical) {
          exactMatch = true;
          break;
        }
        if (fix.home === awayCanonical && fix.away === homeCanonical) {
          reverseMatch = true;
        }
      }
      if (!exactMatch) {
        if (reverseMatch) {
          throw new Error(
            `${label}: schedule lists ${awayCanonical} vs ${homeCanonical} in Group ${homeGroup}, ` +
              `but you wrote ${homeCanonical} vs ${awayCanonical}. ` +
              `Swap the home/away order to match the schedule.`,
          );
        }
        throw new Error(
          `${label}: the pair ${homeCanonical} vs ${awayCanonical} does not appear in any group's ` +
            `round-robin schedule. Check the team names against data/tournament/groups.json.`,
        );
      }
    }

    // ── (f) knockout draws are not allowed ───────────────────────────────
    if (KNOCKOUT_STAGES.has(stage) && homeGoals === awayGoals) {
      throw new Error(
        `${label}: knockout-stage result ${homeCanonical} ${homeGoals}-${awayGoals} ${awayCanonical} ` +
          `is a draw. Knockouts must be decisive; encode an ET/penalties outcome as the effective ` +
          `decisive scoreline (e.g. 1-0).`,
      );
    }

    // ── (g) duplicate (stage, home, away) ────────────────────────────────
    const key = `${stage}|${homeCanonical}|${awayCanonical}`;
    const prevIdx = seen.get(key);
    if (prevIdx != null) {
      throw new Error(
        `${label}: duplicate of results[${prevIdx}] — same stage (${stage}) and same matchup ` +
          `(${homeCanonical} vs ${awayCanonical}). Remove one of the two entries.`,
      );
    }
    seen.set(key, i);
  }
}

function tryResolve(rawName: string, label: string, side: 'home' | 'away') {
  try {
    return resolveNation(rawName);
  } catch {
    throw new Error(
      `${label}: "${side}" team "${rawName}" did not resolve to a known national team. ` +
        `Use the canonical name from data/tournament/groups.json ` +
        `(e.g. "United States" not "USA"; "Czechia" not "Czech Republic"; ` +
        `"Korea Republic" not "South Korea").`,
    );
  }
}

function describe(v: unknown): string {
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number') return String(v);
  return JSON.stringify(v);
}
