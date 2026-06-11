import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

async function loadModule() {
  vi.resetModules();
  return import('../serverClient');
}

describe('isPostgresConfigured', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('returns false when POSTGRES_URL is absent', async () => {
    vi.stubEnv('POSTGRES_URL', '');
    const mod = await loadModule();
    expect(mod.isPostgresConfigured()).toBe(false);
  });

  it('returns true when POSTGRES_URL is set', async () => {
    vi.stubEnv('POSTGRES_URL', 'postgresql://user:pass@host/db');
    const mod = await loadModule();
    expect(mod.isPostgresConfigured()).toBe(true);
  });
});

describe('getPostgresClient', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('throws PostgresConfigError listing the missing variable', async () => {
    vi.stubEnv('POSTGRES_URL', '');
    const mod = await loadModule();
    try {
      mod.getPostgresClient();
      expect.fail('expected PostgresConfigError');
    } catch (err) {
      expect(err).toBeInstanceOf(mod.PostgresConfigError);
      const e = err as InstanceType<typeof mod.PostgresConfigError>;
      expect(e.missing).toContain('POSTGRES_URL');
    }
  });

  it('error message does NOT include the connection string', async () => {
    vi.stubEnv('POSTGRES_URL', '');
    const mod = await loadModule();
    try {
      mod.getPostgresClient();
    } catch (err) {
      expect((err as Error).message).not.toMatch(/postgresql:/);
      expect((err as Error).message).not.toMatch(/password|pass=|:[^/].*@/);
    }
  });

  it('returns a tagged-template sql function when POSTGRES_URL is set', async () => {
    vi.stubEnv('POSTGRES_URL', 'postgresql://user:pass@host/db');
    const mod = await loadModule();
    const sql = mod.getPostgresClient();
    expect(typeof sql).toBe('function');
  });

  it('caches the client across calls when URL is unchanged', async () => {
    vi.stubEnv('POSTGRES_URL', 'postgresql://user:pass@host/db');
    const mod = await loadModule();
    const a = mod.getPostgresClient();
    const b = mod.getPostgresClient();
    expect(b).toBe(a);
  });
});

describe('getPostgresMigrationClient', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('prefers POSTGRES_URL_NON_POOLING when set', async () => {
    vi.stubEnv('POSTGRES_URL', 'postgresql://pooled@host/db');
    vi.stubEnv('POSTGRES_URL_NON_POOLING', 'postgresql://direct@host/db');
    const mod = await loadModule();
    const sql = mod.getPostgresMigrationClient();
    expect(typeof sql).toBe('function');
  });

  it('falls back to POSTGRES_URL when POSTGRES_URL_NON_POOLING is absent', async () => {
    vi.stubEnv('POSTGRES_URL', 'postgresql://pooled@host/db');
    vi.stubEnv('POSTGRES_URL_NON_POOLING', '');
    const mod = await loadModule();
    const sql = mod.getPostgresMigrationClient();
    expect(typeof sql).toBe('function');
  });

  it('throws when neither variable is set', async () => {
    vi.stubEnv('POSTGRES_URL', '');
    vi.stubEnv('POSTGRES_URL_NON_POOLING', '');
    const mod = await loadModule();
    expect(() => mod.getPostgresMigrationClient()).toThrow(
      /Postgres server client is not configured/,
    );
  });
});

describe('server-only safeguards (source-level)', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const SOURCE = path.resolve(here, '../serverClient.ts');

  it('serverClient.ts imports "server-only" at the top of the file', () => {
    const src = readFileSync(SOURCE, 'utf-8');
    expect(src).toMatch(/^import 'server-only'/m);
  });

  it('no Postgres source uses the NEXT_PUBLIC_ prefix', () => {
    const src = readFileSync(SOURCE, 'utf-8');
    expect(src).not.toMatch(/NEXT_PUBLIC_POSTGRES/);
  });
});
