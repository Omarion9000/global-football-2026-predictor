#!/usr/bin/env tsx
// =============================================================================
// scripts/smoke-persist-prediction.ts
// =============================================================================
// Manual persistence smoke test. Picks one mock fixture, builds a deterministic
// PredictionInput, runs `predictMatch`, and writes the snapshot + run + scorelines
// through the same `repositoryFactory` the cron route uses. Use this to validate
// end-to-end Neon/Postgres persistence without waiting for a scheduler
// lifecycle anchor to be due.
//
// Usage (against Neon Production):
//   vercel env pull .env.local --environment=production   # populates POSTGRES_URL
//   pnpm smoke:persist                                    # prints structured summary
//   rm .env.local                                         # clean up
//
// Without any DB env vars set, the script runs against the in-memory factory
// fallback — useful for validating the script logic itself before touching Neon.
//
// The package script invokes `tsx --conditions=react-server` so that any
// `import 'server-only'` in the dependency chain resolves to its empty
// `react-server` export rather than throwing.
//
// Safety:
//   - Connection strings are never printed.
//   - Only structured fields appear in stdout: status, ids, run-type, model-version.
//   - DuplicatePredictionRunError → SKIPPED_EXISTING (idempotent).
// =============================================================================

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { runPersistenceSmoke } from '@/lib/data/smoke/persistPredictionSmoke';

// Load .env.local if present. `process.loadEnvFile` is Node 20.12+/22 native,
// equivalent to the `--env-file` CLI flag but invocation-agnostic so tsx's
// argument parser cannot swallow it.
const localEnv = resolve(process.cwd(), '.env.local');
if (existsSync(localEnv)) {
  process.loadEnvFile(localEnv);
}

async function main(): Promise<void> {
  const result = await runPersistenceSmoke();
  // Emit a single JSON line so callers can parse it easily. No connection
  // string is included in the result object.
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

main().catch((err) => {
  // Print only a short error message — never include the original error's
  // stack or `cause` (which may contain driver internals).
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Smoke test failed: ${message}\n`);
  process.exit(1);
});
