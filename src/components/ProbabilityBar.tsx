type ProbabilityBarProps = {
  pA: number;
  pDraw: number;
  pB: number;
  teamACode: string;
  teamBCode: string;
};

// Three-segment horizontal bar per docs/07 §2 accent-usage rules:
// red for team A, muted for draw, green for team B. Pure presentation.
export function ProbabilityBar({
  pA,
  pDraw,
  pB,
  teamACode,
  teamBCode,
}: ProbabilityBarProps): React.ReactElement {
  const total = pA + pDraw + pB || 1;
  const pctA = (pA / total) * 100;
  const pctD = (pDraw / total) * 100;
  const pctB = (pB / total) * 100;
  return (
    <div>
      <div
        className="flex h-2 w-full overflow-hidden rounded-sm bg-surface-muted ring-1 ring-border"
        role="img"
        aria-label={`Outcome probabilities: ${teamACode} ${pctA.toFixed(1)}%, draw ${pctD.toFixed(1)}%, ${teamBCode} ${pctB.toFixed(1)}%`}
      >
        <div className="bg-accent-red" style={{ width: `${pctA}%` }} />
        <div className="bg-text-secondary/30" style={{ width: `${pctD}%` }} />
        <div className="bg-accent-green" style={{ width: `${pctB}%` }} />
      </div>
      <div className="mt-2 flex justify-between font-mono text-xs tabular-nums text-text-secondary">
        <span>
          <span className="font-semibold text-accent-red">{teamACode}</span>{' '}
          {Math.round(pctA)}%
        </span>
        <span>Draw {Math.round(pctD)}%</span>
        <span>
          {Math.round(pctB)}%{' '}
          <span className="font-semibold text-accent-green">{teamBCode}</span>
        </span>
      </div>
    </div>
  );
}
