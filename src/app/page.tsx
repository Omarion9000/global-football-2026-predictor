import {
  AppShell,
  EmptyState,
  FeaturedMatchPanel,
  HeroStats,
  MatchCard,
  PUBLIC_PRODUCT_NAME,
} from '@/components';
import {
  getDemoFixtures,
  getDemoTeams,
} from '@/lib/data/demoPredictions';
import { loadMostRecentPredictionForFixture } from '@/lib/data/uiReadModel';
import { MODEL_VERSION } from '@/lib/model';
import { formatDayHeader } from '@/lib/utils/format';
import type { Fixture } from '@/lib/types';
import type { PredictionRunRow } from '@/lib/data/persistence/types';

// Refresh the persisted-prediction read at most once every 5 minutes, matching
// the */5 * * * * cron cadence. Without this, Next.js would bake the read into
// the static render at build time and never refresh.
export const revalidate = 300;

function groupByDay(
  fixtures: readonly Fixture[],
): Array<{ day: string; fixtures: Fixture[] }> {
  const groups = new Map<string, Fixture[]>();
  for (const f of fixtures) {
    const day = f.kickoffUtc.slice(0, 10);
    const bucket = groups.get(day) ?? [];
    bucket.push(f);
    groups.set(day, bucket);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, fixtures]) => ({
      day,
      fixtures: [...fixtures].sort((a, b) =>
        a.kickoffUtc.localeCompare(b.kickoffUtc),
      ),
    }));
}

function pickFeaturedFixture(
  fixtures: readonly Fixture[],
  now: Date,
): Fixture | null {
  const nowMs = now.getTime();
  const upcoming = [...fixtures]
    .filter((f) => Date.parse(f.kickoffUtc) >= nowMs)
    .sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc));
  if (upcoming.length > 0) return upcoming[0];
  return (
    [...fixtures].sort((a, b) => b.kickoffUtc.localeCompare(a.kickoffUtc))[0] ??
    null
  );
}

export default async function HomePage(): Promise<React.ReactElement> {
  const fixtures = getDemoFixtures();
  const teams = getDemoTeams();
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const groups = groupByDay(fixtures);
  const featured = pickFeaturedFixture(fixtures, new Date());

  // Load the most-recent persisted prediction per fixture in parallel. When
  // POSTGRES_URL is unset, the read model silently falls back to demo data
  // per fixture, so the page renders identically in demo mode.
  const recentByFixtureId = new Map<string, PredictionRunRow>();
  const recents = await Promise.all(
    fixtures.map(async (f) => [f.id, await loadMostRecentPredictionForFixture(f.id)] as const),
  );
  for (const [id, recent] of recents) {
    if (recent) recentByFixtureId.set(id, recent.run);
  }

  // The demo helper generates 3 pre-match snapshots per fixture (T-3h, T-1h,
  // T_ZERO). Used in the hero stats pill.
  const SNAPSHOTS_PER_FIXTURE = 3;
  const totalSnapshots = fixtures.length * SNAPSHOTS_PER_FIXTURE;

  let featuredPanel: React.ReactNode = null;
  if (featured) {
    const teamA = teamById.get(featured.teamAId);
    const teamB = teamById.get(featured.teamBId);
    if (teamA && teamB) {
      const recent = recentByFixtureId.get(featured.id) ?? null;
      featuredPanel = (
        <FeaturedMatchPanel
          fixture={featured}
          teamA={{ id: teamA.id, code: teamA.code, name: teamA.name }}
          teamB={{ id: teamB.id, code: teamB.code, name: teamB.name }}
          prediction={
            recent
              ? {
                  pA: recent.team_a_win_probability,
                  pDraw: recent.draw_probability,
                  pB: recent.team_b_win_probability,
                  confidenceBand: recent.confidence_band,
                }
              : null
          }
        />
      );
    }
  }

  return (
    <AppShell modelVersion={MODEL_VERSION}>
      <section className="mx-auto max-w-6xl px-6 pt-10 pb-8 lg:pt-14 lg:pb-12">
        <div className="grid gap-10 lg:grid-cols-[1fr_360px] lg:items-start">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-accent-gold">
              2026 international tournament · demo
            </p>
            <h1 className="mt-3 text-3xl font-bold text-text-primary sm:text-4xl lg:text-5xl">
              {PUBLIC_PRODUCT_NAME}
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-text-secondary">
              Independent football probability dashboard for the 2026
              international tournament. Match outcome probabilities, expected
              goals, and top scorelines, refreshed across each fixture&rsquo;s
              pre-match window.
            </p>
            <HeroStats
              stats={[
                { value: String(fixtures.length), label: 'Demo fixtures' },
                {
                  value: String(totalSnapshots),
                  label: 'Prediction snapshots',
                },
                { value: MODEL_VERSION, label: 'Model version' },
              ]}
            />
          </div>
          {featuredPanel}
        </div>
      </section>

      <section className="mx-auto max-w-6xl space-y-12 px-6 pb-16">
        {groups.length === 0 ? (
          <EmptyState
            title="No fixtures available"
            hint="Mock fixtures will appear once they are loaded."
          />
        ) : (
          groups.map(({ day, fixtures }) => (
            <div key={day}>
              <h2 className="mb-5 flex items-center gap-3 border-b border-surface-strong pb-3 font-mono text-xs uppercase tracking-widest text-text-secondary">
                <span aria-hidden="true" className="h-px flex-1 bg-surface-strong" />
                <span className="text-text-primary">
                  {formatDayHeader(day)}
                </span>
                <span aria-hidden="true" className="h-px flex-1 bg-surface-strong" />
              </h2>
              <div className="grid gap-5 sm:grid-cols-2">
                {fixtures.map((f) => {
                  const teamA = teamById.get(f.teamAId);
                  const teamB = teamById.get(f.teamBId);
                  if (!teamA || !teamB) return null;
                  const recent = recentByFixtureId.get(f.id) ?? null;
                  return (
                    <MatchCard
                      key={f.id}
                      fixture={f}
                      teamA={{
                        id: teamA.id,
                        code: teamA.code,
                        name: teamA.name,
                      }}
                      teamB={{
                        id: teamB.id,
                        code: teamB.code,
                        name: teamB.name,
                      }}
                      prediction={
                        recent
                          ? {
                              pA: recent.team_a_win_probability,
                              pDraw: recent.draw_probability,
                              pB: recent.team_b_win_probability,
                              confidenceBand: recent.confidence_band,
                              modelVersion: recent.model_version,
                              runType: recent.run_type,
                            }
                          : null
                      }
                    />
                  );
                })}
              </div>
            </div>
          ))
        )}
      </section>
    </AppShell>
  );
}
