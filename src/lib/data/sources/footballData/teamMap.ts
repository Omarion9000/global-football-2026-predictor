import 'server-only';

// =============================================================================
// teamMap.ts (canonical Premier League team registry)
// =============================================================================
// Phase 8D — single source of truth for the three-way name lookup used by
// the football-data.org adapter and the historical backfill:
//
//   canonical slug ── DB key (e.g. "man-united", stored in teams.id)
//        │
//        ├── corpus name(s)    (football-data.co.uk: "Man United")
//        ├── API name(s)       (football-data.org: "Manchester United FC")
//        └── tla               (3-letter code, stored in teams.code)
//
// Coverage requirement
//   Every distinct team name in `data/processed/matches.json` (built by
//   Phase 8A) must resolve through this map, and every team in the current
//   Premier League season's football-data.org listing must resolve. Tests
//   enforce both directions. An unmapped name is a HARD error — we never
//   guess.
//
// The slugs are deliberately stable across renames; if Brighton are
// rebranded tomorrow we update `apiNames` / `corpusNames` without touching
// the slug, the DB `code`, or any downstream join.
// =============================================================================

export type CanonicalTeam = {
  /** Stored in teams.id and used as the canonical foreign key everywhere. */
  slug: string;
  /** Display name (UI-friendly form; not the official trademark). */
  displayName: string;
  /** Stored in teams.code (UNIQUE). 3 letters, A-Z. */
  tla: string;
  /** Names produced by football-data.org (current + recent historical). */
  apiNames: ReadonlyArray<string>;
  /** Names produced by football-data.co.uk in the 10-season corpus. */
  corpusNames: ReadonlyArray<string>;
};

export const CANONICAL_TEAMS: ReadonlyArray<CanonicalTeam> = [
  { slug: 'arsenal',           displayName: 'Arsenal',           tla: 'ARS',
    apiNames: ['Arsenal FC'],
    corpusNames: ['Arsenal'] },
  { slug: 'aston-villa',       displayName: 'Aston Villa',       tla: 'AVL',
    apiNames: ['Aston Villa FC'],
    corpusNames: ['Aston Villa'] },
  { slug: 'bournemouth',       displayName: 'Bournemouth',       tla: 'BOU',
    apiNames: ['AFC Bournemouth'],
    corpusNames: ['Bournemouth'] },
  { slug: 'brentford',         displayName: 'Brentford',         tla: 'BRE',
    apiNames: ['Brentford FC'],
    corpusNames: ['Brentford'] },
  { slug: 'brighton',          displayName: 'Brighton',          tla: 'BHA',
    apiNames: ['Brighton & Hove Albion FC', 'Brighton Hove FC'],
    corpusNames: ['Brighton'] },
  { slug: 'burnley',           displayName: 'Burnley',           tla: 'BUR',
    apiNames: ['Burnley FC'],
    corpusNames: ['Burnley'] },
  { slug: 'cardiff',           displayName: 'Cardiff',           tla: 'CAR',
    apiNames: ['Cardiff City FC'],
    corpusNames: ['Cardiff'] },
  { slug: 'chelsea',           displayName: 'Chelsea',           tla: 'CHE',
    apiNames: ['Chelsea FC'],
    corpusNames: ['Chelsea'] },
  { slug: 'crystal-palace',    displayName: 'Crystal Palace',    tla: 'CRY',
    apiNames: ['Crystal Palace FC'],
    corpusNames: ['Crystal Palace'] },
  { slug: 'everton',           displayName: 'Everton',           tla: 'EVE',
    apiNames: ['Everton FC'],
    corpusNames: ['Everton'] },
  { slug: 'fulham',            displayName: 'Fulham',            tla: 'FUL',
    apiNames: ['Fulham FC'],
    corpusNames: ['Fulham'] },
  { slug: 'huddersfield',      displayName: 'Huddersfield Town', tla: 'HUD',
    apiNames: ['Huddersfield Town AFC'],
    corpusNames: ['Huddersfield'] },
  { slug: 'hull',              displayName: 'Hull City',         tla: 'HUL',
    apiNames: ['Hull City AFC'],
    corpusNames: ['Hull'] },
  { slug: 'ipswich',           displayName: 'Ipswich Town',      tla: 'IPS',
    apiNames: ['Ipswich Town FC'],
    corpusNames: ['Ipswich'] },
  { slug: 'leeds',             displayName: 'Leeds United',      tla: 'LEE',
    apiNames: ['Leeds United FC'],
    corpusNames: ['Leeds'] },
  { slug: 'leicester',         displayName: 'Leicester City',    tla: 'LEI',
    apiNames: ['Leicester City FC'],
    corpusNames: ['Leicester'] },
  { slug: 'liverpool',         displayName: 'Liverpool',         tla: 'LIV',
    apiNames: ['Liverpool FC'],
    corpusNames: ['Liverpool'] },
  { slug: 'luton',             displayName: 'Luton Town',        tla: 'LUT',
    apiNames: ['Luton Town FC'],
    corpusNames: ['Luton'] },
  { slug: 'man-city',          displayName: 'Manchester City',   tla: 'MCI',
    apiNames: ['Manchester City FC'],
    corpusNames: ['Man City'] },
  { slug: 'man-united',        displayName: 'Manchester United', tla: 'MUN',
    apiNames: ['Manchester United FC'],
    corpusNames: ['Man United'] },
  { slug: 'middlesbrough',     displayName: 'Middlesbrough',     tla: 'MID',
    apiNames: ['Middlesbrough FC'],
    corpusNames: ['Middlesbrough'] },
  { slug: 'newcastle',         displayName: 'Newcastle United',  tla: 'NEW',
    apiNames: ['Newcastle United FC'],
    corpusNames: ['Newcastle'] },
  { slug: 'norwich',           displayName: 'Norwich City',      tla: 'NOR',
    apiNames: ['Norwich City FC'],
    corpusNames: ['Norwich'] },
  { slug: 'nottm-forest',      displayName: 'Nottingham Forest', tla: 'NFO',
    apiNames: ['Nottingham Forest FC'],
    corpusNames: ["Nott'm Forest"] },
  { slug: 'sheffield-united',  displayName: 'Sheffield United',  tla: 'SHU',
    apiNames: ['Sheffield United FC'],
    corpusNames: ['Sheffield United'] },
  { slug: 'southampton',       displayName: 'Southampton',       tla: 'SOU',
    apiNames: ['Southampton FC'],
    corpusNames: ['Southampton'] },
  { slug: 'stoke',             displayName: 'Stoke City',        tla: 'STK',
    apiNames: ['Stoke City FC'],
    corpusNames: ['Stoke'] },
  { slug: 'sunderland',        displayName: 'Sunderland',        tla: 'SUN',
    apiNames: ['Sunderland AFC'],
    corpusNames: ['Sunderland'] },
  { slug: 'swansea',           displayName: 'Swansea City',      tla: 'SWA',
    apiNames: ['Swansea City AFC'],
    corpusNames: ['Swansea'] },
  { slug: 'tottenham',         displayName: 'Tottenham Hotspur', tla: 'TOT',
    apiNames: ['Tottenham Hotspur FC'],
    corpusNames: ['Tottenham'] },
  { slug: 'watford',           displayName: 'Watford',           tla: 'WAT',
    apiNames: ['Watford FC'],
    corpusNames: ['Watford'] },
  { slug: 'west-brom',         displayName: 'West Bromwich Albion', tla: 'WBA',
    apiNames: ['West Bromwich Albion FC'],
    corpusNames: ['West Brom'] },
  { slug: 'west-ham',          displayName: 'West Ham United',   tla: 'WHU',
    apiNames: ['West Ham United FC'],
    corpusNames: ['West Ham'] },
  { slug: 'wolves',            displayName: 'Wolverhampton Wanderers', tla: 'WOL',
    apiNames: ['Wolverhampton Wanderers FC'],
    corpusNames: ['Wolves'] },
] as const;

