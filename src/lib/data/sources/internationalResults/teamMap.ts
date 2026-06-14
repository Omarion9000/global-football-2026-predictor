// =============================================================================
// teamMap.ts — canonical national team registry (Phase 9A)
// =============================================================================
// Every distinct team name appearing in the filtered top-tier subset of the
// martj42 corpus must resolve through this map. An unmapped name is a hard
// error — completeness is enforced by an integration test against the corpus.
//
// Schema mapping:
//   teams.id     = `nat-${slug}` (e.g. 'nat-belgium')
//   teams.name   = corpus-canonical English display name
//   teams.code   = 3-letter abbreviation (ISO 3166-1 alpha-3 where applicable;
//                  FIFA code for the UK home nations, Kosovo, and
//                  defunct/transitional entities). teams.code is no longer
//                  UNIQUE after migration 0003.
//   teams.region = one of {AFC, CAF, CONCACAF, CONMEBOL, OFC, UEFA} per the
//                  Phase 1 region CHECK. Where a federation has changed
//                  confederation historically (Israel, Kazakhstan, Australia),
//                  we use the CURRENT confederation — the corpus model treats
//                  these as a single rating series.
//
// Historical entities (defunct or split federations) are included so older
// World Cup / Euro / qualifier rows can resolve:
//   Czechoslovakia, German DR (East Germany), Saarland, Yugoslavia,
//   Vietnam Republic (South Vietnam), Yemen DPR (South Yemen).
// =============================================================================

export type Confederation = 'AFC' | 'CAF' | 'CONCACAF' | 'CONMEBOL' | 'OFC' | 'UEFA';

export type CanonicalNation = {
  /** Stored in teams.id as `nat-${slug}`. Stable across renames. */
  slug: string;
  /** Stored in teams.name. Corpus-canonical English display name. */
  displayName: string;
  /** Stored in teams.code. 3 letters, A-Z. Not unique after 0003. */
  code: string;
  /** Stored in teams.region. */
  confederation: Confederation;
  /** Every corpus name that resolves to this nation. Usually 1 entry. */
  corpusNames: ReadonlyArray<string>;
};

function n(
  slug: string,
  displayName: string,
  code: string,
  confederation: Confederation,
  corpusNames: ReadonlyArray<string> = [displayName],
): CanonicalNation {
  return { slug, displayName, code, confederation, corpusNames };
}

