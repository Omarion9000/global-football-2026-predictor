import type { ReactElement } from 'react';

type ProbabilityStripProps = {
  /** Cumulative probability of reaching each round.
   *  Invariant: pR16 >= pQF >= pSF >= pFinal >= pTitle. */
  readonly pR16: number;
  readonly pQF: number;
  readonly pSF: number;
  readonly pFinal: number;
  readonly pTitle: number;
  /** Optional ARIA description for screen readers. */
  readonly label?: string;
};

/** Render a 5-segment strip whose total width is P(R16). Each segment widens
 *  with the marginal probability of advancing from one round to the next. The
 *  colours track the rounds (peach=R16, butter=QF, sage=SF, deep sage=Final,
 *  deep sky=Title) so a glance carries information without a legend. */
export function ProbabilityStrip(props: ProbabilityStripProps): ReactElement {
  const { pR16, pQF, pSF, pFinal, pTitle, label } = props;
  const r16Pct = pct(pR16);
  const qfPct = pct(pQF);
  const sfPct = pct(pSF);
  const fnlPct = pct(pFinal);
  const titlePct = pct(pTitle);

  return (
    <div className="flex items-center gap-3">
      <div
        className="bp-prob-strip"
        role="img"
        aria-label={
          label ??
          `Round-by-round: R16 ${r16Pct}, QF ${qfPct}, SF ${sfPct}, Final ${fnlPct}, Champion ${titlePct}`
        }
      >
        <span className="bp-seg-r16" style={{ width: clamp(pR16 - pQF) }} />
        <span className="bp-seg-qf" style={{ width: clamp(pQF - pSF) }} />
        <span className="bp-seg-sf" style={{ width: clamp(pSF - pFinal) }} />
        <span className="bp-seg-final" style={{ width: clamp(pFinal - pTitle) }} />
        <span className="bp-seg-title" style={{ width: clamp(pTitle) }} />
      </div>
    </div>
  );
}

function clamp(p: number): string {
  if (!Number.isFinite(p)) return '0%';
  return `${Math.max(0, Math.min(1, p)) * 100}%`;
}

function pct(p: number): string {
  return `${(p * 100).toFixed(1)}%`;
}
