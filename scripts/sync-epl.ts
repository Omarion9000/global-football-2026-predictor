#!/usr/bin/env tsx
// =============================================================================
// scripts/sync-epl.ts
// =============================================================================
// Phase 8D — sync Premier League fixtures + finished results from
// football-data.org into Neon Postgres. Idempotent: re-runs return all-zeros.
//
// Usage:
//   vercel env pull .env.local --environment=production
//   pnpm sync:epl --dry-run         # print counts, no writes
//   pnpm sync:epl                   # apply changes
//   rm -f .env.local
//
// Env requirements:
//   - POSTGRES_URL (or POSTGRES_URL_NON_POOLING)
//   - FOOTBALL_DATA_API_KEY (server-only; never logged)
//
// Defaults to the most recently completed Premier League season
// (2025-26 at time of writing — API param 2025). Override with --season=YYYY
// where YYYY is the opening calendar year (e.g. 2026 for 2026-27 fixtures
// once those are published).
// =============================================================================

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { getPostgresClient, isPostgresConfigured } from '@/lib/data/postgres/serverClient';
import { createFootballDataClient, FREE_TIER_RATE_LIMIT_DELAY_MS } from '@/lib/data/sources/footballData/client';
import { syncEplSeason } from '@/lib/data/sources/footballData/sync';

// Default to the season whose API param is `currentYear - 1`. As of 2026-06-12
// that's 2025 (= the 2025-26 EPL season, which just ended). The 2024-25 season
// is already covered by the Phase 8A historical corpus and would collide on
// every deterministic id, making the run look successful but exercising no
// new write path. Operators can override with --season=YYYY.
const DEFAULT_SEASON = 2025; // 2025-26

const localEnv = resolve(process.cwd(), '.env.local');
if (existsSync(localEnv)) {
  process.loadEnvFile(localEnv);
}

function parseArgs(): { season: number; dryRun: boolean } {
  let season = DEFAULT_SEASON;
  let dryRun = false;
  for (const arg of process.argv.slice(2)) {
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (arg.startsWith('--season=')) {
      const v = Number(arg.slice('--season='.length));
      if (!Number.isFinite(v) || v < 2000 || v > 2100) {
        throw new Error(`sync-epl: invalid --season value "${arg}"`);
      }
      season = v;
      continue;
    }
    throw new Error(`sync-epl: unknown argument "${arg}"`);
  }
  return { season, dryRun };
}

async function main(): Promise<void> {
  const { season, dryRun } = parseArgs();

  if (!isPostgresConfigured()) {
    throw new Error(
      'sync-epl: POSTGRES_URL is not set. Run `vercel env pull .env.local --environment=production` first.',
    );
  }

  const apiClient = createFootballDataClient({
    // Pace internal sleeps at the free-tier rate so backoff retries don't
    // outpace the limit. The client itself doesn't pre-sleep between calls
    // (we issue only 1–2 requests per sync), but the value is here for
    // future loops that fan out across seasons.
  });
  const sql = getPostgresClient();

  const summary = await syncEplSeason(apiClient, sql, { season, dryRun });

  // Stdout = single JSON object, no driver internals, no secrets.
  process.stdout.write(
    JSON.stringify(
      {
        backend: 'postgres',
        season,
        dryRun,
        rateLimit: { freeTierDelayMs: FREE_TIER_RATE_LIMIT_DELAY_MS },
        ...summary,
      },
      null,
      2,
    ) + '\n',
  );
}

main().catch((err) => {
  // Print only a short message. Never include stacks, .cause, the URL, or
  // the API key (the client builds opaque errors that already strip these).
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`sync-epl failed: ${message}\n`);
  process.exit(1);
});
