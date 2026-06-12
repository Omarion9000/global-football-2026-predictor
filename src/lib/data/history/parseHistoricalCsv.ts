// =============================================================================
// parseHistoricalCsv.ts (pure)
// =============================================================================
// Phase 8A — parses one football-data.co.uk season CSV (E0 Premier League)
// into a normalized `HistoricalMatch[]`. No I/O, no side effects. The caller
// is responsible for reading the CSV and providing the `season` label.
//
// Column contract (observed and pinned on 2026-06-11 across the 2015-16 to
// 2024-25 E0 archive):
//   Date       — DD/MM/YYYY (some older seasons use DD/MM/YY)
//   HomeTeam   — short club name, trimmed
//   AwayTeam   — short club name, trimmed
//   FTHG       — full-time home goals (integer)
//   FTAG       — full-time away goals (integer)
//   B365H/D/A  — Bet365 1X2 decimal odds (preferred)
//   PSH/D/A    — Pinnacle decimal odds (fallback when B365 absent / unparseable)
//
// Rejection rules — a row is counted as `rejected` (not raised) when:
//   * any required column is missing or empty
//   * the date is unparseable
//   * goals are unparseable / non-integer
//   * the header row is missing a required column entirely (handled at the
//     header-resolution stage by skipping the whole file's body — caller is
//     expected to log that case)
//
// No new dependencies — these CSVs do not quote fields, so a comma-split is
// sufficient. If a future season ever adds quoted commas, that becomes a
// `rejected` row rather than a crash.
// =============================================================================

export type HistoricalOdds = {
  home: number;
  draw: number;
  away: number;
};

export type HistoricalMatch = {
  /** Season label provided by the caller, e.g. "2024-25". */
  season: string;
  /** ISO date, YYYY-MM-DD. */
  dateIso: string;
  homeTeam: string;
  awayTeam: string;
  homeGoals: number;
  awayGoals: number;
  odds?: HistoricalOdds;
};

export type ParseResult = {
  matches: HistoricalMatch[];
  rejected: number;
};

const REQUIRED_COLUMNS = ['Date', 'HomeTeam', 'AwayTeam', 'FTHG', 'FTAG'] as const;

/** Strip a UTF-8 BOM from the start of a string if present. */
function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/** Split a CSV row by comma. football-data.co.uk does not quote fields. */
function splitRow(row: string): string[] {
  return row.split(',').map((c) => c.trim());
}

/**
 * Parse DD/MM/YY or DD/MM/YYYY into a YYYY-MM-DD ISO string. Returns null on
 * any parse failure so the caller can count it as a rejected row rather than
 * raising.
 *
 * 2-digit year expansion: < 70 → 2000+YY, >= 70 → 1900+YY. This covers every
 * date in the football-data.co.uk archive (the oldest CSVs go back to 1993).
 */
export function parseDate(raw: string): string | null {
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year: number;
  if (m[3].length === 4) {
    year = Number(m[3]);
  } else {
    const yy = Number(m[3]);
    year = yy < 70 ? 2000 + yy : 1900 + yy;
  }
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) {
    return null;
  }
  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 1900) return null;
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day
    .toString()
    .padStart(2, '0')}`;
}

/** Parse a positive-or-zero integer; return null on failure or non-integer. */
function parseInt0(raw: string | undefined): number | null {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return null;
  return n;
}

/** Parse a positive decimal odds value; return null on failure. */
function parseOdd(raw: string | undefined): number | null {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 1) return null;
  return n;
}

/** Try B365 columns first; if any is unparseable, try PS columns. */
function pickOdds(cell: (name: string) => string | undefined): HistoricalOdds | undefined {
  for (const prefix of ['B365', 'PS'] as const) {
    const h = parseOdd(cell(`${prefix}H`));
    const d = parseOdd(cell(`${prefix}D`));
    const a = parseOdd(cell(`${prefix}A`));
    if (h != null && d != null && a != null) {
      return { home: h, draw: d, away: a };
    }
  }
  return undefined;
}

/**
 * Parse one football-data.co.uk season CSV into `HistoricalMatch[]` plus a
 * rejected-row count. `season` is provided by the caller (e.g. "2024-25").
 *
 * Pure: takes the raw CSV body as input; no file or network access.
 */
export function parseHistoricalCsv(csv: string, season: string): ParseResult {
  const body = stripBom(csv).replace(/\r\n?/g, '\n');
  const lines = body.split('\n').filter((l) => l.length > 0);
  if (lines.length === 0) return { matches: [], rejected: 0 };

  const headers = splitRow(lines[0]);
  const idx: Record<string, number> = {};
  headers.forEach((h, i) => {
    idx[h] = i;
  });

  for (const required of REQUIRED_COLUMNS) {
    if (idx[required] == null) {
      // Header is fundamentally broken — every row counts as rejected.
      return { matches: [], rejected: lines.length - 1 };
    }
  }

  const cellFor = (cells: string[]) => (name: string) => {
    const at = idx[name];
    return at == null ? undefined : cells[at];
  };

  const matches: HistoricalMatch[] = [];
  let rejected = 0;

  for (let i = 1; i < lines.length; i += 1) {
    const cells = splitRow(lines[i]);
    // Skip rows shorter than required columns — these are usually blank or
    // a stray trailing line.
    if (cells.length < headers.length / 2) {
      rejected += 1;
      continue;
    }
    const cell = cellFor(cells);

    const dateIso = parseDate(cell('Date') ?? '');
    const homeTeam = (cell('HomeTeam') ?? '').trim();
    const awayTeam = (cell('AwayTeam') ?? '').trim();
    const homeGoals = parseInt0(cell('FTHG'));
    const awayGoals = parseInt0(cell('FTAG'));

    if (
      dateIso == null ||
      homeTeam === '' ||
      awayTeam === '' ||
      homeGoals == null ||
      awayGoals == null
    ) {
      rejected += 1;
      continue;
    }

    const match: HistoricalMatch = {
      season,
      dateIso,
      homeTeam,
      awayTeam,
      homeGoals,
      awayGoals,
    };
    const odds = pickOdds(cell);
    if (odds) match.odds = odds;

    matches.push(match);
  }

  return { matches, rejected };
}
