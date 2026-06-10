import { MODEL_VERSION } from '@/lib/model';
import type { Fixture } from '@/lib/types';
import type { PredictionRunRow } from '@/lib/data';
import { getDuePredictionRuns } from './dueRuns';
import {
  executePredictionRun,
  type ExecuteDeps,
  type ExecuteResult,
} from './executePredictionRun';

export type RunSchedulerParams = {
  now: Date;
  fixtures: readonly Fixture[];
  existingRuns: readonly PredictionRunRow[];
  modelVersion?: string;
  monteCarloIterations?: number;
};

export type RunSchedulerResult = {
  due: number;
  succeeded: number;
  skipped: number;
  failed: number;
  warnings: string[];
  results: ExecuteResult[];
};

/**
 * Top-level scheduler entry point. Determines what's due at `now` and runs
 * each candidate sequentially through executePredictionRun. The cron route is
 * a thin wrapper that supplies the dependencies and returns this result.
 */
export async function runScheduler(
  params: RunSchedulerParams,
  deps: ExecuteDeps,
): Promise<RunSchedulerResult> {
  const modelVersion = params.modelVersion ?? MODEL_VERSION;
  const { due, warnings } = getDuePredictionRuns({
    now: params.now,
    fixtures: params.fixtures,
    existingRuns: params.existingRuns,
    modelVersion,
  });

  const results: ExecuteResult[] = [];
  let succeeded = 0;
  let skipped = 0;
  let failed = 0;

  for (const candidate of due) {
    const result = await executePredictionRun(candidate, {
      ...deps,
      modelVersion,
      monteCarloIterations:
        params.monteCarloIterations ?? deps.monteCarloIterations,
    });
    results.push(result);
    if (result.status === 'SUCCEEDED') succeeded++;
    else if (result.status === 'SKIPPED') skipped++;
    else failed++;
  }

  return {
    due: due.length,
    succeeded,
    skipped,
    failed,
    warnings,
    results,
  };
}
