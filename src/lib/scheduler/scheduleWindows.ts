import type { PredictionRunType } from '@/lib/types';

const MINUTES_MS = 60 * 1000;
const HOURS_MS = 60 * MINUTES_MS;

/**
 * Canonical lifecycle offsets relative to kickoff. The scheduler always uses
 * these for `scheduled_for` so retries collapse onto the same DB row via the
 * unique constraint on (fixture_id, run_type, model_version, scheduled_for).
 *
 *  - T_MINUS_3H : kickoff − 3 h
 *  - T_MINUS_1H : kickoff − 1 h
 *  - T_ZERO     : kickoff
 *  - HT         : nominal kickoff + 45 min — the run is only *due* once the
 *                 fixture status confirms HALF_TIME (see dueRuns.ts)
 *  - FT         : nominal kickoff + 110 min (90 + ET buffer) — the run is only
 *                 *due* once the fixture status confirms FULL_TIME
 */
const OFFSET_MS: Record<PredictionRunType, number> = {
  T_MINUS_3H: -3 * HOURS_MS,
  T_MINUS_1H: -1 * HOURS_MS,
  T_ZERO: 0,
  HT: 45 * MINUTES_MS,
  FT: 110 * MINUTES_MS,
};

export function getScheduledFor(
  kickoffUtc: string,
  runType: PredictionRunType,
): string {
  const kickoff = Date.parse(kickoffUtc);
  if (!Number.isFinite(kickoff)) {
    throw new Error(`getScheduledFor: invalid kickoff "${kickoffUtc}"`);
  }
  return new Date(kickoff + OFFSET_MS[runType]).toISOString();
}
