import type { Fixture, PredictionRunType } from '@/lib/types';
import { PREDICTION_RUN_TYPES } from '@/lib/types';
import type { PredictionRunRow } from '@/lib/data';
import { getScheduledFor } from './scheduleWindows';

export type DuePredictionRunCandidate = {
  fixtureId: string;
  runType: PredictionRunType;
  /** Canonical lifecycle ISO timestamp. */
  scheduledFor: string;
  modelVersion: string;
};

export type GetDuePredictionRunsParams = {
  now: Date;
  fixtures: readonly Fixture[];
  existingRuns: readonly PredictionRunRow[];
  modelVersion: string;
};

export type GetDuePredictionRunsResult = {
  due: DuePredictionRunCandidate[];
  warnings: string[];
};

function dedupKey(
  fixtureId: string,
  runType: PredictionRunType,
  modelVersion: string,
  scheduledFor: string,
): string {
  return `${fixtureId}|${runType}|${modelVersion}|${scheduledFor}`;
}

/**
 * Return the set of prediction-run candidates that:
 *   - have crossed their canonical lifecycle timestamp at `now`, and
 *   - are not already present in `existingRuns` under the same
 *     (fixture_id, run_type, model_version, scheduled_for) key.
 *
 * HT requires fixture.status === 'HALF_TIME' once the nominal HT timestamp has
 * passed; if the timestamp has passed but the status hasn't moved, a warning
 * is added and the candidate is skipped (live data not yet wired up).
 *
 * FT requires fixture.status === 'FULL_TIME'; missing status is silent because
 * full-time confirmation is expected to lag.
 */
export function getDuePredictionRuns(
  params: GetDuePredictionRunsParams,
): GetDuePredictionRunsResult {
  const due: DuePredictionRunCandidate[] = [];
  const warnings: string[] = [];
  const now = params.now.getTime();

  const existing = new Set(
    params.existingRuns.map((r) =>
      dedupKey(r.fixture_id, r.run_type, r.model_version, r.scheduled_for),
    ),
  );

  for (const fixture of params.fixtures) {
    for (const runType of PREDICTION_RUN_TYPES) {
      const scheduledFor = getScheduledFor(fixture.kickoffUtc, runType);
      const scheduledMs = Date.parse(scheduledFor);
      if (now < scheduledMs) continue;

      if (existing.has(
        dedupKey(fixture.id, runType, params.modelVersion, scheduledFor),
      )) {
        continue;
      }

      if (runType === 'HT') {
        if (fixture.status !== 'HALF_TIME') {
          warnings.push(
            `HT skipped for fixture ${fixture.id}: status is ${fixture.status}, expected HALF_TIME (live data not wired up in mock mode)`,
          );
          continue;
        }
      }

      if (runType === 'FT') {
        if (fixture.status !== 'FULL_TIME') {
          // Silent skip — full-time confirmation legitimately lags
          continue;
        }
      }

      due.push({
        fixtureId: fixture.id,
        runType,
        scheduledFor,
        modelVersion: params.modelVersion,
      });
    }
  }

  return { due, warnings };
}
