import { describe, expect, it } from 'vitest';
import { DICT, SUPPORTED_LANGS, t, type Lang } from '../dictionary';

// Phase 9D.1 — parity tests. The single biggest risk in a bilingual UI is a
// missed translation: a key that exists in EN but not ES (or vice versa) means
// a piece of chrome renders as `undefined` once the user toggles.
//
// These tests walk the dictionary tree on both sides and assert identical
// key shape — including for nested objects and for parameterised function
// signatures (verified by arity).

type Shape = { kind: 'string' } | { kind: 'function'; arity: number } | { kind: 'object'; children: Record<string, Shape> };

function shapeOf(node: unknown): Shape {
  if (typeof node === 'string') return { kind: 'string' };
  if (typeof node === 'function') return { kind: 'function', arity: (node as (...a: unknown[]) => unknown).length };
  if (node && typeof node === 'object') {
    const children: Record<string, Shape> = {};
    for (const [k, v] of Object.entries(node)) children[k] = shapeOf(v);
    return { kind: 'object', children };
  }
  throw new Error(`Unexpected dictionary node type: ${typeof node}`);
}

describe('i18n dictionary parity', () => {
  it('exposes EN and ES', () => {
    expect(SUPPORTED_LANGS).toEqual(['en', 'es']);
  });

  it('EN and ES have identical key shape (recursive)', () => {
    const en = shapeOf(DICT.en);
    const es = shapeOf(DICT.es);
    expect(es).toEqual(en);
  });
});

describe('i18n dictionary content guards', () => {
  it.each(SUPPORTED_LANGS)('every string in %s is non-empty', (lang: Lang) => {
    const dict = t(lang);
    const visit = (obj: unknown, path: string): void => {
      if (typeof obj === 'string') {
        expect(obj.trim().length, `${lang}:${path}`).toBeGreaterThan(0);
        return;
      }
      if (typeof obj === 'function') return;
      if (obj && typeof obj === 'object') {
        for (const [k, v] of Object.entries(obj)) visit(v, path ? `${path}.${k}` : k);
      }
    };
    visit(dict, '');
  });

  it('parameterised functions produce non-empty strings in both languages', () => {
    for (const lang of SUPPORTED_LANGS) {
      const d = t(lang);
      expect(d.footer.model('v0.1.0')).toMatch(/v0\.1\.0/);
      expect(d.home.runMeta('1 Jan 2026 00:00')).toMatch(/1 Jan 2026 00:00/);
      expect(d.home.mcPasses('10,000')).toMatch(/10,000/);
      expect(d.home.seed(42)).toMatch(/42/);
      expect(d.home.rank('01')).toMatch(/01/);
      expect(d.home.group('A')).toMatch(/A/);
      expect(d.groups.meta(12)).toMatch(/12/);
      expect(d.groups.advBadge('80%')).toMatch(/80%/);
      expect(d.bracket.winnerGroup('A')).toMatch(/A/);
      expect(d.bracket.runnerUpGroup('B')).toMatch(/B/);
      expect(d.bracket.bestThird(3)).toMatch(/3/);
      expect(d.bracket.r32Cell('07')).toMatch(/07/);
      expect(d.bracket.winnerFeed('R32', '07')).toMatch(/R32/);
    }
  });

  it('does not use banned vocabulary in either language', () => {
    // Per CLAUDE.md §1, no "odds" / "official" in product copy. (`ui-vocabulary`
    // test enforces this on src/{components,app}; dictionary lives in src/i18n
    // so we mirror the rule here.)
    const visit = (obj: unknown): string[] => {
      const found: string[] = [];
      if (typeof obj === 'string') {
        if (/\bodds\b/i.test(obj)) found.push(obj);
        if (/\bofficial\b/i.test(obj)) found.push(obj);
      } else if (obj && typeof obj === 'object') {
        for (const v of Object.values(obj)) found.push(...visit(v));
      }
      return found;
    };
    expect(visit(DICT.en)).toEqual([]);
    expect(visit(DICT.es)).toEqual([]);
  });
});
