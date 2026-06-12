#!/usr/bin/env tsx
// =============================================================================
// scripts/fetch-history.ts
// =============================================================================
// Phase 8A — download football-data.co.uk Premier League (E0) season CSVs for
// the 10 seasons 2015-16 through 2024-25. Files land in data/raw/ (gitignored)
// for downstream parsing by scripts/build-history.ts.
//
// Usage:
//   pnpm history:fetch
//
// Properties:
//   - Idempotent: skips any data/raw/E0-{season}.csv that already exists.
//   - Sequential with ~300ms pacing between requests (the site is small and
//     friendly; bursty downloads are not).
//   - Per-file status line on stdout: OK / SKIPPED / FAILED + size.
//   - Non-zero exit if any season returns non-200 — caller can decide to retry.
//
// URL pattern (verified against the site on 2026-06-11):
//   https://www.football-data.co.uk/mmz4281/{YYYY}/E0.csv
// where {YYYY} is the 4-digit season code (e.g. 1516, 2425).
// =============================================================================

import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SEASONS: ReadonlyArray<{ label: string; code: string }> = [
  { label: '2015-16', code: '1516' },
  { label: '2016-17', code: '1617' },
  { label: '2017-18', code: '1718' },
  { label: '2018-19', code: '1819' },
  { label: '2019-20', code: '1920' },
  { label: '2020-21', code: '2021' },
  { label: '2021-22', code: '2122' },
  { label: '2022-23', code: '2223' },
  { label: '2023-24', code: '2324' },
  { label: '2024-25', code: '2425' },
];

const RAW_DIR = resolve(process.cwd(), 'data', 'raw');
const FETCH_DELAY_MS = 300;

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

async function fetchSeason(label: string, code: string): Promise<void> {
  const target = resolve(RAW_DIR, `E0-${label}.csv`);
  if (existsSync(target)) {
    const size = statSync(target).size;
    process.stdout.write(`${pad(label, 8)}  SKIPPED  ${size} bytes (already on disk)\n`);
    return;
  }

  const url = `https://www.football-data.co.uk/mmz4281/${code}/E0.csv`;
  const response = await fetch(url);
  if (!response.ok) {
    process.stdout.write(`${pad(label, 8)}  FAILED   HTTP ${response.status}\n`);
    throw new Error(`Season ${label} returned HTTP ${response.status}`);
  }
  const body = await response.arrayBuffer();
  writeFileSync(target, Buffer.from(body));
  process.stdout.write(`${pad(label, 8)}  OK       ${body.byteLength} bytes\n`);
}

async function main(): Promise<void> {
  mkdirSync(RAW_DIR, { recursive: true });
  for (let i = 0; i < SEASONS.length; i += 1) {
    const { label, code } = SEASONS[i];
    await fetchSeason(label, code);
    // Pace requests so we don't hammer the source; only sleeps when we
    // actually issued a network request (sleep is cheap to apply uniformly).
    if (i < SEASONS.length - 1) await sleep(FETCH_DELAY_MS);
  }
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`fetch-history failed: ${message}\n`);
  process.exit(1);
});
