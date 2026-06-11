import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  InMemoryPredictionRepository,
  InMemorySnapshotRepository,
} from '@/lib/data';
import {
  detectSmokeBackend,
  runPersistenceSmoke,
  SMOKE_FIXTURE_ID,
  SMOKE_RUN_TYPE,
} from '../persistPredictionSmoke';
import { MODEL_VERSION } from '@/lib/model';

// =============================================================================
// Functional: runPersistenceSmoke with injected in-memory repositories.
// =============================================================================

describe('runPersistenceSmoke — functional', () => {
  it('first call inserts a prediction run and its scorelines', async () => {
    const predictionRepo = new InMemoryPredictionRepository();
    const snapshotRepo = new InMemorySnapshotRepository();

    const result = await runPersistenceSmoke({
      predictionRepository: predictionRepo,
      snapshotRepository: snapshotRepo,
      backend: 'in-memory',
      monteCarloIterations: 500,
    });

    expect(result.status).toBe('INSERTED');
    expect(result.backend).toBe('in-memory');
    expect(result.fixtureId).toBe(SMOKE_FIXTURE_ID);
    expect(result.runType).toBe(SMOKE_RUN_TYPE);
    expect(result.modelVersion).toBe(MODEL_VERSION);
    expect(typeof result.predictionRunId).toBe('string');
    expect(result.predictionRunId).toBeTruthy();
    expect(result.topScorelineCount).toBeGreaterThan(0);
    // In-memory backend skips the seed step — counts stay at 0.
    expect(result.seededTeams).toBe(0);
    expect(result.seededFixtures).toBe(0);
    expect(result.seededStatsSnapshots).toBe(0);
  });

  it('second call against the same repositories returns SKIPPED_EXISTING', async () => {
    const predictionRepo = new InMemoryPredictionRepository();
    const snapshotRepo = new InMemorySnapshotRepository();

    const first = await runPersistenceSmoke({
      predictionRepository: predictionRepo,
      snapshotRepository: snapshotRepo,
      backend: 'in-memory',
      monteCarloIterations: 500,
    });
    expect(first.status).toBe('INSERTED');

    const second = await runPersistenceSmoke({
      predictionRepository: predictionRepo,
      snapshotRepository: snapshotRepo,
      backend: 'in-memory',
      monteCarloIterations: 500,
    });

    expect(second.status).toBe('SKIPPED_EXISTING');
    expect(second.fixtureId).toBe(SMOKE_FIXTURE_ID);
    expect(second.runType).toBe(SMOKE_RUN_TYPE);
    // The skipped run points at the originally inserted row.
    expect(second.predictionRunId).toBe(first.predictionRunId);
    expect(second.seededTeams).toBe(0);
    expect(second.seededFixtures).toBe(0);
    expect(second.seededStatsSnapshots).toBe(0);
  });

  it('runs the seed step before any persistence write', async () => {
    const predictionRepo = new InMemoryPredictionRepository();
    const snapshotRepo = new InMemorySnapshotRepository();

    // Spy on the order in which the smoke service touches each collaborator.
    const callOrder: string[] = [];
    const seedFn = vi.fn(async () => {
      callOrder.push('seed');
      return { seededTeams: 2, seededFixtures: 1, seededStatsSnapshots: 2 };
    });

    const originalGetSnapshot = snapshotRepo.getSnapshotById.bind(snapshotRepo);
    snapshotRepo.getSnapshotById = vi.fn(async (id: string) => {
      callOrder.push('snapshot.get');
      return originalGetSnapshot(id);
    });
    const originalInsertSnapshot = snapshotRepo.insertSnapshot.bind(snapshotRepo);
    snapshotRepo.insertSnapshot = vi.fn(async (insert) => {
      callOrder.push('snapshot.insert');
      return originalInsertSnapshot(insert);
    });
    const originalInsertRun = predictionRepo.insertPredictionRun.bind(predictionRepo);
    predictionRepo.insertPredictionRun = vi.fn(async (insert) => {
      callOrder.push('run.insert');
      return originalInsertRun(insert);
    });

    const result = await runPersistenceSmoke({
      predictionRepository: predictionRepo,
      snapshotRepository: snapshotRepo,
      backend: 'in-memory',
      monteCarloIterations: 500,
      seedFn,
    });

    expect(seedFn).toHaveBeenCalledTimes(1);
    // Seed runs first, then snapshot lookups/inserts, then the prediction run.
    expect(callOrder.indexOf('seed')).toBe(0);
    expect(callOrder.indexOf('seed')).toBeLessThan(callOrder.indexOf('snapshot.get'));
    expect(callOrder.indexOf('snapshot.get')).toBeLessThan(callOrder.indexOf('run.insert'));
    // The injected counts make it into the result, so the seed metadata
    // is preserved through to the caller.
    expect(result.seededTeams).toBe(2);
    expect(result.seededFixtures).toBe(1);
    expect(result.seededStatsSnapshots).toBe(2);
    expect(result.status).toBe('INSERTED');
  });

  it('forwards seed counts through the SKIPPED_EXISTING path', async () => {
    const predictionRepo = new InMemoryPredictionRepository();
    const snapshotRepo = new InMemorySnapshotRepository();

    // First run primes the repository.
    await runPersistenceSmoke({
      predictionRepository: predictionRepo,
      snapshotRepository: snapshotRepo,
      backend: 'in-memory',
      monteCarloIterations: 500,
    });

    // Second run injects a seed function that reports zeros (idempotent),
    // matching the behaviour of the real Postgres seeder on a re-run.
    const seedFn = vi.fn(async () => ({
      seededTeams: 0,
      seededFixtures: 0,
      seededStatsSnapshots: 0,
    }));

    const second = await runPersistenceSmoke({
      predictionRepository: predictionRepo,
      snapshotRepository: snapshotRepo,
      backend: 'in-memory',
      monteCarloIterations: 500,
      seedFn,
    });

    expect(seedFn).toHaveBeenCalledTimes(1);
    expect(second.status).toBe('SKIPPED_EXISTING');
    expect(second.seededTeams).toBe(0);
    expect(second.seededFixtures).toBe(0);
    expect(second.seededStatsSnapshots).toBe(0);
  });

  it('result contains no connection strings or secret-shaped fields', async () => {
    const predictionRepo = new InMemoryPredictionRepository();
    const snapshotRepo = new InMemorySnapshotRepository();
    const result = await runPersistenceSmoke({
      predictionRepository: predictionRepo,
      snapshotRepository: snapshotRepo,
      backend: 'in-memory',
      monteCarloIterations: 500,
    });
    const serialised = JSON.stringify(result);
    expect(serialised).not.toMatch(/postgresql:|postgres:|\bpassword=|sslmode=|@neon\.tech/);
    expect(serialised).not.toMatch(/\bSUPABASE_/);
    // Allow `seededTeams`/`seededFixtures`/`seededStatsSnapshots` field names
    // while still blocking literal env-var references.
    expect(serialised).not.toMatch(/POSTGRES_URL/);
    expect(serialised).not.toMatch(/POSTGRES_URL_NON_POOLING/);
  });
});

