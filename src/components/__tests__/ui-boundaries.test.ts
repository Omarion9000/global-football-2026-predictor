import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Backstop for the ESLint boundary in .eslintrc.json: no component source
// file may import from the engine math packages. The lint rule fails the
// build on a violation; this test also surfaces it inside Vitest.

const here = path.dirname(fileURLToPath(import.meta.url));
const componentsDir = path.resolve(here, '..');

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__') continue; // skip test files themselves
      out.push(...listSourceFiles(full));
    } else if (full.endsWith('.tsx') || full.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

const FORBIDDEN_IMPORT_PATTERNS = [
  /from ['"]@\/lib\/model/,
  /from ['"]@\/lib\/simulation/,
  /from ['"]@\/lib\/normalization/,
  /from ['"]@\/lib\/utils\/rng/,
  /from ['"]@\/lib\/utils\/poisson/,
  // Phase 7A — Supabase MUST NOT be imported by client components. The
  // serverClient module uses `import 'server-only'` as a build-time backstop;
  // this runtime test catches any source file that drifts past the lint rule.
  /from ['"]@supabase\/supabase-js/,
  /from ['"]@\/lib\/data\/supabase/,
  /from ['"]@\/lib\/data\/persistence\/supabase/,
  // Phase 7C — Neon / Vercel Postgres adapter. Same rules.
  /from ['"]@neondatabase\/serverless/,
  /from ['"]@\/lib\/data\/postgres/,
  /from ['"]@\/lib\/data\/persistence\/postgres/,
  /from ['"]@\/lib\/data\/persistence\/repositoryFactory/,
  // Phase 7E — the persistence smoke service is also server-only.
  /from ['"]@\/lib\/data\/smoke/,
  /from ['"]server-only/,
];

describe('UI boundary — src/components/** imports no engine math', () => {
  const files = listSourceFiles(componentsDir);

  it.each(files)('%s does not import from engine modules', (file) => {
    const src = readFileSync(file, 'utf-8');
    for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
      expect(src).not.toMatch(pattern);
    }
  });
});
