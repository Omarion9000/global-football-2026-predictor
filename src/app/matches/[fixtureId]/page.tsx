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
  getDemoTeams,
} from '@/lib/data/demoPredictions';
import {
  loadMostRecentPredictionForFixture,
  loadPredictionHistoryForFixture,
} from '@/lib/data/uiReadModel';
import { MODEL_VERSION } from '@/lib/model';
import { formatExecutedAt, formatKickoff } from '@/lib/utils/format';
import { humanizeWarnings } from '@/lib/utils/warnings';
import { PREDICTION_RUN_TYPES, type PredictionRunType } from '@/lib/types';

// Refresh persisted predictions at most every 5 minutes, matching the cron
// cadence. See `src/app/page.tsx` for the same rationale.
export const revalidate = 300;

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

  const [recent, allRuns] = await Promise.all([
    loadMostRecentPredictionForFixture(fixture.id),
    loadPredictionHistoryForFixture(fixture.id),
  ]);
  const scorelines = recent ? recent.scorelines : [];

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

  const humanizedWarnings = recent ? humanizeWarnings(recent.run.warnings) : [];

  return (
    <AppShell modelVersion={MODEL_VERSION}>
      {/* Match-center header */}
      <section className="border-b border-surface-strong bg-surface-muted">
        <div className="mx-auto max-w-5xl px-6 py-10 sm:py-12">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={fixture.status} />
            <span className="font-mono text-[10px] uppercase tracking-widest text-text-secondary">
              {STAGE_LABEL[fixture.stage] ?? fixture.stage}
              {fixture.groupCode != null
                ? ` · Group ${fixture.groupCode}`
                : ''}
            </span>
          </div>

          <div className="mt-6 grid items-center gap-4 sm:grid-cols-[1fr_auto_1fr]">
            <div className="flex items-center gap-4">
              <WavingFlag seed={teamA.id} label={teamA.code} size={48} />
              <div>
                <p className="font-mono text-xs uppercase tracking-widest text-text-secondary">
                  {teamA.code}
                </p>
                <p className="text-2xl font-bold text-accent-red sm:text-3xl">
                  {teamA.name}
                </p>
              </div>
            </div>
            <p className="font-mono text-base uppercase tracking-widest text-text-secondary sm:text-xl">
              vs
            </p>
            <div className="flex items-center gap-4 sm:justify-end">
              <div className="sm:text-right">
                <p className="font-mono text-xs uppercase tracking-widest text-text-secondary">
                  {teamB.code}
                </p>
                <p className="text-2xl font-bold text-accent-green sm:text-3xl">
                  {teamB.name}
                </p>
              </div>
              <WavingFlag seed={teamB.id} label={teamB.code} size={48} />
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-text-secondary">
            <span className="font-mono tabular-nums">
              {formatKickoff(fixture.kickoffUtc)}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {fixture.venue.venueName}, {fixture.venue.venueCity},{' '}
              {fixture.venue.venueCountry}
            </span>
          </div>
        </div>
      </section>

      {recent ? (
        <section className="mx-auto max-w-5xl space-y-8 px-6 py-10">
          {/* Headline probabilities */}
          <div className="rounded-xl border border-accent-gold/25 bg-paper bg-surface p-6 shadow-card-foil sm:p-8">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-text-primary sm:text-2xl">
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
            <p className="mt-6 font-mono text-[10px] uppercase tracking-widest text-text-secondary">
              Model {recent.run.model_version} ·{' '}
              {RUN_TYPE_LABEL[recent.run.run_type]} · executed{' '}
              {formatExecutedAt(recent.run.executed_at)}
            </p>

            {humanizedWarnings.length > 0 ? (
              <ul className="mt-5 space-y-3">
                {humanizedWarnings.map((w, i) => (
                  <li
                    key={i}
                    className={`rounded-md border p-3 text-sm ${
                      w.kind === 'caution'
                        ? 'border-warning/40 bg-warning/10 text-text-primary'
                        : 'border-surface-strong bg-surface-muted text-text-primary'
                    }`}
                  >
                    <p className="font-mono text-[10px] uppercase tracking-widest text-text-secondary">
                      {w.title}
                    </p>
                    <p className="mt-1">{w.body}</p>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {/* Expected goals — integrated as a single block */}
          <div className="rounded-xl border border-border bg-surface p-6 shadow-card sm:p-8">
            <h2 className="mb-5 text-xl font-semibold text-text-primary sm:text-2xl">
              Expected goals
            </h2>
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="rounded-lg border border-accent-red/20 bg-surface-muted p-5">
                <div className="flex items-center gap-3">
                  <WavingFlag
                    seed={teamA.id}
                    label={teamA.code}
                    size={28}
                  />
                  <p className="font-mono text-[10px] uppercase tracking-widest text-text-secondary">
                    {teamA.code}
                  </p>
                </div>
                <p className="mt-3 font-mono text-4xl font-bold tabular-nums text-accent-red sm:text-5xl">
                  {recent.run.team_a_expected_goals.toFixed(2)}
                </p>
                <p className="mt-1 text-xs text-text-secondary">xG</p>
              </div>
              <div className="rounded-lg border border-accent-green/20 bg-surface-muted p-5">
                <div className="flex items-center gap-3">
                  <WavingFlag
                    seed={teamB.id}
                    label={teamB.code}
                    size={28}
                  />
                  <p className="font-mono text-[10px] uppercase tracking-widest text-text-secondary">
                    {teamB.code}
                  </p>
                </div>
                <p className="mt-3 font-mono text-4xl font-bold tabular-nums text-accent-green sm:text-5xl">
                  {recent.run.team_b_expected_goals.toFixed(2)}
                </p>
                <p className="mt-1 text-xs text-text-secondary">xG</p>
              </div>
            </div>
          </div>

          {/* Top scorelines */}
          <div className="rounded-xl border border-border bg-surface p-6 shadow-card sm:p-8">
            <h2 className="mb-5 text-xl font-semibold text-text-primary sm:text-2xl">
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

          {/* Prediction timeline — broadcast strip */}
          <div className="rounded-xl border border-border bg-surface p-6 shadow-card sm:p-8">
            <h2 className="mb-5 text-xl font-semibold text-text-primary sm:text-2xl">
              Prediction timeline
            </h2>
            <PredictionTimeline entries={timelineEntries} />
            <p className="mt-4 text-xs text-text-secondary">
              Pre-match predictions land at T−3h and T−1h, with a kickoff
              snapshot. Half-time and full-time entries populate as live data
              becomes available.
            </p>
          </div>
        </section>
      ) : (
        <section className="mx-auto max-w-5xl px-6 py-10">
          <EmptyState
            title="No prediction yet"
            hint="Predictions populate as kickoff approaches."
          />
        </section>
      )}
    </AppShell>
  );
}
