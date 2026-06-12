#!/usr/bin/env tsx
// =============================================================================
// scripts/build-history.ts
// =============================================================================
// Phase 8A — read every CSV under data/raw/, parse it with the pure
// `parseHistoricalCsv`, sort by date, and write a single aggregated
// `data/processed/matches.json`. Prints a summary line at the end.
//
// Usage:
//   pnpm history:build
//
// Properties:
//   - Pure aggregator: re-runnable, deterministic.
//   - Sort: ascending by `dateIso`. Stable tie-breaker on (season, homeTeam,
//     awayTeam) so identical inputs always produce identical output.
//   - Counts rejected rows across every input file.
//   - Non-zero exit if no input files are found.
// =============================================================================

import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  parseHistoricalCsv,
  type HistoricalMatch,
} from '@/lib/data/history/parseHistoricalCsv';

const RAW_DIR = resolve(process.cwd(), 'data', 'raw');
const OUT_DIR = resolve(process.cwd(), 'data', 'processed');
const OUT_FILE = resolve(OUT_DIR, 'matches.json');

/** Extract the season label from filenames like `E0-2024-25.csv`. */
function seasonFromFilename(name: string): string | null {
  const m = name.match(/^E0-(\d{4}-\d{2})\.csv$/);
  return m ? m[1] : null;
}

function sortMatches(matches: HistoricalMatch[]): HistoricalMatch[] {
  return matches.slice().sort((a, b) => {
    if (a.dateIso !== b.dateIso) return a.dateIso.localeCompare(b.dateIso);
    if (a.season !== b.season) return a.season.localeCompare(b.season);
    if (a.homeTeam !== b.homeTeam) return a.homeTeam.localeCompare(b.homeTeam);
    return a.awayTeam.localeCompare(b.awayTeam);
  });
}

function main(): void {
  let files: string[];
  try {
    files = readdirSync(RAW_DIR)
      .filter((f) => f.startsWith('E0-') && f.endsWith('.csv'))
      .sort();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      `build-history: cannot read ${RAW_DIR} — ${msg}. Run \`pnpm history:fetch\` first.\n`,
    );
    process.exit(1);
  }
  if (files.length === 0) {
    process.stderr.write(
      `build-history: no E0-*.csv files in ${RAW_DIR}. Run \`pnpm history:fetch\` first.\n`,
    );
    process.exit(1);
  }

  const allMatches: HistoricalMatch[] = [];
  let rejectedTotal = 0;

  for (const file of files) {
    const season = seasonFromFilename(file);
    if (!season) {
      process.stderr.write(
        `build-history: skipping ${file} (filename does not match E0-YYYY-YY.csv)\n`,
      );
      continue;
    }
    const csv = readFileSync(resolve(RAW_DIR, file), 'utf-8');
    const { matches, rejected } = parseHistoricalCsv(csv, season);
    allMatches.push(...matches);
    rejectedTotal += rejected;
  }

  const sorted = sortMatches(allMatches);
  const withOdds = sorted.filter((m) => m.odds != null).length;

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, JSON.stringify(sorted, null, 2) + '\n');

  const summary = {
    files: files.length,
    matches: sorted.length,
    withOdds,
    rejected: rejectedTotal,
    firstDate: sorted[0]?.dateIso ?? null,
    lastDate: sorted[sorted.length - 1]?.dateIso ?? null,
  };
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
}

main();
