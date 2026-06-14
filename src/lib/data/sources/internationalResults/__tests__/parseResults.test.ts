import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseResults, TOP_TIER_TOURNAMENTS } from '../parseResults';

const HERE = resolve(fileURLToPath(import.meta.url), '..');
const SAMPLE_CSV = readFileSync(
  resolve(HERE, 'fixtures/international-sample.csv'),
  'utf-8',
);

// =============================================================================
// Top-tier include-list sanity
// =============================================================================

describe('TOP_TIER_TOURNAMENTS', () => {
  it('contains exactly the 15 approved values, including the Oceania correction', () => {
    expect(TOP_TIER_TOURNAMENTS.length).toBe(15);
    expect(TOP_TIER_TOURNAMENTS).toContain('FIFA World Cup');
    expect(TOP_TIER_TOURNAMENTS).toContain('FIFA World Cup qualification');
    expect(TOP_TIER_TOURNAMENTS).toContain('UEFA Euro');
    expect(TOP_TIER_TOURNAMENTS).toContain('Copa América'); // accent preserved
    expect(TOP_TIER_TOURNAMENTS).toContain('Oceania Nations Cup');
    expect(TOP_TIER_TOURNAMENTS).toContain('Oceania Nations Cup qualification');
    expect(TOP_TIER_TOURNAMENTS).not.toContain('OFC Nations Cup');
  });
});

// =============================================================================
// Happy path against the real 30-row sample
// =============================================================================

describe('parseResults — happy path', () => {
  it('excludes Friendly rows and includes top-tier rows', () => {
    const { matches, rejected } = parseResults(SAMPLE_CSV);
    expect(rejected).toBe(0);
    // The fixture has 5 Friendlies (filtered) + 25 top-tier rows.
    expect(matches.length).toBe(25);
    for (const m of matches) {
      expect(m.tournament).not.toBe('Friendly');
      expect(TOP_TIER_TOURNAMENTS).toContain(m.tournament);
    }
  });

  it('preserves the Copa América accent end-to-end', () => {
    const { matches } = parseResults(SAMPLE_CSV);
    const copa = matches.filter((m) => m.tournament === 'Copa América');
    expect(copa.length).toBeGreaterThan(0);
    expect(copa.every((m) => m.tournament === 'Copa América')).toBe(true);
  });

  it('parses neutral=TRUE / FALSE into booleans', () => {
    const { matches } = parseResults(SAMPLE_CSV);
    const trueRows = matches.filter((m) => m.neutral);
    const falseRows = matches.filter((m) => !m.neutral);
    expect(trueRows.length).toBeGreaterThan(0);
    expect(falseRows.length).toBeGreaterThan(0);
    // Make sure each is actually a boolean type, not a string.
    for (const m of matches) expect(typeof m.neutral).toBe('boolean');
  });

  it('produces ISO date strings and integer goals on every kept row', () => {
    const { matches } = parseResults(SAMPLE_CSV);
    for (const m of matches) {
      expect(m.dateIso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isInteger(m.homeScore)).toBe(true);
      expect(Number.isInteger(m.awayScore)).toBe(true);
      expect(m.homeScore).toBeGreaterThanOrEqual(0);
      expect(m.awayScore).toBeGreaterThanOrEqual(0);
    }
  });
});

// =============================================================================
// Malformed-row rejection
// =============================================================================

