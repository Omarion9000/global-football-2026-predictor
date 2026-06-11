import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadFactory() {
  vi.resetModules();
  return import('../repositoryFactory');
}

function clearAllDbEnv(): void {
  vi.stubEnv('POSTGRES_URL', '');
  vi.stubEnv('POSTGRES_URL_NON_POOLING', '');
  vi.stubEnv('SUPABASE_URL', '');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
}

describe('createPredictionRepository — priority ordering', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('returns PostgresPredictionRepository when POSTGRES_URL is set', async () => {
    clearAllDbEnv();
    vi.stubEnv('POSTGRES_URL', 'postgresql://user:pass@host/db');
    const factory = await loadFactory();
    const repo = factory.createPredictionRepository();
    expect(repo.constructor.name).toBe('PostgresPredictionRepository');
  });

  it('returns PostgresPredictionRepository even when Supabase is also configured', async () => {
    clearAllDbEnv();
    vi.stubEnv('POSTGRES_URL', 'postgresql://user:pass@host/db');
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'ey-fake');
    const factory = await loadFactory();
    const repo = factory.createPredictionRepository();
    expect(repo.constructor.name).toBe('PostgresPredictionRepository');
  });

  it('returns SupabasePredictionRepository when only Supabase is configured', async () => {
    clearAllDbEnv();
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'ey-fake');
    const factory = await loadFactory();
    const repo = factory.createPredictionRepository();
    expect(repo.constructor.name).toBe('SupabasePredictionRepository');
  });

  it('returns InMemoryPredictionRepository when no DB env vars are present', async () => {
    clearAllDbEnv();
    const factory = await loadFactory();
    const repo = factory.createPredictionRepository();
    expect(repo.constructor.name).toBe('InMemoryPredictionRepository');
  });

  it('returns InMemoryPredictionRepository when Supabase is partially configured', async () => {
    clearAllDbEnv();
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
    // missing key
    const factory = await loadFactory();
    const repo = factory.createPredictionRepository();
    expect(repo.constructor.name).toBe('InMemoryPredictionRepository');
  });
});

describe('createSnapshotRepository — priority ordering', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('returns PostgresSnapshotRepository when POSTGRES_URL is set', async () => {
    clearAllDbEnv();
    vi.stubEnv('POSTGRES_URL', 'postgresql://user:pass@host/db');
    const factory = await loadFactory();
    const repo = factory.createSnapshotRepository();
    expect(repo.constructor.name).toBe('PostgresSnapshotRepository');
  });

  it('returns SupabaseSnapshotRepository when only Supabase is configured', async () => {
    clearAllDbEnv();
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'ey-fake');
    const factory = await loadFactory();
    const repo = factory.createSnapshotRepository();
    expect(repo.constructor.name).toBe('SupabaseSnapshotRepository');
  });

  it('returns InMemorySnapshotRepository when no DB env vars are present', async () => {
    clearAllDbEnv();
    const factory = await loadFactory();
    const repo = factory.createSnapshotRepository();
    expect(repo.constructor.name).toBe('InMemorySnapshotRepository');
  });
});
