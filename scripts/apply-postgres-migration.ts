#!/usr/bin/env tsx
// =============================================================================
// scripts/apply-postgres-migration.ts
// =============================================================================
// Applies `supabase/migrations/0001_init.sql` against the Neon Postgres
// instance reachable through POSTGRES_URL_NON_POOLING (preferred — direct
// connection avoids pgbouncer interfering with DDL) or POSTGRES_URL.
//
// Usage:
//   vercel env pull .env.local          # populates POSTGRES_URL* in .env.local
//   pnpm db:migrate:postgres
//
// Or with explicit env:
//   POSTGRES_URL=... pnpm db:migrate:postgres
//
// Safety:
//   - Statements run sequentially. If one fails, the script exits with a
//     non-zero code and prints the failing statement preview. It does NOT
//     attempt rollback — the migration is idempotent up to CREATE TABLE
//     conflicts, so a partial apply can be resumed after dropping the
//     already-created tables.
//   - Connection strings are NEVER printed in error output. Only sanitised
//     host:db is shown.
// =============================================================================

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { neon } from '@neondatabase/serverless';
import { splitMigrationStatements } from '@/lib/data/postgres/migrationParser';

// Load .env.local if present (created by `vercel env pull .env.local
// --environment=preview`). `process.loadEnvFile()` is Node 20.12+/21.7+
// native — equivalent to the `--env-file` CLI flag but invocation-agnostic
// so tsx's argument parser cannot swallow it.
const localEnv = resolve(process.cwd(), '.env.local');
if (existsSync(localEnv)) {
  process.loadEnvFile(localEnv);
}

function sanitiseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}`;
  } catch {
    return '<unparseable>';
  }
}

async function main(): Promise<void> {
  const url = process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL;
  if (!url) {
    process.stderr.write(
      'Missing POSTGRES_URL_NON_POOLING (or POSTGRES_URL).\n' +
        'Run `vercel env pull .env.local` first, then re-run this script.\n',
    );
    process.exit(1);
  }

  const migrationPath = resolve(
    process.cwd(),
    'supabase/migrations/0001_init.sql',
  );
  if (!existsSync(migrationPath)) {
    process.stderr.write(`Migration file not found: ${migrationPath}\n`);
    process.exit(1);
  }

  const raw = readFileSync(migrationPath, 'utf-8');
  const statements = splitMigrationStatements(raw);

  process.stdout.write(
    `Applying ${statements.length} statements to ${sanitiseUrl(url)} …\n`,
  );

  const sql = neon(url);

  let applied = 0;
  for (const stmt of statements) {
    const preview = stmt.slice(0, 80).replace(/\s+/g, ' ');
    try {
      await sql.query(stmt + ';');
      applied += 1;
      process.stdout.write(`  ✓ ${preview}…\n`);
    } catch (err) {
      const code = (err as { code?: string }).code;
      const message = err instanceof Error ? err.message : String(err);
      // 42P07 = duplicate_table, 42710 = duplicate_object. Either means the
      // migration has already been applied to this database. Give the user a
      // clear next-step rather than a raw driver error.
      if (code === '42P07' || code === '42710') {
        process.stderr.write(
          `\nFailed on statement #${applied + 1}: ${preview}…\n` +
            `Error: ${message}\n\n` +
            `Hint: the target database already contains objects from this migration.\n` +
            `      The migration is single-file and not idempotent. To re-apply\n` +
            `      from scratch, drop every table first (DESTRUCTIVE — data is lost):\n\n` +
            `        DROP TABLE IF EXISTS\n` +
            `          prediction_scorelines,\n` +
            `          prediction_runs,\n` +
            `          data_snapshots,\n` +
            `          team_stats_snapshots,\n` +
            `          model_runs,\n` +
            `          match_results,\n` +
            `          data_sources,\n` +
            `          fixtures,\n` +
            `          teams\n` +
            `        CASCADE;\n\n` +
            `      Then re-run \`pnpm db:migrate:postgres\`.\n`,
        );
      } else {
        process.stderr.write(
          `\nFailed on statement #${applied + 1}: ${preview}…\n` +
            `Error: ${message}\n`,
        );
      }
      process.exit(1);
    }
  }

  process.stdout.write(`\nApplied ${applied} statements successfully.\n`);
}

main().catch((err) => {
  process.stderr.write(`Unexpected error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
