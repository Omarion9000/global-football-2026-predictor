import Link from 'next/link';
import type { ConfidenceBand, Fixture } from '@/lib/types';
import { formatKickoff } from '@/lib/utils/format';
import { ConfidenceBadge } from './ConfidenceBadge';
import { Countdown } from './Countdown';
import { ProbabilityBar } from './ProbabilityBar';
import { StatusBadge } from './StatusBadge';
import { WavingFlag } from './WavingFlag';

export type FeaturedMatchPrediction = {
  pA: number;
  pDraw: number;
  pB: number;
  confidenceBand: ConfidenceBand;
};

type FeaturedMatchPanelProps = {
  fixture: Fixture;
  teamA: { id: string; code: string; name: string };
  teamB: { id: string; code: string; name: string };
  prediction: FeaturedMatchPrediction | null;
};

// Right-column hero card: the next upcoming fixture, highlighted as a
// "featured match." Compact composition so it pairs with hero copy on the
// left without crowding the page.
export function FeaturedMatchPanel({
  fixture,
  teamA,
  teamB,
  prediction,
}: FeaturedMatchPanelProps): React.ReactElement {
  return (
    <Link
      href={`/matches/${fixture.id}`}
      className="block rounded-xl border border-accent-gold/30 bg-paper bg-surface p-6 shadow-card-foil transition hover:shadow-card-foil-hover focus:outline-none"
      aria-label={`Featured match: ${teamA.name} vs ${teamB.name}`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-widest text-accent-gold">
          Next kickoff
        </p>
        <StatusBadge status={fixture.status} />
      </div>

      <div className="mt-5 space-y-3">
        <div className="flex items-center gap-3">
          <WavingFlag seed={teamA.id} label={teamA.code} size={32} />
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-text-secondary">
              {teamA.code}
            </p>
            <p className="text-lg font-semibold text-text-primary">
              {teamA.name}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <WavingFlag seed={teamB.id} label={teamB.code} size={32} />
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-text-secondary">
              {teamB.code}
            </p>
            <p className="text-lg font-semibold text-text-primary">
              {teamB.name}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 border-t border-surface-strong pt-4">
        <p className="text-xs text-text-secondary">
          {formatKickoff(fixture.kickoffUtc)}
        </p>
        <Countdown kickoffUtc={fixture.kickoffUtc} />
      </div>

      {prediction ? (
        <div className="mt-5">
          <ProbabilityBar
            pA={prediction.pA}
            pDraw={prediction.pDraw}
            pB={prediction.pB}
            teamACode={teamA.code}
            teamBCode={teamB.code}
          />
          <div className="mt-4 flex items-center justify-between gap-2">
            <ConfidenceBadge band={prediction.confidenceBand} />
            <span className="font-mono text-[10px] uppercase tracking-widest text-accent-gold">
              View match center →
            </span>
          </div>
        </div>
      ) : (
        <p className="mt-5 text-xs text-text-secondary">
          Prediction will populate as kickoff approaches.
        </p>
      )}
    </Link>
  );
}
