import type {
  PredictionRunInsert,
  PredictionRunRow,
  PredictionScorelineInsert,
  PredictionScorelineRow,
  RunTypeRow,
} from './types';

/**
 * Append-only persistence interface for prediction_runs and the dependent
 * prediction_scorelines table.
 *
 * **No update methods exist on this interface, by design.** The append-only
 * rule is encoded in the API surface itself, not just in the SQL constraints.
 * The DB unique constraint
 *   UNIQUE (fixture_id, run_type, model_version, scheduled_for)
 * makes scheduler retries safe: a second insert with the same key is a no-op
 * at the row level.
 */
export interface PredictionRepository {
  insertPredictionRun(
    insert: PredictionRunInsert,
  ): Promise<PredictionRunRow>;

  /** Bulk insert the scorelines for a single prediction run. */
  insertPredictionScorelines(
    rows: readonly PredictionScorelineInsert[],
  ): Promise<readonly PredictionScorelineRow[]>;

  getPredictionRunById(id: string): Promise<PredictionRunRow | null>;

  /**
   * Return the most recently `executed_at` row for a (fixture_id, run_type).
   * Null when no run exists.
   */
  getLatestPredictionForFixture(
    fixtureId: string,
    runType: RunTypeRow,
  ): Promise<PredictionRunRow | null>;

  /**
   * Full append-only history for a fixture, ordered by `executed_at` ascending.
   */
  listPredictionHistoryForFixture(
    fixtureId: string,
  ): Promise<readonly PredictionRunRow[]>;

  listScorelinesForRun(
    predictionRunId: string,
  ): Promise<readonly PredictionScorelineRow[]>;
}

/**
 * Thrown when an insert violates the idempotency unique constraint
 * (fixture_id, run_type, model_version, scheduled_for). The scheduler treats
 * this as a no-op — the existing row already represents this lifecycle event.
 */
export class DuplicatePredictionRunError extends Error {
  readonly key: {
    fixtureId: string;
    runType: RunTypeRow;
    modelVersion: string;
    scheduledFor: string;
  };
  constructor(key: DuplicatePredictionRunError['key']) {
    super(
      `Duplicate prediction run: fixture=${key.fixtureId} runType=${key.runType} version=${key.modelVersion} scheduledFor=${key.scheduledFor}`,
    );
    this.name = 'DuplicatePredictionRunError';
    this.key = key;
    Object.setPrototypeOf(this, DuplicatePredictionRunError.prototype);
  }
}

// =============================================================================
// InMemoryPredictionRepository — for tests and local development.
// =============================================================================

let inMemoryIdCounter = 0;
function nextId(): string {
  inMemoryIdCounter += 1;
  return `mem-${inMemoryIdCounter.toString(36)}`;
}

export class InMemoryPredictionRepository implements PredictionRepository {
  private readonly runs = new Map<string, PredictionRunRow>();
  private readonly scorelines: PredictionScorelineRow[] = [];

  async insertPredictionRun(
    insert: PredictionRunInsert,
  ): Promise<PredictionRunRow> {
    // Idempotency: reject duplicates per (fixture_id, run_type, model_version,
    // scheduled_for). Mirrors the DB unique constraint.
    for (const row of this.runs.values()) {
      if (
        row.fixture_id === insert.fixture_id &&
        row.run_type === insert.run_type &&
        row.model_version === insert.model_version &&
        row.scheduled_for === insert.scheduled_for
      ) {
        throw new DuplicatePredictionRunError({
          fixtureId: insert.fixture_id,
          runType: insert.run_type,
          modelVersion: insert.model_version,
          scheduledFor: insert.scheduled_for,
        });
      }
    }

    // Marginals sanity check mirroring the SQL CHECK constraint.
    const sum =
      insert.team_a_win_probability +
      insert.draw_probability +
      insert.team_b_win_probability;
    if (Math.abs(sum - 1) >= 0.001) {
      throw new Error(
        `marginals do not sum to 1 (got ${sum}); refusing to insert`,
      );
    }

    const row: PredictionRunRow = {
      id: insert.id ?? nextId(),
      fixture_id: insert.fixture_id,
      run_type: insert.run_type,
      model_version: insert.model_version,
      scheduled_for: insert.scheduled_for,
      executed_at: insert.executed_at,
      data_snapshot_id: insert.data_snapshot_id,
      team_a_win_probability: insert.team_a_win_probability,
      draw_probability: insert.draw_probability,
      team_b_win_probability: insert.team_b_win_probability,
      team_a_expected_goals: insert.team_a_expected_goals,
      team_b_expected_goals: insert.team_b_expected_goals,
      confidence_score: insert.confidence_score,
      confidence_band: insert.confidence_band,
      warnings: [...insert.warnings],
      created_at: new Date().toISOString(),
    };
    this.runs.set(row.id, row);
    return row;
  }

  async insertPredictionScorelines(
    rows: readonly PredictionScorelineInsert[],
  ): Promise<readonly PredictionScorelineRow[]> {
    const inserted: PredictionScorelineRow[] = [];
    for (const r of rows) {
      const persisted: PredictionScorelineRow = {
        id: r.id ?? nextId(),
        prediction_run_id: r.prediction_run_id,
        team_a_goals: r.team_a_goals,
        team_b_goals: r.team_b_goals,
        probability: r.probability,
        rank: r.rank,
        created_at: new Date().toISOString(),
      };
      this.scorelines.push(persisted);
      inserted.push(persisted);
    }
    return inserted;
  }

  async getPredictionRunById(id: string): Promise<PredictionRunRow | null> {
    return this.runs.get(id) ?? null;
  }

  async getLatestPredictionForFixture(
    fixtureId: string,
    runType: RunTypeRow,
  ): Promise<PredictionRunRow | null> {
    let latest: PredictionRunRow | null = null;
    for (const row of this.runs.values()) {
      if (row.fixture_id !== fixtureId || row.run_type !== runType) continue;
      if (latest == null || row.executed_at > latest.executed_at) {
        latest = row;
      }
    }
    return latest;
  }

  async listPredictionHistoryForFixture(
    fixtureId: string,
  ): Promise<readonly PredictionRunRow[]> {
    return [...this.runs.values()]
      .filter((r) => r.fixture_id === fixtureId)
      .sort((a, b) => a.executed_at.localeCompare(b.executed_at));
  }

  async listScorelinesForRun(
    predictionRunId: string,
  ): Promise<readonly PredictionScorelineRow[]> {
    return this.scorelines
      .filter((s) => s.prediction_run_id === predictionRunId)
      .sort((a, b) => a.rank - b.rank);
  }
}
