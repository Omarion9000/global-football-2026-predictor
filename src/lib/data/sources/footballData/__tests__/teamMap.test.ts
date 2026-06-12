import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CANONICAL_TEAMS,
  dbIdFor,
  findBySlug,
  resolveApiName,
  resolveCorpusName,
} from '../teamMap';
import type { HistoricalMatch } from '@/lib/data/history/parseHistoricalCsv';

// =============================================================================
// Internal invariants — slug / tla / name uniqueness.
// =============================================================================

describe('teamMap — invariants', () => {
  it('every slug is unique', () => {
    const slugs = CANONICAL_TEAMS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('every TLA is unique and 3 letters', () => {
    const tlas = CANONICAL_TEAMS.map((t) => t.tla);
    expect(new Set(tlas).size).toBe(tlas.length);
    for (const tla of tlas) expect(tla).toMatch(/^[A-Z]{3}$/);
  });

  it('every corpus name is mapped to exactly one slug', () => {
    const seen = new Map<string, string>();
    for (const t of CANONICAL_TEAMS) {
      for (const name of t.corpusNames) {
        if (seen.has(name)) {
          throw new Error(`corpus name "${name}" maps to both ${seen.get(name)} and ${t.slug}`);
        }
        seen.set(name, t.slug);
      }
    }
    expect(seen.size).toBeGreaterThan(0);
  });

  it('every API name is mapped to exactly one slug', () => {
    const seen = new Map<string, string>();
    for (const t of CANONICAL_TEAMS) {
      for (const name of t.apiNames) {
        if (seen.has(name)) {
          throw new Error(`API name "${name}" maps to both ${seen.get(name)} and ${t.slug}`);
        }
        seen.set(name, t.slug);
      }
    }
    expect(seen.size).toBeGreaterThan(0);
  });

  it('dbIdFor produces a stable epl- prefixed identifier', () => {
    const team = CANONICAL_TEAMS.find((t) => t.slug === 'man-united')!;
    expect(dbIdFor(team)).toBe('epl-man-united');
  });
});

// =============================================================================
// Hard-error path.
// =============================================================================

describe('teamMap — unmapped names hard-fail', () => {
  it('resolveCorpusName throws for an unknown corpus name', () => {
    expect(() => resolveCorpusName('Not A Real Club')).toThrow(/unmapped corpus team name "Not A Real Club"/);
  });

  it('resolveApiName throws for an unknown API name', () => {
    expect(() => resolveApiName('Some New FC')).toThrow(/unmapped football-data.org team name/);
  });
});

// =============================================================================
// Corpus coverage — every distinct team name in the 10-season corpus resolves.
// =============================================================================

const CORPUS_PATH = resolve(process.cwd(), 'data', 'processed', 'matches.json');

describe('teamMap — corpus coverage', () => {
  // The corpus may not exist in fresh checkouts that haven't run
  // `pnpm history:fetch && pnpm history:build`. Tests are tolerant of that
  // case to keep CI deterministic on first clone; the assertion still runs
  // locally where the corpus is present.
  if (!exists(CORPUS_PATH)) {
    it.skip('corpus missing — run `pnpm history:fetch && pnpm history:build` first', () => undefined);
    return;
  }

  const raw = readFileSync(CORPUS_PATH, 'utf-8');
  const matches = JSON.parse(raw) as HistoricalMatch[];
  const distinct = new Set<string>();
  for (const m of matches) {
    distinct.add(m.homeTeam);
    distinct.add(m.awayTeam);
  }

  it('every distinct corpus team name resolves to a CanonicalTeam', () => {
    const unresolved: string[] = [];
    for (const name of distinct) {
      try {
        resolveCorpusName(name);
      } catch {
        unresolved.push(name);
      }
    }
    expect(unresolved).toEqual([]);
  });

  it('every CanonicalTeam slug retrieves via findBySlug', () => {
    for (const t of CANONICAL_TEAMS) {
      const found = findBySlug(t.slug);
      expect(found).not.toBeNull();
      expect(found!.slug).toBe(t.slug);
    }
  });
});

function exists(p: string): boolean {
  try {
    readFileSync(p, 'utf-8');
    return true;
  } catch {
    return false;
  }
}
