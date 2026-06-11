import { notFound } from 'next/navigation';
import {
  AppShell,
  ConfidenceBadge,
  EmptyState,
  PredictionTimeline,
  ProbabilityBar,
  ScorelineTable,
  StatusBadge,
  WavingFlag,
  type PredictionTimelineEntry,
} from '@/components';
import {
  getDemoFixtures,
  getDemoMostRecentPrediction,
  getDemoPredictionsForFixture,
  getDemoScorelinesForRun,
  getDemoTeams,
} from '@/lib/data/demoPredictions';
import { PREDICTION_RUN_TYPES, type PredictionRunType } from '@/lib/types';

const STAGE_LABEL: Record<string, string> = {
  GROUP: 'Group stage',
  R16: 'Round of 16',
  QF: 'Quarter-final',
  SF: 'Semi-final',
  F: 'Final',
  THIRD_PLACE: 'Third-place play-off',
};

const RUN_TYPE_LABEL: Record<PredictionRunType, string> = {
  T_MINUS_3H: 'T−3h',
  T_MINUS_1H: 'T−1h',
  T_ZERO: 'Kickoff',
  HT: 'Half-time',
  FT: 'Full-time',
};

export default async function MatchDetailPage({
  params,
}: {
  params: Promise<{ fixtureId: string }>;
}): Promise<React.ReactElement> {
  const { fixtureId } = await params;
  const fixtures = getDemoFixtures();
  const fixture = fixtures.find((f) => f.id === fixtureId);
  if (!fixture) notFound();

  const teams = getDemoTeams();
  const teamA = teams.find((t) => t.id === fixture.teamAId);
  const teamB = teams.find((t) => t.id === fixture.teamBId);
  if (!teamA || !teamB) notFound();

  const recent = getDemoMostRecentPrediction(fixture.id);
  const allRuns = getDemoPredictionsForFixture(fixture.id);
  const scorelines = recent ? getDemoScorelinesForRun(recent.run.id) : [];

  const timelineEntries: PredictionTimelineEntry[] = PREDICTION_RUN_TYPES.map(
    (rt) => {
      const row = allRuns.find((r) => r.run_type === rt);
      return {
        runType: rt,
        scheduledFor: row?.scheduled_for ?? '',
        executedAt: row?.executed_at ?? '',
        available: row != null,
        current: row != null && row.run_type === recent?.run.run_type,
      };
    },
  );

  return (
    <AppShell>
      <section className="mx-auto max-w-4xl px-6 pt-10 pb-6">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={fixture.status} />
          <span className="font-mono text-[10px] uppercase tracking-widest text-text-secondary">
            {STAGE_LABEL[fixture.stage] ?? fixture.stage}
            {fixture.groupCode != null ? ` · Group ${fixture.groupCode}` : ''}
          </span>
        </div>

        <h1 className="mt-4 flex items-center gap-4 text-2xl font-bold sm:text-3xl">
          <WavingFlag seed={teamA.id} label={teamA.code} size={40} />
          <span className="text-accent-red">{teamA.name}</span>
          <span className="px-2 font-mono text-base font-normal text-text-secondary">
            vs
          </span>
          <span className="text-accent-green">{teamB.name}</span>
          <WavingFlag seed={teamB.id} label={teamB.code} size={40} />
        </h1>

        <p className="mt-3 text-sm text-text-secondary">
          {fixture.venue.venueName} · {fixture.venue.venueCity},{' '}
          {fixture.venue.venueCountry} ·{' '}
          {new Date(fixture.kickoffUtc).toUTCString()}
        </p>
      </section>

      {recent ? (
        <section className="mx-auto max-w-4xl space-y-6 px-6 pb-16">
          <div className="rounded-lg border border-border bg-surface p-6 shadow-card">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-text-primary">
                Headline probabilities
              </h2>
              <ConfidenceBadge band={recent.run.confidence_band} />
            </div>
            <ProbabilityBar
              pA={recent.run.team_a_win_probability}
              pDraw={recent.run.draw_probability}
              pB={recent.run.team_b_win_probability}
              teamACode={teamA.code}
              teamBCode={teamB.code}
            />
            <p className="mt-5 font-mono text-[10px] uppercase tracking-widest text-text-secondary">
              Model {recent.run.model_version} ·{' '}
              {RUN_TYPE_LABEL[recent.run.run_type]} · executed{' '}
              {new Date(recent.run.executed_at).toUTCString()}
            </p>
            {recent.run.warnings.length > 0 ? (
              <ul className="mt-4 list-inside list-disc text-xs text-warning">
                {recent.run.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-surface p-6 shadow-card">
              <p className="font-mono text-[10px] uppercase tracking-widest text-text-secondary">
                Expected goals · {teamA.code}
              </p>
              <p className="mt-2 font-mono text-3xl font-bold tabular-nums text-accent-red">
                {recent.run.team_a_expected_goals.toFixed(2)}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-surface p-6 shadow-card">
              <p className="font-mono text-[10px] uppercase tracking-widest text-text-secondary">
                Expected goals · {teamB.code}
              </p>
              <p className="mt-2 font-mono text-3xl font-bold tabular-nums text-accent-green">
                {recent.run.team_b_expected_goals.toFixed(2)}
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-surface p-6 shadow-card">
            <h2 className="mb-4 text-xl font-semibold text-text-primary">
              Top scorelines
            </h2>
            <ScorelineTable
              scorelines={scorelines.map((s) => ({
                teamAGoals: s.team_a_goals,
                teamBGoals: s.team_b_goals,
                probability: s.probability,
              }))}
              teamACode={teamA.code}
              teamBCode={teamB.code}
            />
          </div>

          <div className="rounded-lg border border-border bg-surface p-6 shadow-card">
            <h2 className="mb-4 text-xl font-semibold text-text-primary">
              Prediction timeline
            </h2>
            <PredictionTimeline entries={timelineEntries} />
            <p className="mt-3 text-xs text-text-secondary">
              Pre-match predictions land at T−3h and T−1h, with a kickoff
              snapshot. Half-time and full-time entries populate as live data
              becomes available.
            </p>
          </div>
        </section>
      ) : (
        <section className="mx-auto max-w-4xl px-6 pb-16">
          <EmptyState
            title="No prediction yet"
            hint="Predictions populate as kickoff approaches."
          />
        </section>
      )}
    </AppShell>
  );
}
