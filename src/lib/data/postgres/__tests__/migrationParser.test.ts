import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { splitMigrationStatements } from '../migrationParser';

// =============================================================================
// Synthetic cases — pinpoint the previous regression where a `--` comment
// block ahead of a CREATE TABLE caused the splitter to drop the whole chunk.
// =============================================================================

describe('splitMigrationStatements — synthetic', () => {
  it('strips standalone -- comment lines without dropping the SQL after them', () => {
    const sql = [
      '-- header comment',
      '-- another',
      'CREATE TABLE foo (id text);',
    ].join('\n');
    expect(splitMigrationStatements(sql)).toEqual([
      'CREATE TABLE foo (id text)',
    ]);
  });

  it('preserves order between CREATE TABLE and subsequent COMMENT statements', () => {
    const sql = [
      'CREATE TABLE foo (id text);',
      '',
      "COMMENT ON TABLE foo IS 'hi';",
    ].join('\n');
    expect(splitMigrationStatements(sql)).toEqual([
      'CREATE TABLE foo (id text)',
      "COMMENT ON TABLE foo IS 'hi'",
    ]);
  });

  it('REGRESSION: keeps CREATE TABLE that is preceded by a comment-only section header', () => {
    const sql = [
      '-- -----',
      '-- A. foo',
      '-- -----',
      'CREATE TABLE foo (id text);',
      '',
      "COMMENT ON TABLE foo IS 'hi';",
    ].join('\n');
    const out = splitMigrationStatements(sql);
    // The previous splitter dropped the CREATE; this test would have caught it.
    expect(out[0]).toMatch(/^CREATE TABLE foo/);
    expect(out[1]).toMatch(/^COMMENT ON TABLE foo/);
  });

  it('handles multi-line CREATE TABLE statements', () => {
    const sql = [
      'CREATE TABLE foo (',
      '  id text PRIMARY KEY,',
      '  name text NOT NULL',
      ');',
      'CREATE INDEX foo_name_idx ON foo (name);',
    ].join('\n');
    const out = splitMigrationStatements(sql);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatch(/^CREATE TABLE foo/);
    expect(out[0]).toMatch(/PRIMARY KEY/);
    expect(out[1]).toMatch(/^CREATE INDEX/);
  });

  it('returns an empty array for an all-comments input', () => {
    const sql = ['-- header', '-- only comments', ''].join('\n');
    expect(splitMigrationStatements(sql)).toEqual([]);
  });

  it('returns an empty array for an empty input', () => {
    expect(splitMigrationStatements('')).toEqual([]);
  });
});

// =============================================================================
// Real migration file — locks in the ordering contract against the file the
// `db:migrate:postgres` script actually reads.
// =============================================================================

describe('splitMigrationStatements — supabase/migrations/0001_init.sql', () => {
  const migrationPath = path.resolve(
    process.cwd(),
    'supabase/migrations/0001_init.sql',
  );
  const sql = readFileSync(migrationPath, 'utf-8');
  const statements = splitMigrationStatements(sql);

  it('produces at least 20 statements', () => {
    expect(statements.length).toBeGreaterThanOrEqual(20);
  });

  it('first statement creates the teams table', () => {
    expect(statements[0]).toMatch(/^CREATE TABLE teams/i);
  });

  it('every COMMENT ON TABLE references a table created earlier in the script', () => {
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      const commentMatch = stmt.match(/^COMMENT ON TABLE\s+([a-z_][a-z0-9_]*)/i);
      if (!commentMatch) continue;
      const table = commentMatch[1];
      const createBefore = statements
        .slice(0, i)
        .some((s) => new RegExp(`^CREATE TABLE\\s+${table}\\b`, 'i').test(s));
      expect(createBefore, `COMMENT ON TABLE ${table} at statement #${i + 1} has no preceding CREATE TABLE`).toBe(true);
    }
  });

  it('every CREATE INDEX references a table created earlier in the script', () => {
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      const indexMatch = stmt.match(
        /^CREATE\s+(?:UNIQUE\s+)?INDEX\s+[a-z_][a-z0-9_]*\s+ON\s+([a-z_][a-z0-9_]*)/i,
      );
      if (!indexMatch) continue;
      const table = indexMatch[1];
      const createBefore = statements
        .slice(0, i)
        .some((s) => new RegExp(`^CREATE TABLE\\s+${table}\\b`, 'i').test(s));
      expect(createBefore, `CREATE INDEX on ${table} at statement #${i + 1} has no preceding CREATE TABLE`).toBe(true);
    }
  });

  it('preserves the canonical table set from the migration', () => {
    const tableNames = statements
      .map((s) => s.match(/^CREATE TABLE\s+([a-z_][a-z0-9_]*)/i)?.[1])
      .filter((n): n is string => n != null);
    expect(new Set(tableNames)).toEqual(
      new Set([
        'teams',
        'fixtures',
        'team_stats_snapshots',
        'data_snapshots',
        'prediction_runs',
        'prediction_scorelines',
        'model_runs',
        'match_results',
        'data_sources',
      ]),
    );
  });
});
