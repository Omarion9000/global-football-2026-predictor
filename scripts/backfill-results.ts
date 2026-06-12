#!/usr/bin/env tsx
// =============================================================================
// scripts/backfill-results.ts
// =============================================================================
// Phase 8D — backfill the Phase 8A football-data.co.uk corpus into Neon's
// teams + fixtures + match_results tables. Idempotent: re-runs return zeros.
//
// Usage:
//   pnpm history:fetch                # if you haven't already (Phase 8A)
//   pnpm history:build                # build data/processed/matches.json
//   vercel env pull .env.local --environment=production
//   pnpm history:backfill --dry-run   # preview counts
//   pnpm history:backfill             # apply changes
//   rm -f .env.local
//
// Env requirements:
//   - POSTGRES_URL (or POSTGRES_URL_NON_POOLING)
//   - No API key required — the corpus is local.
// =============================================================================

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  getPostgresClient,
  isPostgresConfigured,
} from '@/lib/data/postgres/serverClient';
import { backfillHistoricalCorpus } from '@/lib/data/sources/footballData/backfill';
import type { HistoricalMatch } from '@/lib/data/history/parseHistoricalCsv';

const CORPUS_PATH = resolve(process.cwd(), 'data', 'processed', 'matches.json');

const localEnv = resolve(process.cwd(), '.env.local');
if (existsSync(localEnv)) {
  process.loadEnvFile(localEnv);
}

function parseArgs(): { dryRun: boolean } {
  let dryRun = false;
  for (const arg of process.argv.slice(2)) {
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    throw new Error(`history:backfill: unknown argument "${arg}"`);
  }
  return { dryRun };
}

async function main(): Promise<void> {
  const { dryRun } = parseArgs();

  if (!isPostgresConfigured()) {
    throw new Error(
      'history:backfill: POSTGRES_URL is not set. Run `vercel env pull .env.local --environment=production` first.',
    );
  }
  if (!existsSync(CORPUS_PATH)) {
    throw new Error(
      `history:backfill: corpus not found at ${CORPUS_PATH}. Run \`pnpm history:fetch && pnpm history:build\` first.`,
    );
  }
  const matches = JSON.parse(readFileSync(CORPUS_PATH, 'utf-8')) as HistoricalMatch[];
  if (!Array.isArray(matches) || matches.length === 0) {
    throw new Error(`history:backfill: corpus at ${CORPUS_PATH} is empty or malformed.`);
  }

  const sql = getPostgresClient();
  const summary = await backfillHistoricalCorpus(matches, sql, { dryRun });

  process.stdout.write(
    JSON.stringify(
      {
        backend: 'postgres',
        source: 'football-data.co.uk',
        dryRun,
        ...summary,
      },
      null,
      2,
    ) + '\n',
  );
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`history:backfill failed: ${message}\n`);
  process.exit(1);
});
