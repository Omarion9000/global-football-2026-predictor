import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { FLAG_CODE_BY_SLUG, flagCodeForSlug } from '../flagCodes';
import { getTournamentSim } from '../loadTournamentSim';

const FLAG_ICONS_DIR = path.resolve(__dirname, '..', '..', '..', 'node_modules', 'flag-icons', 'flags', '4x3');

describe('flag code map — coverage', () => {
  it('maps a flag code for every team in the tournament', () => {
    const sim = getTournamentSim();
    const missing: string[] = [];
    for (const team of sim.teams) {
      if (!flagCodeForSlug(team.slug)) missing.push(team.slug);
    }
    expect(missing).toEqual([]);
  });

  it('exposes 48 entries — one per tournament slot', () => {
    expect(Object.keys(FLAG_CODE_BY_SLUG)).toHaveLength(48);
  });

  it('every code corresponds to an SVG shipped by flag-icons', () => {
    if (!existsSync(FLAG_ICONS_DIR)) {
      // node_modules might be pruned in CI; do not fail on environment-only gaps.
      return;
    }
    for (const [slug, code] of Object.entries(FLAG_CODE_BY_SLUG)) {
      const svg = path.join(FLAG_ICONS_DIR, `${code}.svg`);
      expect(existsSync(svg), `${slug} → ${code}.svg missing in flag-icons package`).toBe(true);
    }
  });
});

describe('flag code map — sanity', () => {
  it('all codes are lowercase and contain only letters or hyphens', () => {
    for (const code of Object.values(FLAG_CODE_BY_SLUG)) {
      expect(code).toMatch(/^[a-z-]+$/);
    }
  });

  it('no duplicate codes (each team gets its own flag asset)', () => {
    const codes = Object.values(FLAG_CODE_BY_SLUG);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('UK home nations use ISO 3166-2 subdivision codes', () => {
    expect(FLAG_CODE_BY_SLUG.england).toBe('gb-eng');
    expect(FLAG_CODE_BY_SLUG.scotland).toBe('gb-sct');
  });
});

// Defence in depth — the runner that emits tournament-sim.json hard-errors
// if a roster slug is missing a flag code, but rerun discipline can drift.
// Make sure the committed JSON only uses codes that are still in the map.
describe('committed JSON ↔ flag code map', () => {
  it('every iso2 value in tournament-sim.json is in FLAG_CODE_BY_SLUG values', () => {
    const sim = getTournamentSim();
    const known = new Set(Object.values(FLAG_CODE_BY_SLUG));
    for (const team of sim.teams) {
      expect(known.has(team.iso2)).toBe(true);
    }
  });
});

