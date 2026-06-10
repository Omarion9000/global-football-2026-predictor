import { describe, expect, it } from 'vitest';
import { mockFixtures, mockTeams } from '@/mock';
import { mockTeamStats } from '@/mock/stats';
import {
  InMemoryPredictionRepository,
  InMemorySnapshotRepository,
} from '@/lib/data';
import type { Fixture, TeamStats } from '@/lib/types';
import { executePredictionRun, type ExecuteDeps } from '../executePredictionRun';

const FIXTURE: Fixture = mockFixtures[0];

function buildDeps(overrides: Partial<ExecuteDeps> = {}): ExecuteDeps {
  return {
    getFixture: async (id) => (id === FIXTURE.id ? FIXTURE : null),
    getTeamStats: async (teamId): Promise<TeamStats | null> =>
      mockTeamStats[teamId] ?? null,
    predictionRepository: new InMemoryPredictionRepository(),
    snapshotRepository: new InMemorySnapshotRepository(),
    now: () => new Date('2026-06-11T17:00:05Z'),
    monteCarloIterations: 500,
    ...overrides,
  };
}

describe('executePredictionRun', () => {
  it('SUCCEEDED path persists exactly one prediction run + N scoreline rows', async () => {
    const deps = buildDeps();
    const result = await executePredictionRun(
      {
        fixtureId: FIXTURE.id,
        runType: 'T_MINUS_3H',
        scheduledFor: '2026-06-11T17:00:00.000Z',
        modelVersion: 'v0.1.0',
      },
      deps,
    );
    expect(result.status).toBe('SUCCEEDED');
    if (result.status !== 'SUCCEEDED') return; // narrow

    const history = await deps.predictionRepository.listPredictionHistoryForFixture(
      FIXTURE.id,
    );
    expect(history).toHaveLength(1);
    expect(history[0].run_type).toBe('T_MINUS_3H');
    expect(history[0].scheduled_for).toBe('2026-06-11T17:00:00.000Z');

    const scorelines = await deps.predictionRepository.listScorelinesForRun(
      result.predictionRunId,
    );
    expect(scorelines.length).toBeGreaterThan(0);
    expect(scorelines[0].rank).toBe(1);
  });

  it('SKIPPED when an identical (fixture, run_type, model_version, scheduled_for) row already exists', async () => {
    const deps = buildDeps();
    const candidate = {
      fixtureId: FIXTURE.id,
      runType: 'T_MINUS_3H' as const,
      scheduledFor: '2026-06-11T17:00:00.000Z',
      modelVersion: 'v0.1.0',
    };
    const first = await executePredictionRun(candidate, deps);
    expect(first.status).toBe('SUCCEEDED');
    const second = await executePredictionRun(candidate, deps);
    expect(second.status).toBe('SKIPPED');
  });

  it('FAILED with FIXTURE_NOT_FOUND when the fixture cannot be loaded', async () => {
    const result = await executePredictionRun(
      {
        fixtureId: 'no-such-fixture',
        runType: 'T_MINUS_3H',
        scheduledFor: '2026-06-11T17:00:00.000Z',
        modelVersion: 'v0.1.0',
      },
      buildDeps(),
    );
    expect(result.status).toBe('FAILED');
    if (result.status === 'FAILED') {
      expect(result.errorCode).toBe('FIXTURE_NOT_FOUND');
    }
  });

  it('FAILED with TEAM_STATS_NOT_FOUND when team stats are missing', async () => {
    const result = await executePredictionRun(
      {
        fixtureId: FIXTURE.id,
        runType: 'T_MINUS_3H',
        scheduledFor: '2026-06-11T17:00:00.000Z',
        modelVersion: 'v0.1.0',
      },
      buildDeps({
        getTeamStats: async () => null,
      }),
    );
    expect(result.status).toBe('FAILED');
    if (result.status === 'FAILED') {
      expect(result.errorCode).toBe('TEAM_STATS_NOT_FOUND');
    }
  });

  it('is deterministic across two identical executions on fresh repositories', async () => {
    const a = buildDeps();
    const b = buildDeps();
    const candidate = {
      fixtureId: FIXTURE.id,
      runType: 'T_MINUS_3H' as const,
      scheduledFor: '2026-06-11T17:00:00.000Z',
      modelVersion: 'v0.1.0',
    };
    const r1 = await executePredictionRun(candidate, a);
    const r2 = await executePredictionRun(candidate, b);
    expect(r1.status).toBe('SUCCEEDED');
    expect(r2.status).toBe('SUCCEEDED');

    const histA = await a.predictionRepository.listPredictionHistoryForFixture(
      FIXTURE.id,
    );
    const histB = await b.predictionRepository.listPredictionHistoryForFixture(
      FIXTURE.id,
    );
    expect(histA[0].team_a_win_probability).toBe(
      histB[0].team_a_win_probability,
    );
    expect(histA[0].team_a_expected_goals).toBe(
      histB[0].team_a_expected_goals,
    );
  });

  it('propagates engine warnings into the execute result', async () => {
    // T_MINUS_1H without lineupAvailable should trigger the engine warning.
    const result = await executePredictionRun(
      {
        fixtureId: FIXTURE.id,
        runType: 'T_MINUS_1H',
        scheduledFor: '2026-06-11T19:00:00.000Z',
        modelVersion: 'v0.1.0',
      },
      buildDeps(),
    );
    expect(result.warnings.some((w) => w.includes('lineup'))).toBe(true);
  });

  it('uses every team listed in mock data when stats are present', async () => {
    // Smoke check: every mock team has stats; persistence of a run uses real ids.
    for (const team of mockTeams) {
      const stats = mockTeamStats[team.id];
      expect(stats).toBeDefined();
    }
  });
});
