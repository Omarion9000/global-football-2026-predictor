#!/usr/bin/env tsx
// =============================================================================
// scripts/seed-postgres.ts
// =============================================================================
// Phase 7H — seed the full mock catalog (8 teams, 4 fixtures, 8 stats
// snapshots) into Neon/Postgres so the public UI can render persisted
// predictions for every fixture once the cron schedules new runs. Idempotent:
// re-running reports zero everywhere because every insert is guarded by
// ON CONFLICT DO NOTHING or a SELECT-then-INSERT existence check.
//
// Usage (against Neon Production):
//   vercel env pull .env.local --environment=production
//   pnpm db:seed:postgres
//   rm .env.local
//
// Without POSTGRES_URL set, the script exits with a clear error rather than
// silently doing nothing — operator intent matters here.
//
// The package script invokes `tsx --conditions=react-server` so any
// `import 'server-only'` in the dependency chain resolves to its empty
// `react-server` export rather than throwing.
//
// Safety:
//   - Connection strings are never printed.
//   - stdout is a single JSON object with no driver / env details.
//   - On any failure: short message on stderr, non-zero exit code.
// =============================================================================

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { seedAllMockData } from '@/lib/data/smoke/postgresSeed';
import {
  getPostgresClient,
  isPostgresConfigured,
} from '@/lib/data/postgres/serverClient';

// Load .env.local if present. `process.loadEnvFile` is Node 20.12+/22 native,
// equivalent to the `--env-file` CLI flag but invocation-agnostic so tsx's
// argument parser cannot swallow it.
const localEnv = resolve(process.cwd(), '.env.local');
if (existsSync(localEnv)) {
  process.loadEnvFile(localEnv);
}

async function main(): Promise<void> {
  if (!isPostgresConfigured()) {
    throw new Error(
      'POSTGRES_URL is not set. Pull production env first: vercel env pull .env.local --environment=production',
    );
  }
  const sql = getPostgresClient();
  const result = await seedAllMockData(sql);
  // Single structured JSON object — no connection string, no env value.
  process.stdout.write(
    JSON.stringify(
      {
        backend: 'postgres',
        seededTeams: result.seededTeams,
        seededFixtures: result.seededFixtures,
        seededStatsSnapshots: result.seededStatsSnapshots,
      },
      null,
      2,
    ) + '\n',
  );
}

main().catch((err) => {
  // Print only a short message — never include the original error's stack or
  // `cause` (which may carry driver internals or the connection URL).
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Seed failed: ${message}\n`);
  process.exit(1);
});
