import type { ReactElement } from 'react';

// The 6 continental confederations. Duplicated locally rather than imported
// from `@/lib/data/sources/internationalResults/teamMap` to keep this
// component free of the server-only data-sources path tree per the UI
// boundary.
type Confederation = 'AFC' | 'CAF' | 'CONCACAF' | 'CONMEBOL' | 'OFC' | 'UEFA';

const CONF_CLASS: Record<Confederation, string> = {
  UEFA: 'bg-bp-conf-uefa/40 text-bp-ink',
  CONMEBOL: 'bg-bp-conf-conmebol/55 text-bp-ink',
  CAF: 'bg-bp-conf-caf/45 text-bp-ink',
  CONCACAF: 'bg-bp-conf-concacaf/45 text-bp-ink',
  AFC: 'bg-bp-conf-afc/45 text-bp-ink',
  OFC: 'bg-bp-conf-ofc/45 text-bp-ink',
};

type ConfederationTagProps = {
  readonly confederation: Confederation;
};

export function ConfederationTag({ confederation }: ConfederationTagProps): ReactElement {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-[2px] font-mono text-[10px] uppercase tracking-broadcast-wider shadow-bp-chip ${CONF_CLASS[confederation]}`}
    >
      {confederation}
    </span>
  );
}
