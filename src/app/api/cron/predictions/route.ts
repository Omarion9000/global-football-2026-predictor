import { NextResponse } from 'next/server';
import { MODEL_VERSION } from '@/lib/model';
import {
  InMemoryPredictionRepository,
  InMemorySnapshotRepository,
  MockFixtureSource,
} from '@/lib/data';
import { runScheduler } from '@/lib/scheduler';

// This route is invoked by Vercel Cron on a schedule defined in vercel.json.
// Phase 5 wires the scheduler to mock data + in-memory repositories so the
// route can be safely deployed alongside a real cron schedule without
// persisting anything. A future phase swaps in Supabase-backed repositories
// that satisfy the same PredictionRepository / SnapshotRepository contracts.
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
    const predictionRepository = new InMemoryPredictionRepository();
    const snapshotRepository = new InMemorySnapshotRepository();

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
    // Never expose stack traces — return an opaque error.
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
