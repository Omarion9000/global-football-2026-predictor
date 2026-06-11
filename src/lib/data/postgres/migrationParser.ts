// Splitter for the hand-written SQL migration files under `supabase/migrations/`.
//
// The Neon HTTP driver does not accept multi-statement queries (PG's simple
// query protocol is unavailable via the HTTP API), so `apply-postgres-migration`
// needs to send statements one at a time.
//
// Strategy:
//   1. Strip single-line `--` comments line-by-line. Any line whose first
//      non-whitespace characters are `--` becomes blank — so the `;\n` split
//      below sees the SQL statements without their preceding header comments.
//   2. Split the comment-stripped text on `;` followed by either a newline or
//      end-of-string. This is safe because the migration file has no `;`
//      inside string literals (verified by the migration-file regression test).
//   3. Trim each statement, drop empties.
//
// Order is preserved. The previous implementation filtered whole chunks whose
// first character was `-`, which silently dropped any CREATE TABLE whose chunk
// happened to start with a `-- section header` comment. Tests cover the regression.

export function splitMigrationStatements(sql: string): string[] {
  const commentStripped = sql
    .split('\n')
    .map((line) => (line.trimStart().startsWith('--') ? '' : line))
    .join('\n');

  return commentStripped
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
