import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  validateResults,
  VALID_STAGES,
  type GroupRosterCanonical,
  type RawResult,
} from '../validateResults';

// Phase 9F.1 — validator catches every bad-input case it was built for, and
// the real, on-disk results.json passes cleanly. Pure tests; no engine, no
// model state.

const REAL_GROUPS_PATH = resolve(__dirname, '..', '..', '..', '..', 'data', 'tournament', 'groups.json');
const REAL_RESULTS_PATH = resolve(__dirname, '..', '..', '..', '..', 'data', 'tournament', 'results.json');

function liveGroups(): GroupRosterCanonical[] {
  const raw = JSON.parse(readFileSync(REAL_GROUPS_PATH, 'utf-8')) as {
    groups: Array<{ group: string; teams: string[] }>;
  };
  // The runner remaps user-facing names to canonical via resolveNation; the
  // tournament's current groups.json uses the FIFA-style aliases (Korea
  // Republic, Czechia, Cote d'Ivoire, Curacao) that resolve to the corpus
  // canonical names. The validator expects the canonical form.
  const aliasMap: Record<string, string> = {
    'Korea Republic': 'South Korea',
    Czechia: 'Czech Republic',
    Curacao: 'Curaçao',
    "Cote d'Ivoire": 'Ivory Coast',
  };
  return raw.groups.map((g) => ({
    group: g.group,
    teams: g.teams.map((t) => aliasMap[t] ?? t),
  }));
}

function liveResults(): RawResult[] {
  return (
    JSON.parse(readFileSync(REAL_RESULTS_PATH, 'utf-8')) as { results: RawResult[] }
  ).results;
}

// =============================================================================
// The real, on-disk results.json must pass.
// =============================================================================

describe('validateResults — live data/tournament/results.json', () => {
  it('accepts the current pinned results without throwing', () => {
    expect(() => validateResults(liveResults(), liveGroups())).not.toThrow();
  });
});

// =============================================================================
// Each bad-input case throws a clear, actionable Error.
// =============================================================================

describe('validateResults — bad-stage', () => {
  it('rejects unknown stage with the list of valid stages', () => {
    const bad: RawResult[] = [
      { stage: 'groups', home: 'Mexico', away: 'South Africa', homeGoals: 2, awayGoals: 0 },
    ];
    expect(() => validateResults(bad, liveGroups())).toThrow(/invalid stage "groups"/);
    expect(() => validateResults(bad, liveGroups())).toThrow(/Must be one of/);
    for (const s of VALID_STAGES) {
      expect(() => validateResults(bad, liveGroups())).toThrow(new RegExp(`\\b${s}\\b`));
    }
  });

  it('rejects non-string stage', () => {
    const bad: RawResult[] = [
      { stage: 42, home: 'Mexico', away: 'South Africa', homeGoals: 2, awayGoals: 0 },
    ];
    expect(() => validateResults(bad, liveGroups())).toThrow(/invalid stage/);
  });
});

