#!/usr/bin/env tsx
// =============================================================================
// scripts/apply-postgres-migration.ts
// =============================================================================
// Applies a single SQL migration file under `supabase/migrations/` against the
// Neon Postgres instance reachable through POSTGRES_URL_NON_POOLING (preferred
// — direct connection avoids pgbouncer interfering with DDL) or POSTGRES_URL.
//
// Usage:
//   vercel env pull .env.local                       # populates POSTGRES_URL*
//   pnpm db:migrate:postgres                         # default: 0001_init.sql
//   pnpm db:migrate:postgres:0002                    # named script for 0002
//   tsx scripts/apply-postgres-migration.ts FILE     # any file in migrations/
//
// Migration tracking: this runner does NOT maintain a schema_migrations
// ledger. It applies exactly one file per invocation. Operators decide which
// file to apply; idempotency is the migration's responsibility (see 0002 for
// the DROP IF EXISTS / ADD pattern).
//
// Safety:
//   - Statements run sequentially. If one fails, the script exits with a
//     non-zero code and prints the failing statement preview.
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

  const migrationFile = process.argv[2] ?? '0001_init.sql';
  // Defence in depth against accidental path traversal: only a bare filename
  // inside supabase/migrations is accepted.
  if (migrationFile.includes('/') || migrationFile.includes('\\') || migrationFile.includes('..')) {
    process.stderr.write(
      `Invalid migration filename "${migrationFile}". Pass a bare filename inside supabase/migrations.\n`,
    );
    process.exit(1);
  }
  const migrationPath = resolve(
    process.cwd(),
    'supabase/migrations',
    migrationFile,
  );
  if (!existsSync(migrationPath)) {
    process.stderr.write(`Migration file not found: ${migrationPath}\n`);
    process.exit(1);
  }

  const raw = readFileSync(migrationPath, 'utf-8');
  const statements = splitMigrationStatements(raw);

  process.stdout.write(
    `Applying ${statements.length} statements from ${migrationFile} to ${sanitiseUrl(url)} …\n`,
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
      // 42P07 = duplicate_table, 42710 = duplicate_object. For 0001 this
      // means the migration has already been applied; that file does NOT use
      // CREATE … IF NOT EXISTS. For later migrations (e.g. 0002) the SQL is
      // authored idempotently with DROP IF EXISTS + ADD, so a duplicate
      // shouldn't surface here — if it does, the file itself is the problem.
      if (code === '42P07' || code === '42710') {
        process.stderr.write(
          `\nFailed on statement #${applied + 1}: ${preview}…\n` +
            `Error: ${message}\n\n` +
            `Hint: the target database already contains the object this statement\n` +
            `      tries to create. If you are applying 0001_init.sql, the schema\n` +
            `      is already in place — there is nothing left to do, no DROP needed.\n` +
            `      If you are applying a later migration, that file should be authored\n` +
            `      idempotently (DROP IF EXISTS + ADD) — fix the file rather than the DB.\n`,
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
