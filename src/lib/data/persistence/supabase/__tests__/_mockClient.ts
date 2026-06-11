// Test-only fluent mock for Supabase. Each table responds with a configurable
// { data, error } payload. The mock records every chained method call so
// tests can assert the exact query shape the repository produced.

import { vi } from 'vitest';

export type MockResponse = { data: unknown; error: unknown };

type Call = { table: string; method: string; args: unknown[] };

type FluentBuilder = {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  then: (
    onFulfilled?: ((value: MockResponse) => unknown) | null,
    onRejected?: ((reason: unknown) => unknown) | null,
  ) => Promise<unknown>;
};

export type MockClient = {
  from: ReturnType<typeof vi.fn>;
  calls: Call[];
  builderForTable: (table: string) => FluentBuilder | undefined;
};

/**
 * Build a Supabase-like mock client. Each entry in `responsesByTable` is the
 * { data, error } the terminal call (`.single()`, `.maybeSingle()`, or plain
 * `await`) resolves to for that table.
 *
 * Example:
 *   const m = makeMockClient({ prediction_runs: { data: row, error: null } });
 *   await repo.insertPredictionRun(insert);
 *   expect(m.from).toHaveBeenCalledWith('prediction_runs');
 */
export function makeMockClient(
  responsesByTable: Record<string, MockResponse> = {},
): MockClient {
  const calls: Call[] = [];
  const buildersByTable = new Map<string, FluentBuilder>();

  function createBuilder(table: string): FluentBuilder {
    const final = responsesByTable[table] ?? { data: null, error: null };
    const builder: Partial<FluentBuilder> = {};

    const record = (method: string) => (...args: unknown[]) => {
      calls.push({ table, method, args });
      return builder as FluentBuilder;
    };

    builder.select = vi.fn(record('select'));
    builder.insert = vi.fn(record('insert'));
    builder.eq = vi.fn(record('eq'));
    builder.order = vi.fn(record('order'));
    builder.limit = vi.fn(record('limit'));

    builder.single = vi.fn(async () => {
      calls.push({ table, method: 'single', args: [] });
      return final;
    });
    builder.maybeSingle = vi.fn(async () => {
      calls.push({ table, method: 'maybeSingle', args: [] });
      return final;
    });
    builder.then = (
      onFulfilled?: ((value: MockResponse) => unknown) | null,
      onRejected?: ((reason: unknown) => unknown) | null,
    ) => {
      calls.push({ table, method: 'then', args: [] });
      return Promise.resolve(final).then(onFulfilled ?? undefined, onRejected ?? undefined);
    };

    return builder as FluentBuilder;
  }

  const from = vi.fn((table: string) => {
    calls.push({ table, method: 'from', args: [table] });
    if (!buildersByTable.has(table)) {
      buildersByTable.set(table, createBuilder(table));
    }
    return buildersByTable.get(table)!;
  });

  return {
    from,
    calls,
    builderForTable: (table: string) => buildersByTable.get(table),
  };
}