describe('validateResults — bad team names', () => {
  it('rejects an unknown team and points the user to the canonical name', () => {
    const bad: RawResult[] = [
      { stage: 'group', home: 'USA', away: 'Paraguay', homeGoals: 4, awayGoals: 1 },
    ];
    expect(() => validateResults(bad, liveGroups())).toThrow(/"USA"/);
    expect(() => validateResults(bad, liveGroups())).toThrow(/canonical name/i);
  });

  it('rejects a team that resolves to a real nation but is not in this tournament roster', () => {
    // Italy is a known nation in teamMap.ts but not in this 2026 roster.
    const bad: RawResult[] = [
      { stage: 'group', home: 'Italy', away: 'Paraguay', homeGoals: 1, awayGoals: 0 },
    ];
    expect(() => validateResults(bad, liveGroups())).toThrow(/not in this tournament's groups.json roster/);
  });

  it('rejects a missing or empty team field', () => {
    expect(() =>
      validateResults(
        [{ stage: 'group', home: '', away: 'Paraguay', homeGoals: 0, awayGoals: 0 }],
        liveGroups(),
      ),
    ).toThrow(/"home" must be a non-empty string/);
    expect(() =>
      validateResults(
        [{ stage: 'group', home: 'United States', awayGoals: 0 } as unknown as RawResult],
        liveGroups(),
      ),
    ).toThrow(/"away" must be a non-empty string/);
  });
});

describe('validateResults — home === away', () => {
  it('rejects a team playing itself', () => {
    const bad: RawResult[] = [
      { stage: 'group', home: 'Mexico', away: 'Mexico', homeGoals: 1, awayGoals: 1 },
    ];
    expect(() => validateResults(bad, liveGroups())).toThrow(/cannot play itself/);
  });

  it('catches the alias case — same team via different names', () => {
    const bad: RawResult[] = [
      // "South Korea" and "Korea Republic" both resolve to the canonical
      // "South Korea" — a team cannot play itself.
      { stage: 'group', home: 'South Korea', away: 'Korea Republic', homeGoals: 1, awayGoals: 0 },
    ];
    expect(() => validateResults(bad, liveGroups())).toThrow(/cannot play itself/);
  });
});

describe('validateResults — bad goal counts', () => {
  const cases: Array<[label: string, goals: { h: unknown; a: unknown }]> = [
    ['negative homeGoals', { h: -1, a: 0 }],
    ['negative awayGoals', { h: 0, a: -2 }],
    ['fractional homeGoals', { h: 1.5, a: 0 }],
    ['string homeGoals', { h: '2', a: 0 }],
    ['undefined awayGoals', { h: 1, a: undefined }],
  ];
  it.each(cases)('rejects %s', (_label, goals) => {
    const bad: RawResult[] = [
      { stage: 'group', home: 'Mexico', away: 'South Africa', homeGoals: goals.h, awayGoals: goals.a },
    ];
    expect(() => validateResults(bad, liveGroups())).toThrow(/must be a non-negative integer/);
  });
});

describe('validateResults — group orientation', () => {
  it('rejects inverted home/away with an explicit swap hint', () => {
    // Group B schedule: Bosnia vs Canada (M5 in the round-robin).
    const bad: RawResult[] = [
      { stage: 'group', home: 'Canada', away: 'Bosnia and Herzegovina', homeGoals: 1, awayGoals: 1 },
    ];
    expect(() => validateResults(bad, liveGroups())).toThrow(
      /schedule lists Bosnia and Herzegovina vs Canada in Group B.*Swap the home\/away order/s,
    );
  });

  it('rejects a pair that is not in any group schedule', () => {
    const bad: RawResult[] = [
      // Mexico (Group A) vs Spain (Group H) — a real pair but not in any group.
      { stage: 'group', home: 'Mexico', away: 'Spain', homeGoals: 1, awayGoals: 1 },
    ];
    expect(() => validateResults(bad, liveGroups())).toThrow(
      /teams are in different groups/,
    );
  });
});

describe('validateResults — knockout draws', () => {
  it('rejects a draw in a knockout stage with shootout-encoding hint', () => {
    const bad: RawResult[] = [
      { stage: 'r16', home: 'Mexico', away: 'Brazil', homeGoals: 1, awayGoals: 1 },
    ];
    expect(() => validateResults(bad, liveGroups())).toThrow(/knockout-stage result.*is a draw/);
    expect(() => validateResults(bad, liveGroups())).toThrow(/encode an ET\/penalties outcome/);
  });

  it('accepts a draw in a group-stage match (group draws are legal)', () => {
    const okGroupDraw: RawResult[] = [
      { stage: 'group', home: 'Mexico', away: 'South Africa', homeGoals: 0, awayGoals: 0 },
    ];
    expect(() => validateResults(okGroupDraw, liveGroups())).not.toThrow();
  });
});

describe('validateResults — duplicates', () => {
  it('rejects a duplicate (stage, home, away) entry pointing at the prior index', () => {
    const bad: RawResult[] = [
      { stage: 'group', home: 'Mexico', away: 'South Africa', homeGoals: 2, awayGoals: 0 },
      { stage: 'group', home: 'Mexico', away: 'South Africa', homeGoals: 1, awayGoals: 1 },
    ];
    expect(() => validateResults(bad, liveGroups())).toThrow(/duplicate of results\[0\]/);
  });
});

describe('validateResults — error message hygiene', () => {
  it('every error names the offending entry by 1-based-friendly index "results[N]"', () => {
    const cases: RawResult[][] = [
      [{ stage: 'invalid', home: 'X', away: 'Y', homeGoals: 0, awayGoals: 0 }],
      [{ stage: 'group', home: 'USA', away: 'Paraguay', homeGoals: 0, awayGoals: 0 }],
      [{ stage: 'group', home: 'Mexico', away: 'Mexico', homeGoals: 0, awayGoals: 0 }],
      [{ stage: 'group', home: 'Mexico', away: 'South Africa', homeGoals: -1, awayGoals: 0 }],
    ];
    for (const c of cases) {
      try {
        validateResults(c, liveGroups());
        expect.unreachable();
      } catch (e) {
        expect((e as Error).message).toMatch(/^results\[\d+\]:/);
      }
    }
  });
});
