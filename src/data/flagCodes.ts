// =============================================================================
// flagCodes.ts
// =============================================================================
// Phase 9D — slug → flag-icons code mapping for the 48 tournament teams.
//
// `flag-icons` (MIT, public-domain SVG flags) keys its CSS classes by lowercase
// ISO 3166-1 alpha-2 codes (e.g. `fi fi-fr` for France), with ISO 3166-2
// subdivision codes for UK home nations (`gb-eng`, `gb-sct`, `gb-wls`,
// `gb-nir`). The Phase 9A `teamMap` stores alpha-3 / FIFA codes for the full
// 200+ nation registry; we only need the 48-team subset for the tournament UI,
// so the mapping is enumerated here rather than derived programmatically.
//
// If a team is added/removed from data/tournament/groups.json, update this
// map. The runner that writes src/data/tournament-sim.json hard-errors if a
// roster team has no flag code, so a missing entry surfaces immediately.
// =============================================================================

/** Slug (Phase 9A teamMap canonical slug) → flag-icons CSS code. Lowercase. */
export const FLAG_CODE_BY_SLUG: Readonly<Record<string, string>> = {
  // UEFA (16)
  spain: 'es',
  france: 'fr',
  england: 'gb-eng',
  germany: 'de',
  portugal: 'pt',
  netherlands: 'nl',
  belgium: 'be',
  croatia: 'hr',
  switzerland: 'ch',
  austria: 'at',
  norway: 'no',
  sweden: 'se',
  scotland: 'gb-sct',
  'czech-republic': 'cz',
  'bosnia-and-herzegovina': 'ba',
  turkey: 'tr',

  // CONMEBOL (5)
  brazil: 'br',
  argentina: 'ar',
  uruguay: 'uy',
  colombia: 'co',
  paraguay: 'py',
  ecuador: 'ec',

  // CAF (9)
  morocco: 'ma',
  senegal: 'sn',
  algeria: 'dz',
  tunisia: 'tn',
  egypt: 'eg',
  ghana: 'gh',
  'ivory-coast': 'ci',
  'cape-verde': 'cv',
  'south-africa': 'za',
  'dr-congo': 'cd',

  // CONCACAF (6)
  'united-states': 'us',
  canada: 'ca',
  mexico: 'mx',
  panama: 'pa',
  haiti: 'ht',
  curacao: 'cw',

  // AFC (8)
  japan: 'jp',
  'south-korea': 'kr',
  iran: 'ir',
  'saudi-arabia': 'sa',
  australia: 'au',
  qatar: 'qa',
  iraq: 'iq',
  jordan: 'jo',
  uzbekistan: 'uz',

  // OFC (1)
  'new-zealand': 'nz',
} as const;

export function flagCodeForSlug(slug: string): string | undefined {
  return FLAG_CODE_BY_SLUG[slug];
}
