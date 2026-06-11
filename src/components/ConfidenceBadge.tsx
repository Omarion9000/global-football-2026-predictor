import type { ConfidenceBand } from '@/lib/types';

const LABELS: Record<ConfidenceBand, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
};

const CLASSES: Record<ConfidenceBand, string> = {
  LOW: 'bg-warning/10 text-warning border-warning/40',
  MEDIUM: 'bg-surface-muted text-text-secondary border-border',
  HIGH: 'bg-success/10 text-success border-success/40',
};

export function ConfidenceBadge({
  band,
}: {
  band: ConfidenceBand;
}): React.ReactElement {
  return (
    <span
      className={`inline-flex items-center rounded-sm border px-2 py-1 font-mono text-[10px] uppercase tracking-widest ${CLASSES[band]}`}
    >
      Confidence: {LABELS[band]}
    </span>
  );
}