export const CANONICAL_NATIONS: ReadonlyArray<CanonicalNation> = [
  // ---- UEFA -------------------------------------------------------------
  n('albania', 'Albania', 'ALB', 'UEFA'),
  n('andorra', 'Andorra', 'AND', 'UEFA'),
  n('armenia', 'Armenia', 'ARM', 'UEFA'),
  n('austria', 'Austria', 'AUT', 'UEFA'),
  n('azerbaijan', 'Azerbaijan', 'AZE', 'UEFA'),
  n('belarus', 'Belarus', 'BLR', 'UEFA'),
  n('belgium', 'Belgium', 'BEL', 'UEFA'),
  n('bosnia-and-herzegovina', 'Bosnia and Herzegovina', 'BIH', 'UEFA'),
  n('bulgaria', 'Bulgaria', 'BUL', 'UEFA'),
  n('croatia', 'Croatia', 'CRO', 'UEFA'),
  n('cyprus', 'Cyprus', 'CYP', 'UEFA'),
  n('czech-republic', 'Czech Republic', 'CZE', 'UEFA'),
  n('denmark', 'Denmark', 'DEN', 'UEFA'),
  n('england', 'England', 'ENG', 'UEFA'),
  n('estonia', 'Estonia', 'EST', 'UEFA'),
  n('faroe-islands', 'Faroe Islands', 'FRO', 'UEFA'),
  n('finland', 'Finland', 'FIN', 'UEFA'),
  n('france', 'France', 'FRA', 'UEFA'),
  n('georgia', 'Georgia', 'GEO', 'UEFA'),
  n('germany', 'Germany', 'GER', 'UEFA'),
  n('gibraltar', 'Gibraltar', 'GIB', 'UEFA'),
  n('greece', 'Greece', 'GRE', 'UEFA'),
  n('hungary', 'Hungary', 'HUN', 'UEFA'),
  n('iceland', 'Iceland', 'ISL', 'UEFA'),
  n('israel', 'Israel', 'ISR', 'UEFA'), // historical AFC; current UEFA (since 1994)
  n('italy', 'Italy', 'ITA', 'UEFA'),
  n('kazakhstan', 'Kazakhstan', 'KAZ', 'UEFA'), // historical AFC; current UEFA (since 2002)
  n('kosovo', 'Kosovo', 'KOS', 'UEFA'),
  n('latvia', 'Latvia', 'LVA', 'UEFA'),
  n('liechtenstein', 'Liechtenstein', 'LIE', 'UEFA'),
  n('lithuania', 'Lithuania', 'LTU', 'UEFA'),
  n('luxembourg', 'Luxembourg', 'LUX', 'UEFA'),
  n('malta', 'Malta', 'MLT', 'UEFA'),
  n('moldova', 'Moldova', 'MDA', 'UEFA'),
  n('montenegro', 'Montenegro', 'MNE', 'UEFA'),
  n('netherlands', 'Netherlands', 'NED', 'UEFA'),
  n('north-macedonia', 'North Macedonia', 'MKD', 'UEFA'),
  n('northern-ireland', 'Northern Ireland', 'NIR', 'UEFA'),
  n('norway', 'Norway', 'NOR', 'UEFA'),
  n('poland', 'Poland', 'POL', 'UEFA'),
  n('portugal', 'Portugal', 'POR', 'UEFA'),
  n('republic-of-ireland', 'Republic of Ireland', 'IRL', 'UEFA'),
  n('romania', 'Romania', 'ROU', 'UEFA'),
  n('russia', 'Russia', 'RUS', 'UEFA'),
  n('san-marino', 'San Marino', 'SMR', 'UEFA'),
  n('scotland', 'Scotland', 'SCO', 'UEFA'),
  n('serbia', 'Serbia', 'SRB', 'UEFA'),
  n('slovakia', 'Slovakia', 'SVK', 'UEFA'),
  n('slovenia', 'Slovenia', 'SVN', 'UEFA'),
  n('spain', 'Spain', 'ESP', 'UEFA'),
  n('sweden', 'Sweden', 'SWE', 'UEFA'),
  n('switzerland', 'Switzerland', 'SUI', 'UEFA'),
  n('turkey', 'Turkey', 'TUR', 'UEFA'),
  n('ukraine', 'Ukraine', 'UKR', 'UEFA'),
  n('wales', 'Wales', 'WAL', 'UEFA'),
  // Historical UEFA
  n('czechoslovakia', 'Czechoslovakia', 'TCH', 'UEFA'),
  n('german-dr', 'German DR', 'GDR', 'UEFA'),
  n('saarland', 'Saarland', 'SAA', 'UEFA'),
  n('yugoslavia', 'Yugoslavia', 'YUG', 'UEFA'),

  // ---- AFC --------------------------------------------------------------
  n('afghanistan', 'Afghanistan', 'AFG', 'AFC'),
  n('australia', 'Australia', 'AUS', 'AFC'), // OFC until 2006, AFC since
  n('bahrain', 'Bahrain', 'BHR', 'AFC'),
  n('bangladesh', 'Bangladesh', 'BAN', 'AFC'),
  n('bhutan', 'Bhutan', 'BHU', 'AFC'),
  n('brunei', 'Brunei', 'BRU', 'AFC'),
  n('cambodia', 'Cambodia', 'CAM', 'AFC'),
  n('china', 'China', 'CHN', 'AFC'),
  n('guam', 'Guam', 'GUM', 'AFC'),
  n('hong-kong', 'Hong Kong', 'HKG', 'AFC'),
  n('india', 'India', 'IND', 'AFC'),
  n('indonesia', 'Indonesia', 'IDN', 'AFC'),
  n('iran', 'Iran', 'IRN', 'AFC'),
  n('iraq', 'Iraq', 'IRQ', 'AFC'),
  n('japan', 'Japan', 'JPN', 'AFC'),
  n('jordan', 'Jordan', 'JOR', 'AFC'),
  n('kuwait', 'Kuwait', 'KUW', 'AFC'),
  n('kyrgyzstan', 'Kyrgyzstan', 'KGZ', 'AFC'),
  n('laos', 'Laos', 'LAO', 'AFC'),
  n('lebanon', 'Lebanon', 'LBN', 'AFC'),
  n('macau', 'Macau', 'MAC', 'AFC'),
  n('malaysia', 'Malaysia', 'MAS', 'AFC'),
  n('maldives', 'Maldives', 'MDV', 'AFC'),
  n('mongolia', 'Mongolia', 'MNG', 'AFC'),
  n('myanmar', 'Myanmar', 'MYA', 'AFC'),
  n('nepal', 'Nepal', 'NEP', 'AFC'),
  n('north-korea', 'North Korea', 'PRK', 'AFC'),
  n('oman', 'Oman', 'OMA', 'AFC'),
  n('pakistan', 'Pakistan', 'PAK', 'AFC'),
  n('palestine', 'Palestine', 'PLE', 'AFC'),
  n('philippines', 'Philippines', 'PHI', 'AFC'),
  n('qatar', 'Qatar', 'QAT', 'AFC'),
  n('saudi-arabia', 'Saudi Arabia', 'KSA', 'AFC'),
  n('singapore', 'Singapore', 'SGP', 'AFC'),
  n('south-korea', 'South Korea', 'KOR', 'AFC'),
  n('sri-lanka', 'Sri Lanka', 'SRI', 'AFC'),
  n('syria', 'Syria', 'SYR', 'AFC'),
  n('taiwan', 'Taiwan', 'TPE', 'AFC'),
  n('tajikistan', 'Tajikistan', 'TJK', 'AFC'),
  n('thailand', 'Thailand', 'THA', 'AFC'),
  n('timor-leste', 'Timor-Leste', 'TLS', 'AFC'),
  n('turkmenistan', 'Turkmenistan', 'TKM', 'AFC'),
  n('united-arab-emirates', 'United Arab Emirates', 'UAE', 'AFC'),
  n('uzbekistan', 'Uzbekistan', 'UZB', 'AFC'),
  n('vietnam', 'Vietnam', 'VIE', 'AFC'),
  n('yemen', 'Yemen', 'YEM', 'AFC'),
  // Historical AFC
  n('vietnam-republic', 'Vietnam Republic', 'VRP', 'AFC'),
  n('yemen-dpr', 'Yemen DPR', 'YDR', 'AFC'),

  // ---- CAF --------------------------------------------------------------
  n('algeria', 'Algeria', 'ALG', 'CAF'),
  n('angola', 'Angola', 'ANG', 'CAF'),
  n('benin', 'Benin', 'BEN', 'CAF'),
  n('botswana', 'Botswana', 'BOT', 'CAF'),
  n('burkina-faso', 'Burkina Faso', 'BFA', 'CAF'),
  n('burundi', 'Burundi', 'BDI', 'CAF'),
  n('cameroon', 'Cameroon', 'CMR', 'CAF'),
  n('cape-verde', 'Cape Verde', 'CPV', 'CAF'),
  n('central-african-republic', 'Central African Republic', 'CTA', 'CAF'),
  n('chad', 'Chad', 'CHA', 'CAF'),
  n('comoros', 'Comoros', 'COM', 'CAF'),
  n('congo', 'Congo', 'CGO', 'CAF'),
  n('djibouti', 'Djibouti', 'DJI', 'CAF'),
  n('dr-congo', 'DR Congo', 'COD', 'CAF'),
  n('egypt', 'Egypt', 'EGY', 'CAF'),
  n('equatorial-guinea', 'Equatorial Guinea', 'EQG', 'CAF'),
  n('eritrea', 'Eritrea', 'ERI', 'CAF'),
  n('eswatini', 'Eswatini', 'SWZ', 'CAF'),
  n('ethiopia', 'Ethiopia', 'ETH', 'CAF'),
  n('gabon', 'Gabon', 'GAB', 'CAF'),
  n('gambia', 'Gambia', 'GAM', 'CAF'),
  n('ghana', 'Ghana', 'GHA', 'CAF'),
  n('guinea', 'Guinea', 'GUI', 'CAF'),
  n('guinea-bissau', 'Guinea-Bissau', 'GNB', 'CAF'),
  n('ivory-coast', 'Ivory Coast', 'CIV', 'CAF'),
  n('kenya', 'Kenya', 'KEN', 'CAF'),
  n('lesotho', 'Lesotho', 'LES', 'CAF'),
  n('liberia', 'Liberia', 'LBR', 'CAF'),
  n('libya', 'Libya', 'LBY', 'CAF'),
  n('madagascar', 'Madagascar', 'MAD', 'CAF'),
  n('malawi', 'Malawi', 'MWI', 'CAF'),
  n('mali', 'Mali', 'MLI', 'CAF'),
  n('mauritania', 'Mauritania', 'MTN', 'CAF'),
  n('mauritius', 'Mauritius', 'MRI', 'CAF'),
  n('morocco', 'Morocco', 'MAR', 'CAF'),
  n('mozambique', 'Mozambique', 'MOZ', 'CAF'),
  n('namibia', 'Namibia', 'NAM', 'CAF'),
  n('niger', 'Niger', 'NIG', 'CAF'),
  n('nigeria', 'Nigeria', 'NGA', 'CAF'),
  n('rwanda', 'Rwanda', 'RWA', 'CAF'),
  n('sao-tome-and-principe', 'São Tomé and Príncipe', 'STP', 'CAF'),
  n('senegal', 'Senegal', 'SEN', 'CAF'),
  n('seychelles', 'Seychelles', 'SEY', 'CAF'),
  n('sierra-leone', 'Sierra Leone', 'SLE', 'CAF'),
  n('somalia', 'Somalia', 'SOM', 'CAF'),
  n('south-africa', 'South Africa', 'RSA', 'CAF'),
  n('south-sudan', 'South Sudan', 'SSD', 'CAF'),
  n('sudan', 'Sudan', 'SDN', 'CAF'),
  n('tanzania', 'Tanzania', 'TAN', 'CAF'),
  n('togo', 'Togo', 'TOG', 'CAF'),
  n('tunisia', 'Tunisia', 'TUN', 'CAF'),
  n('uganda', 'Uganda', 'UGA', 'CAF'),
  n('zambia', 'Zambia', 'ZAM', 'CAF'),
  n('zimbabwe', 'Zimbabwe', 'ZIM', 'CAF'),

  // ---- CONCACAF ---------------------------------------------------------
  n('anguilla', 'Anguilla', 'AIA', 'CONCACAF'),
  n('antigua-and-barbuda', 'Antigua and Barbuda', 'ATG', 'CONCACAF'),
  n('aruba', 'Aruba', 'ARU', 'CONCACAF'),
  n('bahamas', 'Bahamas', 'BAH', 'CONCACAF'),
  n('barbados', 'Barbados', 'BRB', 'CONCACAF'),
  n('belize', 'Belize', 'BLZ', 'CONCACAF'),
  n('bermuda', 'Bermuda', 'BER', 'CONCACAF'),
  n('bonaire', 'Bonaire', 'BOE', 'CONCACAF'),
  n('british-virgin-islands', 'British Virgin Islands', 'VGB', 'CONCACAF'),
  n('canada', 'Canada', 'CAN', 'CONCACAF'),
  n('cayman-islands', 'Cayman Islands', 'CAY', 'CONCACAF'),
  n('costa-rica', 'Costa Rica', 'CRC', 'CONCACAF'),
  n('cuba', 'Cuba', 'CUB', 'CONCACAF'),
  n('curacao', 'Curaçao', 'CUW', 'CONCACAF'),
  n('dominica', 'Dominica', 'DMA', 'CONCACAF'),
  n('dominican-republic', 'Dominican Republic', 'DOM', 'CONCACAF'),
  n('el-salvador', 'El Salvador', 'SLV', 'CONCACAF'),
  n('french-guiana', 'French Guiana', 'GUF', 'CONCACAF'),
  n('grenada', 'Grenada', 'GRN', 'CONCACAF'),
  n('guadeloupe', 'Guadeloupe', 'GLP', 'CONCACAF'),
  n('guatemala', 'Guatemala', 'GUA', 'CONCACAF'),
  n('guyana', 'Guyana', 'GUY', 'CONCACAF'),
  n('haiti', 'Haiti', 'HAI', 'CONCACAF'),
  n('honduras', 'Honduras', 'HON', 'CONCACAF'),
  n('jamaica', 'Jamaica', 'JAM', 'CONCACAF'),
  n('martinique', 'Martinique', 'MTQ', 'CONCACAF'),
  n('mexico', 'Mexico', 'MEX', 'CONCACAF'),
  n('montserrat', 'Montserrat', 'MSR', 'CONCACAF'),
  n('nicaragua', 'Nicaragua', 'NCA', 'CONCACAF'),
  n('panama', 'Panama', 'PAN', 'CONCACAF'),
  n('puerto-rico', 'Puerto Rico', 'PUR', 'CONCACAF'),
  n('saint-kitts-and-nevis', 'Saint Kitts and Nevis', 'SKN', 'CONCACAF'),
  n('saint-lucia', 'Saint Lucia', 'LCA', 'CONCACAF'),
  n('saint-martin', 'Saint Martin', 'SMN', 'CONCACAF'),
  n('saint-vincent-and-the-grenadines', 'Saint Vincent and the Grenadines', 'VIN', 'CONCACAF'),
  n('sint-maarten', 'Sint Maarten', 'SMA', 'CONCACAF'),
  n('suriname', 'Suriname', 'SUR', 'CONCACAF'),
  n('trinidad-and-tobago', 'Trinidad and Tobago', 'TRI', 'CONCACAF'),
  n('turks-and-caicos-islands', 'Turks and Caicos Islands', 'TCA', 'CONCACAF'),
  n('united-states', 'United States', 'USA', 'CONCACAF'),
  n('united-states-virgin-islands', 'United States Virgin Islands', 'VIR', 'CONCACAF'),

  // ---- CONMEBOL ---------------------------------------------------------
  n('argentina', 'Argentina', 'ARG', 'CONMEBOL'),
  n('bolivia', 'Bolivia', 'BOL', 'CONMEBOL'),
  n('brazil', 'Brazil', 'BRA', 'CONMEBOL'),
  n('chile', 'Chile', 'CHI', 'CONMEBOL'),
  n('colombia', 'Colombia', 'COL', 'CONMEBOL'),
  n('ecuador', 'Ecuador', 'ECU', 'CONMEBOL'),
  n('paraguay', 'Paraguay', 'PAR', 'CONMEBOL'),
  n('peru', 'Peru', 'PER', 'CONMEBOL'),
  n('uruguay', 'Uruguay', 'URU', 'CONMEBOL'),
  n('venezuela', 'Venezuela', 'VEN', 'CONMEBOL'),

  // ---- OFC --------------------------------------------------------------
  n('american-samoa', 'American Samoa', 'ASA', 'OFC'),
  n('cook-islands', 'Cook Islands', 'COK', 'OFC'),
  n('fiji', 'Fiji', 'FIJ', 'OFC'),
  n('new-caledonia', 'New Caledonia', 'NCL', 'OFC'),
  n('new-zealand', 'New Zealand', 'NZL', 'OFC'),
  n('papua-new-guinea', 'Papua New Guinea', 'PNG', 'OFC'),
  n('samoa', 'Samoa', 'SAM', 'OFC'),
  n('solomon-islands', 'Solomon Islands', 'SOL', 'OFC'),
  n('tahiti', 'Tahiti', 'TAH', 'OFC'),
  n('tonga', 'Tonga', 'TGA', 'OFC'),
  n('vanuatu', 'Vanuatu', 'VAN', 'OFC'),
];

