import { NextResponse } from 'next/server';
import { MODEL_VERSION } from '@/lib/model';
import {
  MockFixtureSource,
  createPredictionRepository,
  createSnapshotRepository,
} from '@/lib/data';
import { runScheduler } from '@/lib/scheduler';

// Invoked by Vercel Cron on the schedule declared in `vercel.json`.
//
// Repository selection happens through `repositoryFactory.create*Repository()`
// (Phase 7D). The priority order — Neon Postgres → Supabase → in-memory —
// lives in `src/lib/data/persistence/repositoryFactory.ts`, so this route does
// not branch on environment. With `POSTGRES_URL` set in production, writes
// land in Neon; with no DB env vars set, writes land in an in-memory store
// (each invocation gets a fresh instance — fine for demo, no persistence).
//
// Fixtures are still loaded from `MockFixtureSource`. A real `FixtureSource`
// adapter against an external data provider arrives in Phase 7E.
export const dynamic = 'force-dynamic';

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');

  if (!secret || secret.length === 0) {
    // Strict by default: missing secret is treated as misconfigured. The only
    // exception is local development, where omitting the secret keeps `pnpm
    // dev` ergonomic. Production deploys must set CRON_SECRET in Vercel
    // project settings — see .env.example.
    return process.env.NODE_ENV === 'development';
  }

  return auth === `Bearer ${secret}`;
}

export async function GET(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const fixtureSource = new MockFixtureSource();
    const fixtures = await fixtureSource.listFixtures();
    const predictionRepository = createPredictionRepository();
    const snapshotRepository = createSnapshotRepository();

    const result = await runScheduler(
      {
        now: new Date(),
        fixtures,
        existingRuns: [],
        modelVersion: MODEL_VERSION,
      },
      {
        getFixture: async (id) => fixtures.find((f) => f.id === id) ?? null,
        getTeamStats: async (teamId) => fixtureSource.getTeamStats(teamId),
        predictionRepository,
        snapshotRepository,
      },
    );

    return NextResponse.json({
      modelVersion: MODEL_VERSION,
      due: result.due,
      succeeded: result.succeeded,
      skipped: result.skipped,
      failed: result.failed,
      warnings: result.warnings,
    });
  } catch {
    // Never expose stack traces — return an opaque error. Repository errors,
    // including database connection failures and unique-constraint violations
    // not caught by `executePredictionRun`, all funnel here.
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
