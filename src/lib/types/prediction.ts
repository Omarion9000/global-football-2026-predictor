import type { FixtureId } from './fixture';
import type { TeamId } from './team';
import type { TeamStats } from './stats';

/**
 * Canonical prediction run types. Exactly five values, per CLAUDE.md and
 * docs/03_MODEL_SPEC.md §7. No other value is permitted.
 */
export type PredictionRunType =
  | 'T_MINUS_3H'
  | 'T_MINUS_1H'
  | 'T_ZERO'
  | 'HT'
  | 'FT';

export const PREDICTION_RUN_TYPES: readonly PredictionRunType[] = [
  'T_MINUS_3H',
  'T_MINUS_1H',
  'T_ZERO',
  'HT',
  'FT',
] as const;

export type ConfidenceBand = 'LOW' | 'MEDIUM' | 'HIGH';

export type ScorelineProbability = {
  teamAGoals: number;
  teamBGoals: number;
  /** Probability in [0, 1]. */
  probability: number;
};

/**
 * Opaque pointer to the inputs used for a run. The snapshot body itself is
 * internal and not redistributed per docs/04_DATA_AND_LEGAL_POLICY.md §4.5.
 */
export type DataSnapshot = {
  id: string;
  /** ISO-8601 timestamp when the snapshot was captured. */
  capturedAt: string;
  /** Stable hash over the engine inputs used. */
  inputsHash: string;
  /** Provider keys present in this snapshot. Always ["mock"] in V1. */
  providers: string[];
};

/**
 * Single typed input to the engine. The scheduler builds this and hands it to
 * predictMatch() in Phase 3. The engine performs no I/O; everything it needs
 * is here.
 */
export type PredictionInput = {
  fixture: {
    id: FixtureId;
    teamAId: TeamId;
    teamBId: TeamId;
    kickoffUtc: string;
    /** Whether the venue is in teamA's home country. */
    isHomeForTeamA: boolean;
    /** Whether the venue is in teamB's home country. */
    isHomeForTeamB: boolean;
    altitudeMeters: number;
    restDaysTeamA: number;
    restDaysTeamB: number;
  };
  statsTeamA: TeamStats;
  statsTeamB: TeamStats;
  runType: PredictionRunType;
  modelVersion: string;
  /** Seed for the engine's single RNG utility. Same seed + inputs = same output. */
  rngSeed: number;
  /**
   * Optional inputs introduced at later run types. V1 keeps these as presence
   * flags only — full LineupStrength / InPlayState shapes land in Phase 3+
   * once their consumers exist. V2-safe.
   */
  lineupAvailable?: boolean;
  inPlayAvailable?: boolean;
};

/**
 * What the engine returns for a single prediction. The UI renders these
 * directly from persisted rows; it never computes them itself.
 */
export type PredictionOutput = {
  teamAWinProbability: number;
  drawProbability: number;
  teamBWinProbability: number;
  teamAExpectedGoals: number;
  teamBExpectedGoals: number;
  /** Top-N most likely scorelines. Default N=5 in Phase 3. */
  topScorelines: ScorelineProbability[];
  /** Quality-of-information signal in [0, 1]; see docs/03_MODEL_SPEC.md §9. */
  confidenceScore: number;
  /** Three-band rendering of confidenceScore for UI display. */
  confidenceBand: ConfidenceBand;
  /**
   * Engine-emitted advisory messages (e.g. Monte Carlo / analytic disagreement,
   * low-information inputs). The engine never logs; the scheduler is
   * responsible for writing these to model_runs.
   */
  warnings: string[];
  modelVersion: string;
};

/**
 * Append-only row stored in the predictions table. The canonical primary key
 * is (fixtureId, runType, modelVersion, scheduledFor) — see CLAUDE.md.
 */
export type PredictionRun = {
  id: string;
  fixtureId: FixtureId;
  runType: PredictionRunType;
  modelVersion: string;
  /** Canonical lifecycle timestamp derived from kickoff. ISO-8601. */
  scheduledFor: string;
  /** Actual run time. ISO-8601. */
  executedAt: string;
  dataSnapshot: DataSnapshot;
  output: PredictionOutput;
};
