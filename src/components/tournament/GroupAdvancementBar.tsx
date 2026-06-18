import type { ReactElement } from 'react';

type GroupAdvancementBarProps = {
  readonly p1st: number;
  readonly p2nd: number;
  readonly p3rd: number;
  readonly p4th: number;
  readonly label?: string;
};

export function GroupAdvancementBar(props: GroupAdvancementBarProps): ReactElement {
  const { p1st, p2nd, p3rd, p4th, label } = props;
  return (
    <div
      className="bp-group-bar"
      role="img"
      aria-label={
        label ??
        `Group finish: 1st ${pct(p1st)}, 2nd ${pct(p2nd)}, 3rd ${pct(p3rd)}, 4th ${pct(p4th)}`
      }
    >
      <span className="bp-seg-1st" style={{ width: w(p1st) }} />
      <span className="bp-seg-2nd" style={{ width: w(p2nd) }} />
      <span className="bp-seg-3rd" style={{ width: w(p3rd) }} />
      <span className="bp-seg-4th" style={{ width: w(p4th) }} />
    </div>
  );
}

function w(p: number): string {
  if (!Number.isFinite(p)) return '0%';
  return `${Math.max(0, Math.min(1, p)) * 100}%`;
}

function pct(p: number): string {
  return `${(p * 100).toFixed(1)}%`;
}