// Pre-computed lookup indices. Built once at module load.
const BY_CORPUS_NAME = new Map<string, CanonicalTeam>();
const BY_API_NAME = new Map<string, CanonicalTeam>();
const BY_SLUG = new Map<string, CanonicalTeam>();
const BY_TLA = new Map<string, CanonicalTeam>();

for (const team of CANONICAL_TEAMS) {
  if (BY_SLUG.has(team.slug)) {
    throw new Error(`teamMap: duplicate slug "${team.slug}"`);
  }
  if (BY_TLA.has(team.tla)) {
    throw new Error(`teamMap: duplicate TLA "${team.tla}"`);
  }
  BY_SLUG.set(team.slug, team);
  BY_TLA.set(team.tla, team);
  for (const name of team.corpusNames) {
    if (BY_CORPUS_NAME.has(name)) {
      throw new Error(`teamMap: corpus name "${name}" already mapped`);
    }
    BY_CORPUS_NAME.set(name, team);
  }
  for (const name of team.apiNames) {
    if (BY_API_NAME.has(name)) {
      throw new Error(`teamMap: API name "${name}" already mapped`);
    }
    BY_API_NAME.set(name, team);
  }
}

/** Resolve a football-data.co.uk corpus team name. Hard-error on miss. */
export function resolveCorpusName(name: string): CanonicalTeam {
  const t = BY_CORPUS_NAME.get(name);
  if (!t) {
    throw new Error(
      `teamMap: unmapped corpus team name "${name}". Add it to CANONICAL_TEAMS.corpusNames or fix the corpus.`,
    );
  }
  return t;
}

/** Resolve a football-data.org API team name. Hard-error on miss. */
export function resolveApiName(name: string): CanonicalTeam {
  const t = BY_API_NAME.get(name);
  if (!t) {
    throw new Error(
      `teamMap: unmapped football-data.org team name "${name}". Add it to CANONICAL_TEAMS.apiNames.`,
    );
  }
  return t;
}

export function findBySlug(slug: string): CanonicalTeam | null {
  return BY_SLUG.get(slug) ?? null;
}

export function listCanonicalSlugs(): ReadonlyArray<string> {
  return CANONICAL_TEAMS.map((t) => t.slug);
}

/** DB id (`teams.id`) for a canonical team. Stable across renames. */
export function dbIdFor(team: CanonicalTeam): string {
  return `epl-${team.slug}`;
}
