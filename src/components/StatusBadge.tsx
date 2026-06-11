import type { MatchStatus } from '@/lib/types';

const LABELS: Record<MatchStatus, string> = {
  SCHEDULED: 'Scheduled',
  PRE_MATCH: 'Pre-match',
  IN_PROGRESS: 'Live',
  HALF_TIME: 'Half-time',
  FULL_TIME: 'Full-time',
  POSTPONED: 'Postponed',
  CANCELLED: 'Cancelled',
};

const CLASSES: Record<MatchStatus, string> = {
  SCHEDULED: 'bg-surface-muted text-text-secondary border-border',
  PRE_MATCH: 'bg-surface-muted text-accent-blue border-accent-blue/30',
  IN_PROGRESS: 'bg-success/10 text-success border-success/40',
  HALF_TIME: 'bg-warning/10 text-warning border-warning/40',
  FULL_TIME: 'bg-surface-muted text-text-secondary border-border',
  POSTPONED: 'bg-warning/10 text-warning border-warning/40',
  CANCELLED: 'bg-danger/10 text-danger border-danger/40',
};

export function StatusBadge({
  status,
}: {
  status: MatchStatus;
}): React.ReactElement {
  return (
    <span
      className={`inline-flex items-center rounded-sm border px-2 py-1 font-mono text-[10px] uppercase tracking-widest ${CLASSES[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}