// =============================================================================
// detectSmokeBackend — priority detection (no real connection).
// =============================================================================

describe('detectSmokeBackend', () => {
  afterEach(() => vi.unstubAllEnvs());

  function clearAll(): void {
    vi.stubEnv('POSTGRES_URL', '');
    vi.stubEnv('SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
  }

  it('returns "postgres" when POSTGRES_URL is set', () => {
    clearAll();
    vi.stubEnv('POSTGRES_URL', 'postgresql://user:pass@host/db');
    expect(detectSmokeBackend()).toBe('postgres');
  });

  it('returns "postgres" when both Postgres and Supabase are configured (Postgres wins)', () => {
    clearAll();
    vi.stubEnv('POSTGRES_URL', 'postgresql://user:pass@host/db');
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'ey-fake');
    expect(detectSmokeBackend()).toBe('postgres');
  });

  it('returns "supabase" when only Supabase is configured', () => {
    clearAll();
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'ey-fake');
    expect(detectSmokeBackend()).toBe('supabase');
  });

  it('returns "in-memory" when no DB env vars are set', () => {
    clearAll();
    expect(detectSmokeBackend()).toBe('in-memory');
  });
});

// =============================================================================
// Source-level safeguards
// =============================================================================

describe('persistPredictionSmoke — source-level safeguards', () => {
  it('module imports server-only as a build-time backstop', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const url = await import('node:url');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = fs.readFileSync(
      path.resolve(here, '../persistPredictionSmoke.ts'),
      'utf-8',
    );
    expect(src).toMatch(/^import 'server-only'/m);
  });

  it('source uses no NEXT_PUBLIC_ database env vars', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const url = await import('node:url');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = fs.readFileSync(
      path.resolve(here, '../persistPredictionSmoke.ts'),
      'utf-8',
    );
    expect(src).not.toMatch(/NEXT_PUBLIC_/);
  });

  it('source does not print connection strings or secrets', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const url = await import('node:url');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = fs.readFileSync(
      path.resolve(here, '../persistPredictionSmoke.ts'),
      'utf-8',
    );
    // The service module returns a structured result; it never writes to
    // stdout/stderr itself.
    expect(src).not.toMatch(/process\.env\.POSTGRES_URL\s*\)?\s*\.toString/);
    expect(src).not.toMatch(/console\.log\(.*POSTGRES_URL/);
    expect(src).not.toMatch(/console\.\w+\(/);
  });
});
