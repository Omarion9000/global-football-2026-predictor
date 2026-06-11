import Link from 'next/link';
import type { ConfidenceBand, Fixture } from '@/lib/types';
import { ConfidenceBadge } from './ConfidenceBadge';
import { Countdown } from './Countdown';
import { MatchCardFoil } from './MatchCardFoil';
import { ProbabilityBar } from './ProbabilityBar';
import { StatusBadge } from './StatusBadge';
import { WavingFlag } from './WavingFlag';

export type MatchCardPrediction = {
  pA: number;
  pDraw: number;
  pB: number;
  confidenceBand: ConfidenceBand;
  modelVersion: string;
  runType: string;
};

type MatchCardProps = {
  fixture: Fixture;
  teamA: { id: string; code: string; name: string };
  teamB: { id: string; code: string; name: string };
  prediction: MatchCardPrediction | null;
};

const RUN_TYPE_DISPLAY: Record<string, string> = {
  T_MINUS_3H: 'T−3h',
  T_MINUS_1H: 'T−1h',
  T_ZERO: 'Kickoff',
  HT: 'Half-time',
  FT: 'Full-time',
};

export function MatchCard({
  fixture,
  teamA,
  teamB,
  prediction,
}: MatchCardProps): React.ReactElement {
  return (
    <MatchCardFoil>
      <Link
        href={`/matches/${fixture.id}`}
        className="block rounded-lg border border-border bg-surface p-5 focus:outline-none"
      >
        {/* Top strip: status + countdown */}
        <div className="flex items-start justify-between gap-3">
          <StatusBadge status={fixture.status} />
          <Countdown kickoffUtc={fixture.kickoffUtc} />
        </div>

        {/* Teams row with placeholder colour-band "flags" */}
        <div className="mt-5 grid grid-cols-[auto_1fr_auto_1fr_auto] items-center gap-3">
          <WavingFlag seed={teamA.id} label={teamA.code} size={28} />
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-text-secondary">
              {teamA.code}
            </p>
            <p className="text-lg font-semibold text-text-primary">
              {teamA.name}
            </p>
          </div>
          <p className="px-1 font-mono text-xs text-text-secondary">vs</p>
          <div className="text-right">
            <p className="font-mono text-[10px] uppercase tracking-widest text-text-secondary">
              {teamB.code}
            </p>
            <p className="text-lg font-semibold text-text-primary">
              {teamB.name}
            </p>
          </div>
          <WavingFlag seed={teamB.id} label={teamB.code} size={28} />
        </div>

        {/* Venue strip */}
        <p className="mt-3 text-xs text-text-secondary">
          {fixture.venue.venueName} · {fixture.venue.venueCity},{' '}
          {fixture.venue.venueCountry}
        </p>

        {/* Prediction strip */}
        {prediction ? (
          <div className="mt-5 rounded-md border border-surface-strong bg-surface-muted p-4">
            <ProbabilityBar
              pA={prediction.pA}
              pDraw={prediction.pDraw}
              pB={prediction.pB}
              teamACode={teamA.code}
              teamBCode={teamB.code}
            />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <ConfidenceBadge band={prediction.confidenceBand} />
              <p className="font-mono text-[10px] uppercase tracking-widest text-text-secondary">
                {RUN_TYPE_DISPLAY[prediction.runType] ?? prediction.runType} ·{' '}
                {prediction.modelVersion}
              </p>
            </div>
          </div>
        ) : (
          <p className="mt-5 rounded-md border border-dashed border-border bg-surface-muted p-4 text-xs text-text-secondary">
            Prediction pending — populates as kickoff approaches.
          </p>
        )}
      </Link>
    </MatchCardFoil>
  );
}
