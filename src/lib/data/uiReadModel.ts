import 'server-only';
import { createPredictionRepository } from './persistence/repositoryFactory';
import type { PredictionRepository } from './persistence/predictionRepository';
import type {
  PredictionRunRow,
  PredictionScorelineRow,
} from './persistence/types';
import {
  getDemoMostRecentPrediction,
  getDemoPredictionsForFixture,
} from './demoPredictions';

// =============================================================================
// UI read model
// =============================================================================
// Thin, server-only data accessor that the public pages call instead of the
// synchronous demo helper directly. The goal is to surface persisted predictions
// from Neon/Postgres when the database has them, while leaving the public
// experience identical to demo mode whenever the database is absent, empty, or
// returns an error.
//
// Catalog (fixtures + teams) stays sourced from the mock module — Phase 7F
// intentionally does NOT add fixture/team repositories. The DB rows seeded by
// Phase 7E exist for FK integrity only.
//
// SAFETY:
//   - `import 'server-only'` raises a build error if pulled into any client bundle.
//   - The ESLint UI boundary blocks `src/components/**` from importing this path.
//   - Errors thrown by the repository are caught and discarded — driver errors
//     can include connection strings, and the demo fallback already covers the
//     no-data case, so silent fallback is the safest contract.
//   - Never writes to stdout/stderr — no logging at all.
// =============================================================================

export type UiPredictionRecord = {
  run: PredictionRunRow;
  scorelines: PredictionScorelineRow[];
};

export type UiReadModelOptions = {
  /** Override the repository (used by tests). Defaults to the factory-built one. */
  predictionRepository?: PredictionRepository;
};

/**
 * Return the most recently executed prediction for `fixtureId`, including its
 * scorelines, sourced from the persisted history. If the database is missing,
 * empty for this fixture, or throws, fall back silently to the demo helper.
 *
 * "Most recent" is defined as `MAX(executed_at)` across all run types — not
 * a fixed `T_ZERO` lookup. This matches the demo helper's behaviour and means
 * the UI naturally advances from T-3h → T-1h → T_ZERO → HT → FT as the cron
 * scheduler lands new rows during a fixture's lifecycle.
 */
export async function loadMostRecentPredictionForFixture(
  fixtureId: string,
  options: UiReadModelOptions = {},
): Promise<UiPredictionRecord | null> {
  try {
    const repo = options.predictionRepository ?? createPredictionRepository();
    const history = await repo.listPredictionHistoryForFixture(fixtureId);
    if (history.length > 0) {
      // History is ordered ASC by executed_at, but pick max explicitly so
      // future repository implementations cannot regress this invariant.
      let recent = history[0];
      for (const row of history) {
        if (row.executed_at > recent.executed_at) recent = row;
      }
      const scorelines = await repo.listScorelinesForRun(recent.id);
      // Defensive: copy + sort by rank ASC. Mirrors the existing demo shape
      // so MatchDetailPage doesn't need to know which backend produced this.
      const ordered = [...scorelines].sort((a, b) => a.rank - b.rank);
      return { run: recent, scorelines: ordered };
    }
  } catch {
    // Silent fallback. Repository errors are not logged — they may contain
    // driver internals (host, port, credentials) and the demo path already
    // covers the no-data case. Tests assert no console output here.
  }
  return getDemoMostRecentPrediction(fixtureId);
}

/**
 * Return the full append-only prediction history for `fixtureId`, ordered ASC
 * by `executed_at`. Used by the match-detail page's prediction-timeline strip.
 * Same fallback contract as the single-prediction reader.
 */
export async function loadPredictionHistoryForFixture(
  fixtureId: string,
  options: UiReadModelOptions = {},
): Promise<readonly PredictionRunRow[]> {
  try {
    const repo = options.predictionRepository ?? createPredictionRepository();
    const history = await repo.listPredictionHistoryForFixture(fixtureId);
    if (history.length > 0) return history;
  } catch {
    // Silent fallback — same rationale as above.
  }
  return getDemoPredictionsForFixture(fixtureId);
}