// ---------------------------------------------------------------------------
// Lookup indices — built once at module load.
// ---------------------------------------------------------------------------
const BY_CORPUS_NAME = new Map<string, CanonicalNation>();
const BY_SLUG = new Map<string, CanonicalNation>();

for (const team of CANONICAL_NATIONS) {
  if (BY_SLUG.has(team.slug)) {
    throw new Error(`teamMap: duplicate slug "${team.slug}"`);
  }
  BY_SLUG.set(team.slug, team);
  for (const name of team.corpusNames) {
    if (BY_CORPUS_NAME.has(name)) {
      throw new Error(`teamMap: corpus name "${name}" already mapped`);
    }
    BY_CORPUS_NAME.set(name, team);
  }
}

/** Resolve a corpus team name. Hard-error on miss. */
export function resolveNation(name: string): CanonicalNation {
  const t = BY_CORPUS_NAME.get(name);
  if (!t) {
    throw new Error(
      `teamMap: unmapped national team name "${name}". Add it to CANONICAL_NATIONS or fix the corpus.`,
    );
  }
  return t;
}

export function findBySlug(slug: string): CanonicalNation | null {
  return BY_SLUG.get(slug) ?? null;
}

/** DB id (`teams.id`) for a canonical nation. Stable across renames. */
export function dbIdFor(nation: CanonicalNation): string {
  return `nat-${nation.slug}`;
}
