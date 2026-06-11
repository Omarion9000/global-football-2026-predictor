// Translates raw engine warning strings (which were written for the scheduler
// to log into model_runs) into user-friendly UI copy. The raw string is
// preserved on the returned object so engineers can still see it on hover or
// in DOM inspection if they want, without surfacing implementation-looking
// text in the primary reading flow.
//
// Adding a new mapping: append a new case to the `match` lookup. Unknown
// shapes fall through to the "Model note" generic with the raw text rendered
// only as a small caption.

export type HumanizedWarningKind = 'info' | 'caution';

export type HumanizedWarning = {
  /** Short title, suitable for a chip or heading. */
  title: string;
  /** Friendly explanatory body. One short sentence. */
  body: string;
  /** Visual disposition — `info` reads neutral, `caution` reads as warning. */
  kind: HumanizedWarningKind;
  /** Original engine string. Useful for telemetry / dev tooling. */
  raw: string;
};

export function humanizeWarning(raw: string): HumanizedWarning {
  if (raw.includes('expects lineup data')) {
    return {
      title: 'Lineup data unavailable',
      body:
        'Starting lineups have not been published yet, so confidence is reduced for this prediction.',
      kind: 'caution',
      raw,
    };
  }
  if (raw.includes('expects in-play state')) {
    return {
      title: 'In-play data unavailable',
      body:
        'Live in-play data is not yet flowing, so the half-time recalibration relies on pre-match inputs.',
      kind: 'caution',
      raw,
    };
  }
  if (raw.includes('Monte Carlo deviates')) {
    return {
      title: 'Simulator note',
      body:
        'The simulator and analytic model diverged slightly. The headline probabilities use the analytic values for stability.',
      kind: 'info',
      raw,
    };
  }
  return {
    title: 'Model note',
    body: raw,
    kind: 'info',
    raw,
  };
}

export function humanizeWarnings(raws: readonly string[]): HumanizedWarning[] {
  return raws.map(humanizeWarning);
}
