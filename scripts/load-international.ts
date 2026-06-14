#!/usr/bin/env tsx
// =============================================================================
// scripts/load-international.ts
// =============================================================================
// Phase 9A — load the martj42 international corpus into Neon Postgres.
// Idempotent: re-runs return all-zeros.
//
// Usage:
//   vercel env pull .env.local --environment=production
//   pnpm intl:load --dry-run       # preview counts, no writes
//   pnpm intl:load                 # apply changes
//   rm -f .env.local
//
// Prerequisites:
//   - Run `pnpm db:migrate:postgres:0003` first (adds INTERNATIONAL stage +
//     tournament column).
//   - The corpus file must already exist on disk at
//     data/raw/international_results.csv (one-shot download — not refetched
//     automatically because the source ships static CSV releases).
// =============================================================================

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  getPostgresClient,
  isPostgresConfigured,
} from '@/lib/data/postgres/serverClient';
import { parseResults } from '@/lib/data/sources/internationalResults/parseResults';
import { loadInternationalCorpus } from '@/lib/data/sources/internationalResults/loader';

const CORPUS_PATH = resolve(process.cwd(), 'data', 'raw', 'international_results.csv');

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
    throw new Error(`intl:load: unknown argument "${arg}"`);
  }
  return { dryRun };
}

async function main(): Promise<void> {
  const { dryRun } = parseArgs();

  if (!isPostgresConfigured()) {
    throw new Error(
      'intl:load: POSTGRES_URL is not set. Run `vercel env pull .env.local --environment=production` first.',
    );
  }
  if (!existsSync(CORPUS_PATH)) {
    throw new Error(
      `intl:load: corpus not found at ${CORPUS_PATH}. Download results.csv from github.com/martj42/international_results first.`,
    );
  }

  const csv = readFileSync(CORPUS_PATH, 'utf-8');
  const parsed = parseResults(csv);

  const sql = getPostgresClient();

  // Lightweight progress signal — printed to stderr so the final JSON on
  // stdout remains parseable.
  const summary = await loadInternationalCorpus(parsed.matches, sql, {
    dryRun,
    progressEvery: 1000,
    onProgress: (processed, total) => {
      process.stderr.write(`  progress: ${processed} / ${total}\n`);
    },
  });

  process.stdout.write(
    JSON.stringify(
      {
        backend: 'postgres',
        source: 'martj42/international_results',
        dryRun,
        parsed: { topTierMatches: parsed.matches.length, rejected: parsed.rejected },
        ...summary,
      },
      null,
      2,
    ) + '\n',
  );
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`intl:load failed: ${message}\n`);
  process.exit(1);
});
