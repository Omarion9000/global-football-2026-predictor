import type { PredictionRunType } from '@/lib/types';

const RUN_TYPE_LABELS: Record<PredictionRunType, string> = {
  T_MINUS_3H: 'T−3h',
  T_MINUS_1H: 'T−1h',
  T_ZERO: 'Kickoff',
  HT: 'HT',
  FT: 'FT',
};

export type PredictionTimelineEntry = {
  runType: PredictionRunType;
  scheduledFor: string;
  executedAt: string;
  available: boolean;
  current?: boolean;
};

// Broadcast-strip chips per docs/07 §8. Available chips read solid; pending
// chips read outlined. A single underline in accent-gold optionally marks the
// "current" chip when supplied.
export function PredictionTimeline({
  entries,
}: {
  entries: readonly PredictionTimelineEntry[];
}): React.ReactElement {
  return (
    <ol
      className="flex flex-wrap items-stretch gap-2"
      aria-label="Prediction timeline"
    >
      {entries.map((e) => (
        <li
          key={e.runType}
          className={`relative rounded-sm border px-3 py-2 font-mono text-xs ${
            e.available
              ? 'border-surface-strong bg-surface-strong text-text-primary'
              : 'border-dashed border-border bg-surface text-text-secondary'
          }`}
        >
          <p className="text-[10px] uppercase tracking-widest">
            {RUN_TYPE_LABELS[e.runType]}
          </p>
          <p className="mt-1 tabular-nums">
            {e.available
              ? new Date(e.executedAt).toUTCString().slice(5, 22)
              : 'pending'}
          </p>
          {e.current ? (
            <span
              aria-hidden="true"
              className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-accent-gold"
            />
          ) : null}
        </li>
      ))}
    </ol>
  );
}
