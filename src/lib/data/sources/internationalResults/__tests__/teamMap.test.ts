import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CANONICAL_NATIONS,
  dbIdFor,
  findBySlug,
  resolveNation,
  type Confederation,
} from '../teamMap';
import { parseResults } from '../parseResults';

// =============================================================================
// Internal invariants
// =============================================================================

describe('teamMap — invariants', () => {
  it('every slug is unique', () => {
    const slugs = CANONICAL_NATIONS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('every code is a 3-letter uppercase string', () => {
    for (const t of CANONICAL_NATIONS) {
      expect(t.code).toMatch(/^[A-Z]{3}$/);
    }
  });

  it('every confederation is one of the six FIFA confederations', () => {
    const allowed: ReadonlyArray<Confederation> = ['AFC', 'CAF', 'CONCACAF', 'CONMEBOL', 'OFC', 'UEFA'];
    for (const t of CANONICAL_NATIONS) {
      expect(allowed).toContain(t.confederation);
    }
  });

  it('every corpus name maps to exactly one nation', () => {
    const seen = new Map<string, string>();
    for (const t of CANONICAL_NATIONS) {
      for (const name of t.corpusNames) {
        if (seen.has(name)) {
          throw new Error(`corpus name "${name}" maps to ${seen.get(name)} and ${t.slug}`);
        }
        seen.set(name, t.slug);
      }
    }
    expect(seen.size).toBeGreaterThan(0);
  });

  it('dbIdFor produces nat-{slug}', () => {
    const belgium = CANONICAL_NATIONS.find((t) => t.slug === 'belgium')!;
    expect(dbIdFor(belgium)).toBe('nat-belgium');
  });

  it('per-confederation counts match the public membership totals', () => {
    const byConf = new Map<Confederation, number>();
    for (const t of CANONICAL_NATIONS) {
      byConf.set(t.confederation, (byConf.get(t.confederation) ?? 0) + 1);
    }
    // The Phase 9A corpus snapshot has these counts; tests freeze them so a
    // future map edit must come with a deliberate count change.
    expect(byConf.get('UEFA')).toBe(59); // 55 current + 4 historical
    expect(byConf.get('AFC')).toBe(48); // 46 current + 2 historical
    expect(byConf.get('CAF')).toBe(54);
    expect(byConf.get('CONCACAF')).toBe(41);
    expect(byConf.get('CONMEBOL')).toBe(10);
    expect(byConf.get('OFC')).toBe(11);
  });
});

// =============================================================================
// Hard-error path
// =============================================================================

describe('teamMap — unmapped names hard-fail', () => {
  it('resolveNation throws for an unknown name', () => {
    expect(() => resolveNation('Not A Country')).toThrow(/unmapped national team name "Not A Country"/);
  });
});

// =============================================================================
// Corpus completeness — every team in the filtered top-tier corpus resolves
// =============================================================================

const CORPUS_PATH = resolve(process.cwd(), 'data', 'raw', 'international_results.csv');

describe('teamMap — corpus completeness', () => {
  if (!existsSync(CORPUS_PATH)) {
    it.skip('corpus missing — re-download to run completeness check', () => undefined);
    return;
  }

  const csv = readFileSync(CORPUS_PATH, 'utf-8');
  const { matches } = parseResults(csv);
  const distinct = new Set<string>();
  for (const m of matches) {
    distinct.add(m.homeTeam);
    distinct.add(m.awayTeam);
  }

  it('every distinct team in the filtered corpus resolves to a CanonicalNation', () => {
    const unresolved: string[] = [];
    for (const name of distinct) {
      try {
        resolveNation(name);
      } catch {
        unresolved.push(name);
      }
    }
    expect(unresolved).toEqual([]);
  });

  it('every CanonicalNation is retrievable via findBySlug', () => {
    for (const t of CANONICAL_NATIONS) {
      const found = findBySlug(t.slug);
      expect(found).not.toBeNull();
      expect(found!.slug).toBe(t.slug);
    }
  });
});
