import type { PredictionRunType } from '@/lib/types';
import { formatExecutedAt } from '@/lib/utils/format';

const RUN_TYPE_LABELS: Record<PredictionRunType, string> = {
  T_MINUS_3H: 'T−3h',
  T_MINUS_1H: 'T−1h',
  T_ZERO: 'Kickoff',
  HT: 'Half-time',
  FT: 'Full-time',
};

export type PredictionTimelineEntry = {
  runType: PredictionRunType;
  scheduledFor: string;
  executedAt: string;
  available: boolean;
  current?: boolean;
};

// Broadcast-strip per docs/07 §8. Each chip is a small editorial block.
// Filled chips read solid surface-strong; pending chips are dashed outlines.
// The currently-selected chip carries an accent-gold underline.
export function PredictionTimeline({
  entries,
}: {
  entries: readonly PredictionTimelineEntry[];
}): React.ReactElement {
  return (
    <ol
      className="flex flex-wrap items-stretch gap-2 sm:gap-3"
      aria-label="Prediction timeline"
    >
      {entries.map((e) => (
        <li
          key={e.runType}
          className={`relative flex min-w-[112px] flex-col gap-1 rounded-md border px-3 py-3 font-mono ${
            e.available
              ? 'border-surface-strong bg-surface-strong text-text-primary shadow-panel'
              : 'border-dashed border-border bg-surface text-text-secondary'
          }`}
        >
          <p className="text-[10px] uppercase tracking-widest">
            {RUN_TYPE_LABELS[e.runType]}
          </p>
          <p className="text-xs tabular-nums">
            {e.available ? formatExecutedAt(e.executedAt) : 'pending'}
          </p>
          {e.current ? (
            <span
              aria-hidden="true"
              className="absolute inset-x-2 bottom-1 h-0.5 rounded-full bg-accent-gold"
            />
          ) : null}
        </li>
      ))}
    </ol>
  );
}
