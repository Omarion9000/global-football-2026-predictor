import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Backstop for the ESLint boundary rule on src/lib/scheduler/**: every
// scheduler source file must be free of React, next/*, components/, or app/
// imports. The lint rule fails the build on a violation; this test makes the
// violation visible inside the test suite too.

const SCHEDULER_FILES = [
  '../runTypes.ts',
  '../scheduleWindows.ts',
  '../dueRuns.ts',
  '../executePredictionRun.ts',
  '../schedulerService.ts',
  '../index.ts',
];

function readSource(rel: string): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return readFileSync(path.join(here, rel), 'utf-8');
}

describe('scheduler engine-isolation backstop', () => {
  it.each(SCHEDULER_FILES)('%s imports nothing UI-related', (rel) => {
    const src = readSource(rel);
    expect(src).not.toMatch(/from ['"]react['"]/);
    expect(src).not.toMatch(/from ['"]react\//);
    expect(src).not.toMatch(/from ['"]next['"]/);
    expect(src).not.toMatch(/from ['"]next\//);
    expect(src).not.toMatch(/from ['"]@\/components/);
    expect(src).not.toMatch(/from ['"]@\/app/);
  });

  it('scheduler files never log to console', () => {
    for (const rel of SCHEDULER_FILES) {
      const src = readSource(rel);
      expect(src).not.toMatch(/console\.\w+\(/);
    }
  });
});
