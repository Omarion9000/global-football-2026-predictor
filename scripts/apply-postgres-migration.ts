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

// Environment variables are loaded by Node's built-in --env-file flag (see
// the package.json db:migrate:postgres script). After `vercel env pull
// .env.local`, the file is populated automatically with POSTGRES_URL etc.

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

  // Strip standalone -- comment lines and split on `;\n` (statement
  // terminators followed by a newline). The migration file is hand-written
  // with one statement per terminator, so this is safe.
  const statements = raw
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));

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
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(
        `\nFailed on statement #${applied + 1}: ${preview}…\n` +
          `Error: ${message}\n`,
      );
      process.exit(1);
    }
  }

  process.stdout.write(`\nApplied ${applied} statements successfully.\n`);
}

main().catch((err) => {
  process.stderr.write(`Unexpected error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
