import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Scans every UI source file (components + app pages + layout) for two
// classes of forbidden language:
//   1. Restricted FIFA / tournament mark wording from docs/04 §3.6.
//   2. Banned betting / streaming / sponsor-claim vocabulary.
//
// Standalone "FIFA" is permitted ONLY in src/components/Disclosure.tsx where
// the non-affiliation sentence requires it. Every other file must not contain
// it.

const here = path.dirname(fileURLToPath(import.meta.url));
const componentsRoot = path.resolve(here, '..');
const appRoot = path.resolve(here, '..', '..', 'app');

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__') continue;
      out.push(...listSourceFiles(full));
    } else if (full.endsWith('.tsx') || full.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

const UI_FILES = [
  ...listSourceFiles(componentsRoot),
  ...listSourceFiles(appRoot),
];

// Restricted tournament marks per docs/04 §3.6.
const TOURNAMENT_MARK_PATTERNS: ReadonlyArray<RegExp> = [
  /\bFIFA World Cup\b/,
  /\bWorld Cup\b/,
  /\bMundial\b/,
  /\bCopa Mundial\b/,
  /\bCoupe du Monde\b/,
  /\bWeltmeisterschaft\b/,
  /\bCoppa del Mondo\b/,
];

// Banned betting / sponsor-claim vocabulary per the Phase 6 prompt.
// Word-boundary regex so "back" doesn't match "background", "bet" doesn't
// match "between", etc.
const BANNED_VOCAB_PATTERNS: ReadonlyArray<RegExp> = [
  /\bodds\b/i,
  /\bbet\b/i,
  /\bbetting\b/i,
  /\bwager\b/i,
  /\bstake\b/i,
  /\bsure thing\b/i,
  /\bguaranteed pick\b/i,
  /\bsportsbook\b/i,
  /\bbookmaker\b/i,
  /\bvalue bet\b/i,
  /\bofficial\b/i,
  /\blicensed\b/i,
  /\bsponsor\b/i,
];

describe('UI vocabulary — restricted tournament marks', () => {
  it.each(UI_FILES)('%s contains no restricted tournament marks', (file) => {
    const src = readFileSync(file, 'utf-8');
    for (const pattern of TOURNAMENT_MARK_PATTERNS) {
      expect(src).not.toMatch(pattern);
    }
  });

  it('standalone "FIFA" appears only in Disclosure.tsx', () => {
    for (const file of UI_FILES) {
      const src = readFileSync(file, 'utf-8');
      if (path.basename(file) === 'Disclosure.tsx') {
        expect(src).toMatch(/\bFIFA\b/);
      } else {
        expect(src).not.toMatch(/\bFIFA\b/);
      }
    }
  });
});

describe('UI vocabulary — banned betting / sponsor language', () => {
  // The word "sponsor" is part of the required non-affiliation disclaimer
  // sentence ("Not affiliated with FIFA, any federation, tournament organizer,
  // broadcaster, or sponsor."). Like FIFA, it is permitted ONLY inside
  // Disclosure.tsx and must not appear anywhere else.
  const SPONSOR_SOURCE = /\bsponsor\b/i.source;

  it.each(UI_FILES)('%s contains no banned vocabulary', (file) => {
    const src = readFileSync(file, 'utf-8');
    const isDisclosure = path.basename(file) === 'Disclosure.tsx';
    for (const pattern of BANNED_VOCAB_PATTERNS) {
      if (pattern.source === SPONSOR_SOURCE && isDisclosure) {
        continue;
      }
      expect(src).not.toMatch(pattern);
    }
  });
});
