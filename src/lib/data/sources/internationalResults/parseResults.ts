// =============================================================================
// parseResults.ts (pure)
// =============================================================================
// Phase 9A — parses the martj42/international_results corpus (results.csv,
// CC0-1.0) into a normalized InternationalMatch[]. No I/O, no side effects.
//
// Column contract (verified 2026-06-13 against the upstream repo):
//   date         — YYYY-MM-DD
//   home_team    — short English name (e.g. "Korea Republic", "Ivory Coast")
//   away_team    — same
//   home_score   — non-negative integer
//   away_score   — non-negative integer
//   tournament   — free text (e.g. "FIFA World Cup", "UEFA Euro qualification")
//   city         — host city; sometimes empty
//   country      — host country English name (e.g. "Brazil"); rarely empty
//   neutral      — "TRUE" or "FALSE"
//
// Top-tier filter (Phase 9A scope): keep only rows whose `tournament` is in
// TOP_TIER_TOURNAMENTS (exact-string match, accent-preserving on Copa América,
// and using the corpus's actual "Oceania Nations Cup" / "Oceania Nations Cup
// qualification" labels rather than the OFC abbreviation).
//
// Rejection rules — a row is counted as `rejected` (not raised) when:
//   * any required column is missing or empty
//   * the date is malformed
//   * goals are non-integer or negative
//   * neutral is neither TRUE nor FALSE
//   * the header row is missing a required column (handled at header
//     resolution by returning a fully rejected body)
//
// The corpus quotes fields that contain commas (e.g. `"Washington, D.C."`
// across 18 of the 1994 World Cup rows). We do the minimal RFC-4180-lite
// split — comma-as-separator outside quotes, doubled `""` as a literal quote
// inside. No other quoted-field semantics are exercised by this corpus.
// =============================================================================

export type InternationalMatch = {
  dateIso: string;       // YYYY-MM-DD
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  tournament: string;
  city: string;          // empty string when source carries no value
  country: string;       // empty string when source carries no value
  neutral: boolean;
};

export type ParseResult = {
  matches: InternationalMatch[];
  rejected: number;
};

/** Top-tier include-list (exact strings; corpus labels — see W0 report). */
export const TOP_TIER_TOURNAMENTS: ReadonlyArray<string> = [
  'FIFA World Cup',
  'FIFA World Cup qualification',
  'UEFA Euro',
  'UEFA Euro qualification',
  'Copa América',
  'African Cup of Nations',
  'African Cup of Nations qualification',
  'AFC Asian Cup',
  'AFC Asian Cup qualification',
  'Gold Cup',
  'CONCACAF Nations League',
  'UEFA Nations League',
  'Confederations Cup',
  'Oceania Nations Cup',
  'Oceania Nations Cup qualification',
] as const;

const TOP_TIER_SET = new Set<string>(TOP_TIER_TOURNAMENTS);

const REQUIRED_COLUMNS = [
  'date',
  'home_team',
  'away_team',
  'home_score',
  'away_score',
  'tournament',
  'city',
  'country',
  'neutral',
] as const;

/** Strip a UTF-8 BOM from the start of a string if present. */
function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/**
 * RFC-4180-lite row splitter.
 *
 *   - Fields separated by `,`.
 *   - A field may be wrapped in `"..."`. Inside such a quoted field commas are
 *     literal characters and a `""` pair is an escaped quote.
 *   - Quote stripping only happens for the wrapping pair; quotes inside
 *     unquoted fields are kept verbatim (the corpus never does this, but the
 *     contract is the safer one).
 */
function splitRow(row: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < row.length; i += 1) {
    const c = row[i];
    if (inQuotes) {
      if (c === '"') {
        if (row[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += c;
      }
    } else if (c === '"' && current.length === 0) {
      inQuotes = true;
    } else if (c === ',') {
      fields.push(current);
      current = '';
    } else {
      current += c;
    }
  }
  fields.push(current);
  return fields;
}

function parseDate(raw: string): string | null {
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1800 || y > 2200) return null;
  return raw;
}

function parseInt0(raw: string | undefined): number | null {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return null;
  return n;
}

function parseNeutral(raw: string | undefined): boolean | null {
  if (raw == null) return null;
  const t = raw.trim().toUpperCase();
  if (t === 'TRUE') return true;
  if (t === 'FALSE') return false;
  return null;
}

/**
 * Parse the corpus into matches restricted to TOP_TIER_TOURNAMENTS plus a
 * rejected-row count. Pure: takes the raw CSV body as input. The filter is
 * applied BEFORE the row is counted as "matches"; rows that simply belong to
 * a non-top-tier tournament are NOT counted as rejected — they are silently
 * excluded.
 */
export function parseResults(csv: string): ParseResult {
  const body = stripBom(csv).replace(/\r\n?/g, '\n');
  const lines = body.split('\n').filter((l) => l.length > 0);
  if (lines.length === 0) return { matches: [], rejected: 0 };

  const headers = splitRow(lines[0]).map((h) => h.trim());
  const idx: Record<string, number> = {};
  headers.forEach((h, i) => {
    idx[h] = i;
  });

  for (const required of REQUIRED_COLUMNS) {
    if (idx[required] == null) {
      return { matches: [], rejected: lines.length - 1 };
    }
  }

  const matches: InternationalMatch[] = [];
  let rejected = 0;

  for (let i = 1; i < lines.length; i += 1) {
    const cells = splitRow(lines[i]);
    if (cells.length < headers.length) {
      rejected += 1;
      continue;
    }

    const tournament = cells[idx.tournament];
    if (!TOP_TIER_SET.has(tournament)) continue; // silently excluded by filter

    const dateIso = parseDate(cells[idx.date]);
    const homeTeam = cells[idx.home_team].trim();
    const awayTeam = cells[idx.away_team].trim();
    const homeScore = parseInt0(cells[idx.home_score]);
    const awayScore = parseInt0(cells[idx.away_score]);
    const city = (cells[idx.city] ?? '').trim();
    const country = (cells[idx.country] ?? '').trim();
    const neutral = parseNeutral(cells[idx.neutral]);

    if (
      dateIso == null ||
      homeTeam === '' ||
      awayTeam === '' ||
      homeScore == null ||
      awayScore == null ||
      neutral == null
    ) {
      rejected += 1;
      continue;
    }

    matches.push({
      dateIso,
      homeTeam,
      awayTeam,
      homeScore,
      awayScore,
      tournament,
      city,
      country,
      neutral,
    });
  }

  return { matches, rejected };
}
