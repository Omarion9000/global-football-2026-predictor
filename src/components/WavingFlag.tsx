// Placeholder geometric "flag" — abstract diagonal/vertical colour bands derived
// deterministically from a team identifier. Renders as inline SVG. Carries NO
// national symbology; this is intentional per docs/05 Phase 6 + docs/08 §1–§5.
//
// Real national-flag SVGs are deferred until the flag asset registry exists
// and has been reviewed. This placeholder ships now because it is internally
// authored, abstract, and visibly not a real national flag.
//
// Motion: a subtle CSS sway is applied via the `.flag-wave-band` class. The
// global @media (prefers-reduced-motion: reduce) rule in src/app/globals.css
// disables animation entirely and leaves the static fallback rendered.

const ABSTRACT_PALETTES: ReadonlyArray<readonly [string, string, string]> = [
  ['#C2410C', '#F2E6C9', '#166534'], // red / sand / green
  ['#D6A84F', '#FFF8E7', '#2563EB'], // gold / cream / blue
  ['#166534', '#F2E6C9', '#D6A84F'], // green / sand / gold
  ['#2563EB', '#FFF8E7', '#C2410C'], // blue / cream / red
  ['#C2410C', '#D6A84F', '#1C1917'], // red / gold / charcoal
  ['#166534', '#FFF8E7', '#2563EB'], // green / cream / blue
  ['#D6A84F', '#C2410C', '#FFF8E7'], // gold / red / cream
  ['#2563EB', '#F2E6C9', '#166534'], // blue / sand / green
];

function pickPalette(seed: string): readonly [string, string, string] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return ABSTRACT_PALETTES[Math.abs(h) % ABSTRACT_PALETTES.length];
}

export function WavingFlag({
  seed,
  label,
  size = 32,
  animate = true,
}: {
  /** Stable per-team identifier used to deterministically pick a palette. */
  seed: string;
  /** Screen-reader / title text. Should be the country/team code or name. */
  label: string;
  /** Width in pixels (height auto, ~70% of width). */
  size?: number;
  /** When false, the wave class is omitted entirely (used in tests). */
  animate?: boolean;
}): React.ReactElement {
  const palette = pickPalette(seed);
  const width = size;
  const height = Math.round(size * 0.7);
  const stripeHeight = height / 3;
  const bandClass = animate ? 'flag-wave-band' : '';

  return (
    <svg
      role="img"
      aria-label={`${label} colour band`}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible rounded-sm shadow-sm ring-1 ring-border"
    >
      <title>{label}</title>
      <g>
        <rect
          className={bandClass}
          x={0}
          y={0}
          width={width}
          height={stripeHeight}
          fill={palette[0]}
        />
        <rect
          className={bandClass}
          x={0}
          y={stripeHeight}
          width={width}
          height={stripeHeight}
          fill={palette[1]}
        />
        <rect
          className={bandClass}
          x={0}
          y={stripeHeight * 2}
          width={width}
          height={stripeHeight}
          fill={palette[2]}
        />
      </g>
    </svg>
  );
}