describe('parseResults — malformed-row rejection', () => {
  it('rejects rows with an unparseable date but DOES NOT raise', () => {
    const csv = [
      'date,home_team,away_team,home_score,away_score,tournament,city,country,neutral',
      '2024-06-14,Spain,Croatia,3,0,UEFA Euro,Berlin,Germany,TRUE',
      'not-a-date,France,Germany,1,1,UEFA Euro,Munich,Germany,TRUE',
      '2024-06-15,Italy,Albania,2,1,UEFA Euro,Dortmund,Germany,TRUE',
    ].join('\n');
    const { matches, rejected } = parseResults(csv);
    expect(matches.length).toBe(2);
    expect(rejected).toBe(1);
  });

  it('rejects rows with non-integer goals', () => {
    const csv = [
      'date,home_team,away_team,home_score,away_score,tournament,city,country,neutral',
      '2024-06-14,Spain,Croatia,abc,0,UEFA Euro,Berlin,Germany,TRUE',
      '2024-06-15,Italy,Albania,2,1,UEFA Euro,Dortmund,Germany,TRUE',
    ].join('\n');
    const { matches, rejected } = parseResults(csv);
    expect(matches.length).toBe(1);
    expect(rejected).toBe(1);
  });

  it('rejects rows where neutral is neither TRUE nor FALSE', () => {
    const csv = [
      'date,home_team,away_team,home_score,away_score,tournament,city,country,neutral',
      '2024-06-14,Spain,Croatia,3,0,UEFA Euro,Berlin,Germany,maybe',
      '2024-06-15,Italy,Albania,2,1,UEFA Euro,Dortmund,Germany,TRUE',
    ].join('\n');
    const { matches, rejected } = parseResults(csv);
    expect(matches.length).toBe(1);
    expect(rejected).toBe(1);
  });

  it('counts every body row as rejected when the header is missing a required column', () => {
    const csv = [
      // No `country`
      'date,home_team,away_team,home_score,away_score,tournament,city,neutral',
      '2024-06-14,Spain,Croatia,3,0,UEFA Euro,Berlin,TRUE',
      '2024-06-15,Italy,Albania,2,1,UEFA Euro,Dortmund,TRUE',
    ].join('\n');
    const { matches, rejected } = parseResults(csv);
    expect(matches.length).toBe(0);
    expect(rejected).toBe(2);
  });

  it('does NOT count non-top-tier rows as rejected (silently excluded)', () => {
    const csv = [
      'date,home_team,away_team,home_score,away_score,tournament,city,country,neutral',
      '2024-06-14,Spain,Croatia,3,0,UEFA Euro,Berlin,Germany,TRUE',
      '2024-07-01,Germany,France,1,1,Friendly,Lyon,France,FALSE',
      '2024-07-02,Brazil,Chile,2,0,Copa América,Houston,United States,TRUE',
    ].join('\n');
    const { matches, rejected } = parseResults(csv);
    expect(matches.length).toBe(2); // UEFA Euro + Copa América
    expect(rejected).toBe(0); // Friendly is filtered, NOT rejected
  });

  it('handles CRLF line endings', () => {
    const csv =
      'date,home_team,away_team,home_score,away_score,tournament,city,country,neutral\r\n' +
      '2024-06-14,Spain,Croatia,3,0,UEFA Euro,Berlin,Germany,TRUE\r\n';
    const { matches, rejected } = parseResults(csv);
    expect(matches.length).toBe(1);
    expect(rejected).toBe(0);
  });

  it('handles quoted fields with literal commas (e.g. "Washington, D.C.")', () => {
    const csv = [
      'date,home_team,away_team,home_score,away_score,tournament,city,country,neutral',
      '1994-06-19,Norway,Mexico,1,0,FIFA World Cup,"Washington, D.C.",United States,TRUE',
      '1994-06-20,Netherlands,Saudi Arabia,2,1,FIFA World Cup,"Washington, D.C.",United States,TRUE',
    ].join('\n');
    const { matches, rejected } = parseResults(csv);
    expect(rejected).toBe(0);
    expect(matches.length).toBe(2);
    expect(matches[0].city).toBe('Washington, D.C.');
    expect(matches[0].country).toBe('United States');
    expect(matches[0].neutral).toBe(true);
    expect(matches[1].city).toBe('Washington, D.C.');
  });

  it('strips a UTF-8 BOM', () => {
    const csv =
      '﻿date,home_team,away_team,home_score,away_score,tournament,city,country,neutral\n' +
      '2024-06-14,Spain,Croatia,3,0,UEFA Euro,Berlin,Germany,TRUE\n';
    const { matches, rejected } = parseResults(csv);
    expect(matches.length).toBe(1);
    expect(rejected).toBe(0);
  });
});
