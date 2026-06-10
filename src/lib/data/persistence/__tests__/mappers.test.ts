import { describe, expect, it } from 'vitest';
import { mockFixtures, mockTeams } from '@/mock';
import { predictMatch } from '@/lib/model';
import { mockTeamStats } from '@/mock/stats';
import type { PredictionInput, PredictionOutput } from '@/lib/types';
import {
  dataSnapshotToInsert,
  fixtureToInsert,
  predictionOutputToRunInsert,
  teamToInsert,
  topScorelinesToRows,
} from '../mappers';

function makeInput(): PredictionInput {
  const f = mockFixtures[0];
  return {
    fixture: {
      id: f.id,
      teamAId: f.teamAId,
      teamBId: f.teamBId,
      kickoffUtc: f.kickoffUtc,
      isHomeForTeamA: f.venue.isHomeForTeamA,
      isHomeForTeamB: f.venue.isHomeForTeamB,
      altitudeMeters: f.venue.altitudeMeters,
      restDaysTeamA: f.restDaysTeamA,
      restDaysTeamB: f.restDaysTeamB,
    },
    statsTeamA: mockTeamStats[f.teamAId],
    statsTeamB: mockTeamStats[f.teamBId],
    runType: 'T_MINUS_3H',
    modelVersion: 'v0.1.0',
    rngSeed: 99,
  };
}

describe('teamToInsert', () => {
  it('maps camelCase Team fields to snake_case TeamInsert', () => {
    const row = teamToInsert(mockTeams[0], false);
    expect(row.id).toBe(mockTeams[0].id);
    expect(row.code).toBe(mockTeams[0].code);
    expect(row.region).toBe(mockTeams[0].region);
    expect(row.is_host_nation).toBe(false);
  });
});

describe('fixtureToInsert', () => {
  it('maps every nested venue field into flat snake_case columns', () => {
    const row = fixtureToInsert(mockFixtures[0]);
    expect(row.team_a_id).toBe(mockFixtures[0].teamAId);
    expect(row.team_b_id).toBe(mockFixtures[0].teamBId);
    expect(row.kickoff_utc).toBe(mockFixtures[0].kickoffUtc);
    expect(row.venue_name).toBe(mockFixtures[0].venue.venueName);
    expect(row.venue_country).toBe(mockFixtures[0].venue.venueCountry);
    expect(row.venue_altitude_meters).toBe(
      mockFixtures[0].venue.altitudeMeters,
    );
    expect(row.is_home_for_team_a).toBe(false);
    expect(row.is_home_for_team_b).toBe(false);
    expect(row.rest_days_team_a).toBe(mockFixtures[0].restDaysTeamA);
  });
});

describe('dataSnapshotToInsert', () => {
  it('maps the DataSnapshot domain object', () => {
    const row = dataSnapshotToInsert(
      {
        id: 'snap-1',
        capturedAt: '2026-06-11T17:00:00Z',
        inputsHash: 'h1',
        providers: ['mock'],
      },
      'fixture-001',
      { foo: 'bar' },
    );
    expect(row.id).toBe('snap-1');
    expect(row.fixture_id).toBe('fixture-001');
    expect(row.input_hash).toBe('h1');
    expect(row.source_ids).toEqual(['mock']);
    expect(row.payload).toEqual({ foo: 'bar' });
  });
});

