import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseDate,
  parseHistoricalCsv,
  type HistoricalMatch,
} from '../parseHistoricalCsv';

// =============================================================================
// Real sample fixture: 30 rows from the football-data.co.uk E0 2024-25 file
// (Aug 16 → opening weekends). This anchors the parser against the exact wire
// shape it must handle in production; synthetic CSV strings inline below cover
// the edge cases not present in the live sample (2-digit dates, PS fallback,
// malformed rows).
// =============================================================================

const HERE = resolve(fileURLToPath(import.meta.url), '..');
const SAMPLE_CSV = readFileSync(
  resolve(HERE, 'fixtures/E0-2024-25-sample.csv'),
  'utf-8',
);

describe('parseHistoricalCsv — happy path against real fixture', () => {
  it('parses every data row in the 30-row 2024-25 sample', () => {
    const result = parseHistoricalCsv(SAMPLE_CSV, '2024-25');
    expect(result.matches.length).toBe(30);
    expect(result.rejected).toBe(0);
  });

  it('produces a `HistoricalMatch` with all required fields on every row', () => {
    const result = parseHistoricalCsv(SAMPLE_CSV, '2024-25');
    for (const m of result.matches) {
      expect(m.season).toBe('2024-25');
      expect(m.dateIso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(m.homeTeam.length).toBeGreaterThan(0);
      expect(m.awayTeam.length).toBeGreaterThan(0);
      expect(Number.isInteger(m.homeGoals)).toBe(true);
      expect(Number.isInteger(m.awayGoals)).toBe(true);
      expect(m.homeGoals).toBeGreaterThanOrEqual(0);
      expect(m.awayGoals).toBeGreaterThanOrEqual(0);
    }
  });

  it('attaches Bet365 odds to the first match (real data)', () => {
    const result = parseHistoricalCsv(SAMPLE_CSV, '2024-25');
    const m = result.matches[0];
    // Spot-check against the known wire shape: Man United v Fulham, 16/08/2024,
    // B365H=1.6, B365D=4.2, B365A=5.25.
    expect(m.homeTeam).toBe('Man United');
    expect(m.awayTeam).toBe('Fulham');
    expect(m.dateIso).toBe('2024-08-16');
    expect(m.homeGoals).toBe(1);
    expect(m.awayGoals).toBe(0);
    expect(m.odds).toBeDefined();
    expect(m.odds!.home).toBeCloseTo(1.6, 4);
    expect(m.odds!.draw).toBeCloseTo(4.2, 4);
    expect(m.odds!.away).toBeCloseTo(5.25, 4);
  });
});

// =============================================================================
// Chronological ordering — the source file is already chronological, so the
// parser preserves the input order. Build-history layers a date-sort on top.
// =============================================================================

describe('parseHistoricalCsv — chronological ordering', () => {
  it('preserves the source CSV order (which is chronological)', () => {
    const result = parseHistoricalCsv(SAMPLE_CSV, '2024-25');
    for (let i = 1; i < result.matches.length; i += 1) {
      const prev = result.matches[i - 1].dateIso;
      const curr = result.matches[i].dateIso;
      expect(curr >= prev).toBe(true);
    }
  });
});

// =============================================================================
// Both date formats — DD/MM/YY (older archive seasons) and DD/MM/YYYY (current).
// =============================================================================

describe('parseHistoricalCsv — date format handling', () => {
  it('parses DD/MM/YYYY into ISO YYYY-MM-DD', () => {
    expect(parseDate('16/08/2024')).toBe('2024-08-16');
    expect(parseDate('1/1/2000')).toBe('2000-01-01');
  });

  it('expands DD/MM/YY using <70 → 2000+, ≥70 → 1900+', () => {
    expect(parseDate('16/08/24')).toBe('2024-08-16');
    expect(parseDate('01/01/00')).toBe('2000-01-01');
    expect(parseDate('31/12/69')).toBe('2069-12-31');
    expect(parseDate('01/01/70')).toBe('1970-01-01');
    expect(parseDate('15/06/99')).toBe('1999-06-15');
  });

  it('returns null on malformed dates', () => {
    expect(parseDate('')).toBeNull();
    expect(parseDate('not-a-date')).toBeNull();
    expect(parseDate('2024-08-16')).toBeNull(); // already-ISO is NOT the input shape
    expect(parseDate('99/99/2024')).toBeNull();
  });

  it('round-trips DD/MM/YY data through the CSV parser', () => {
    const csv = [
      'Date,HomeTeam,AwayTeam,FTHG,FTAG',
      '08/08/15,Bournemouth,Aston Villa,0,1',
      '08/08/15,Chelsea,Swansea,2,2',
    ].join('\n');
    const result = parseHistoricalCsv(csv, '2015-16');
    expect(result.matches.length).toBe(2);
    expect(result.rejected).toBe(0);
    expect(result.matches[0].dateIso).toBe('2015-08-08');
    expect(result.matches[1].dateIso).toBe('2015-08-08');
  });
});

// =============================================================================
// Odds fallback — PS columns when B365 columns are missing.
// =============================================================================

describe('parseHistoricalCsv — odds fallback', () => {
  it('uses Bet365 odds when both column sets are present', () => {
    const csv = [
      'Date,HomeTeam,AwayTeam,FTHG,FTAG,B365H,B365D,B365A,PSH,PSD,PSA',
      '16/08/2024,Foo,Bar,1,0,1.6,4.2,5.25,1.7,4.5,5.6',
    ].join('\n');
    const result = parseHistoricalCsv(csv, '2024-25');
    expect(result.matches[0].odds).toEqual({
      home: 1.6,
      draw: 4.2,
      away: 5.25,
    });
  });

  it('falls back to PS odds when Bet365 columns are missing entirely', () => {
    const csv = [
      'Date,HomeTeam,AwayTeam,FTHG,FTAG,PSH,PSD,PSA',
      '16/08/2024,Foo,Bar,1,0,1.7,4.5,5.6',
    ].join('\n');
    const result = parseHistoricalCsv(csv, '2024-25');
    expect(result.matches[0].odds).toEqual({
      home: 1.7,
      draw: 4.5,
      away: 5.6,
    });
  });

  it('falls back to PS odds when Bet365 cells are empty', () => {
    const csv = [
      'Date,HomeTeam,AwayTeam,FTHG,FTAG,B365H,B365D,B365A,PSH,PSD,PSA',
      '16/08/2024,Foo,Bar,1,0,,,,1.7,4.5,5.6',
    ].join('\n');
    const result = parseHistoricalCsv(csv, '2024-25');
    expect(result.matches[0].odds).toEqual({
      home: 1.7,
      draw: 4.5,
      away: 5.6,
    });
  });

  it('returns no odds when neither column set is parseable', () => {
    const csv = [
      'Date,HomeTeam,AwayTeam,FTHG,FTAG,B365H,B365D,B365A,PSH,PSD,PSA',
      '16/08/2024,Foo,Bar,1,0,,,,,,,',
    ].join('\n');
    const result = parseHistoricalCsv(csv, '2024-25');
    expect(result.matches[0].odds).toBeUndefined();
  });

  it('still records the match without odds (odds are optional)', () => {
    const csv = [
      'Date,HomeTeam,AwayTeam,FTHG,FTAG',
      '16/08/2024,Foo,Bar,1,0',
    ].join('\n');
    const result = parseHistoricalCsv(csv, '2024-25');
    expect(result.matches.length).toBe(1);
    expect(result.matches[0].odds).toBeUndefined();
    expect(result.rejected).toBe(0);
  });
});

// =============================================================================
// Malformed-row rejection — bad rows must be counted, not raised.
// =============================================================================

describe('parseHistoricalCsv — malformed-row rejection', () => {
  it('rejects rows with an unparseable date', () => {
    const csv = [
      'Date,HomeTeam,AwayTeam,FTHG,FTAG',
      '16/08/2024,Foo,Bar,1,0',
      'not-a-date,Foo,Bar,1,0',
      '17/08/2024,Baz,Qux,2,2',
    ].join('\n');
    const result = parseHistoricalCsv(csv, '2024-25');
    expect(result.matches.length).toBe(2);
    expect(result.rejected).toBe(1);
  });

  it('rejects rows with empty teams or non-integer goals', () => {
    const csv = [
      'Date,HomeTeam,AwayTeam,FTHG,FTAG',
      '16/08/2024,,Bar,1,0',
      '16/08/2024,Foo,Bar,abc,0',
      '16/08/2024,Foo,Bar,1,0',
    ].join('\n');
    const result = parseHistoricalCsv(csv, '2024-25');
    expect(result.matches.length).toBe(1);
    expect(result.rejected).toBe(2);
  });

  it('counts every body row as rejected when the header is missing a required column', () => {
    const csv = [
      'Date,HomeTeam,AwayTeam,FTHG', // missing FTAG
      '16/08/2024,Foo,Bar,1,0',
      '17/08/2024,Baz,Qux,2,2',
    ].join('\n');
    const result = parseHistoricalCsv(csv, '2024-25');
    expect(result.matches.length).toBe(0);
    expect(result.rejected).toBe(2);
  });

  it('strips a UTF-8 BOM from the start of the CSV', () => {
    const csv =
      '﻿Date,HomeTeam,AwayTeam,FTHG,FTAG\n16/08/2024,Foo,Bar,1,0';
    const result = parseHistoricalCsv(csv, '2024-25');
    expect(result.matches.length).toBe(1);
    expect(result.rejected).toBe(0);
  });

  it('handles CRLF line endings', () => {
    const csv =
      'Date,HomeTeam,AwayTeam,FTHG,FTAG\r\n16/08/2024,Foo,Bar,1,0\r\n17/08/2024,Baz,Qux,2,2\r\n';
    const result = parseHistoricalCsv(csv, '2024-25');
    expect(result.matches.length).toBe(2);
    expect(result.rejected).toBe(0);
  });
});

// =============================================================================
// Output stability sanity — every match carries the caller-supplied season.
// =============================================================================

describe('parseHistoricalCsv — season tagging', () => {
  it('stamps every produced match with the caller-supplied season label', () => {
    const result = parseHistoricalCsv(SAMPLE_CSV, '2024-25');
    const distinct = new Set(result.matches.map((m: HistoricalMatch) => m.season));
    expect([...distinct]).toEqual(['2024-25']);
  });
});
