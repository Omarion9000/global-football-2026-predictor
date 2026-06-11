// Test-only mock for the Neon HTTP `sql` tagged-template function.
//
// Usage:
//   const sql = makeMockSql();
//   sql.enqueue([row]);            // next sql`...` resolves to [row]
//   sql.enqueueError({ code: '23505', message: 'duplicate' });  // throws on next call
//   await repo.insertPredictionRun(insert);
//   expect(sql.calls[0].query).toMatch(/INSERT INTO prediction_runs/);
//   expect(sql.calls[0].values).toContain(insert.fixture_id);

export type QueuedResponse =
  | { kind: 'rows'; rows: unknown[] }
  | { kind: 'error'; error: Error };

export type SqlCall = {
  /** Reassembled query text with `?` in place of each interpolated value. */
  query: string;
  /** Literal values interpolated into the query, in order. */
  values: unknown[];
};

export type MockSql = ((
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<unknown[]>) & {
  calls: SqlCall[];
  queue: QueuedResponse[];
  enqueue: (rows: unknown[]) => void;
  enqueueError: (error: { code?: string; message?: string }) => void;
};

export function makeMockSql(): MockSql {
  const calls: SqlCall[] = [];
  const queue: QueuedResponse[] = [];

  const fn = ((
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<unknown[]> => {
    // Reassemble the query for assertion-friendly inspection.
    let query = '';
    strings.forEach((s, i) => {
      query += s;
      if (i < values.length) query += '?';
    });
    calls.push({
      query: query.replace(/\s+/g, ' ').trim(),
      values: [...values],
    });
    const next = queue.shift();
    if (next == null) {
      return Promise.resolve([]);
    }
    if (next.kind === 'error') {
      return Promise.reject(next.error);
    }
    return Promise.resolve(next.rows);
  }) as MockSql;

  fn.calls = calls;
  fn.queue = queue;
  fn.enqueue = (rows: unknown[]) => queue.push({ kind: 'rows', rows });
  fn.enqueueError = (error: { code?: string; message?: string }) => {
    const err = new Error(error.message ?? 'mock error');
    if (error.code != null) (err as { code?: string }).code = error.code;
    queue.push({ kind: 'error', error: err });
  };

  return fn;
}