describe('predictionOutputToRunInsert', () => {
  it('produces an insert row from a real engine output', () => {
    const out = predictMatch(makeInput(), { iterations: 1000 });
    const row = predictionOutputToRunInsert(out, {
      fixtureId: 'fixture-001',
      runType: 'T_MINUS_3H',
      scheduledFor: '2026-06-11T17:00:00Z',
      executedAt: '2026-06-11T17:00:05Z',
      dataSnapshotId: 'snap-1',
    });

    expect(row.fixture_id).toBe('fixture-001');
    expect(row.run_type).toBe('T_MINUS_3H');
    expect(row.model_version).toBe(out.modelVersion);
    expect(row.scheduled_for).toBe('2026-06-11T17:00:00Z');
    expect(row.data_snapshot_id).toBe('snap-1');
    expect(row.team_a_win_probability).toBeCloseTo(out.teamAWinProbability, 6);
    expect(row.draw_probability).toBeCloseTo(out.drawProbability, 6);
    expect(row.team_b_win_probability).toBeCloseTo(out.teamBWinProbability, 6);
    expect(row.confidence_band).toBe(out.confidenceBand);
    expect(Array.isArray(row.warnings)).toBe(true);
  });

  it('clamps probabilities into [0, 1] defensively', () => {
    const hostile: PredictionOutput = {
      teamAWinProbability: -0.3,
      drawProbability: 0.4,
      teamBWinProbability: 1.2,
      teamAExpectedGoals: -1,
      teamBExpectedGoals: 0.5,
      topScorelines: [],
      confidenceScore: 1.5,
      confidenceBand: 'HIGH',
      warnings: [],
      modelVersion: 'v0.1.0',
    };
    const row = predictionOutputToRunInsert(hostile, {
      fixtureId: 'f',
      runType: 'T_ZERO',
      scheduledFor: '2026-06-11T20:00:00Z',
      executedAt: '2026-06-11T20:00:01Z',
      dataSnapshotId: 's',
    });
    expect(row.team_a_win_probability).toBe(0);
    expect(row.team_b_win_probability).toBe(1);
    expect(row.team_a_expected_goals).toBe(0);
    expect(row.confidence_score).toBe(1);
  });

  it('rejects unknown run_type values', () => {
    const out = predictMatch(makeInput(), { iterations: 500 });
    expect(() =>
      predictionOutputToRunInsert(out, {
        fixtureId: 'f',
        runType: 'BOGUS' as never,
        scheduledFor: 't',
        executedAt: 't',
        dataSnapshotId: 's',
      }),
    ).toThrow(/run_type/);
  });

  it('rejects unknown confidence_band values', () => {
    const bad: PredictionOutput = {
      teamAWinProbability: 0.4,
      drawProbability: 0.3,
      teamBWinProbability: 0.3,
      teamAExpectedGoals: 1.2,
      teamBExpectedGoals: 1.0,
      topScorelines: [],
      confidenceScore: 0.5,
      confidenceBand: 'NUCLEAR' as never,
      warnings: [],
      modelVersion: 'v0.1.0',
    };
    expect(() =>
      predictionOutputToRunInsert(bad, {
        fixtureId: 'f',
        runType: 'T_ZERO',
        scheduledFor: 't',
        executedAt: 't',
        dataSnapshotId: 's',
      }),
    ).toThrow(/confidence_band/);
  });
});

describe('topScorelinesToRows', () => {
  it('assigns rank 1..N in the engine-returned order', () => {
    const rows = topScorelinesToRows('run-1', [
      { teamAGoals: 2, teamBGoals: 1, probability: 0.12 },
      { teamAGoals: 1, teamBGoals: 1, probability: 0.10 },
      { teamAGoals: 1, teamBGoals: 0, probability: 0.09 },
    ]);
    expect(rows).toHaveLength(3);
    expect(rows[0].rank).toBe(1);
    expect(rows[1].rank).toBe(2);
    expect(rows[2].rank).toBe(3);
    expect(rows.every((r) => r.prediction_run_id === 'run-1')).toBe(true);
  });

  it('clamps probabilities and floors goal counts', () => {
    const rows = topScorelinesToRows('run-1', [
      { teamAGoals: 2.7, teamBGoals: -1, probability: 1.4 },
    ]);
    expect(rows[0].team_a_goals).toBe(2);
    expect(rows[0].team_b_goals).toBe(0);
    expect(rows[0].probability).toBe(1);
  });
});
