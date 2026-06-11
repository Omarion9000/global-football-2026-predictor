import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// We re-import the module in each test so vi.stubEnv changes affect the
// top-level cache deterministically.
async function loadClientModule() {
  vi.resetModules();
  return import('../serverClient');
}

describe('SupabaseConfigError + isSupabaseConfigured', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('isSupabaseConfigured returns false when both env vars are absent', async () => {
    vi.stubEnv('SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    const mod = await loadClientModule();
    expect(mod.isSupabaseConfigured()).toBe(false);
  });

  it('isSupabaseConfigured returns false when only the URL is set', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    const mod = await loadClientModule();
    expect(mod.isSupabaseConfigured()).toBe(false);
  });

  it('isSupabaseConfigured returns false when only the key is set', async () => {
    vi.stubEnv('SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'eyTESTKEY');
    const mod = await loadClientModule();
    expect(mod.isSupabaseConfigured()).toBe(false);
  });

  it('isSupabaseConfigured returns true when both env vars are set', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'eyTESTKEY');
    const mod = await loadClientModule();
    expect(mod.isSupabaseConfigured()).toBe(true);
  });
});

describe('getSupabaseServerClient', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('throws SupabaseConfigError listing both missing variables', async () => {
    vi.stubEnv('SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    const mod = await loadClientModule();
    try {
      mod.getSupabaseServerClient();
      expect.fail('expected SupabaseConfigError');
    } catch (err) {
      expect(err).toBeInstanceOf(mod.SupabaseConfigError);
      const e = err as InstanceType<typeof mod.SupabaseConfigError>;
      expect(e.missing).toContain('SUPABASE_URL');
      expect(e.missing).toContain('SUPABASE_SERVICE_ROLE_KEY');
    }
  });

  it('throws SupabaseConfigError listing only the missing variable', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    const mod = await loadClientModule();
    try {
      mod.getSupabaseServerClient();
      expect.fail('expected SupabaseConfigError');
    } catch (err) {
      const e = err as InstanceType<typeof mod.SupabaseConfigError>;
      expect(e.missing).toEqual(['SUPABASE_SERVICE_ROLE_KEY']);
    }
  });

  it('returns a SupabaseClient when both env vars are present', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'ey-fake-service-role');
    const mod = await loadClientModule();
    const client = mod.getSupabaseServerClient();
    // The client is a fluent builder rooted at .from() — surface check only.
    expect(client).toBeTruthy();
    expect(typeof (client as { from: unknown }).from).toBe('function');
  });

  it('caches the client across calls when URL is unchanged', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'ey-fake-service-role');
    const mod = await loadClientModule();
    const first = mod.getSupabaseServerClient();
    const second = mod.getSupabaseServerClient();
    expect(second).toBe(first);
  });
});

describe('server-only safeguards (source-level)', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const SUPABASE_SOURCES = [
    path.resolve(here, '../serverClient.ts'),
  ];

  it('serverClient.ts imports "server-only" at the top of the file', () => {
    const src = readFileSync(SUPABASE_SOURCES[0], 'utf-8');
    expect(src).toMatch(/^import 'server-only'/m);
  });

  it('no Supabase source uses the NEXT_PUBLIC_ prefix for either credential', () => {
    for (const file of SUPABASE_SOURCES) {
      const src = readFileSync(file, 'utf-8');
      expect(src).not.toMatch(/NEXT_PUBLIC_SUPABASE_URL/);
      expect(src).not.toMatch(/NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/);
    }
  });
});
