// =============================================================================
// dictionary.ts — Phase 9D.1 EN/ES translations
// =============================================================================
// Central translation source for the simulator UI. Every user-facing string
// across the masthead, footer, three views (title odds, groups, bracket), the
// methodology panel, and the language toggle lives here.
//
// The structure is intentionally a nested object instead of a flat key map so
// the call-site reads naturally (`t.home.statRunModel`). Parameterised strings
// are functions taking the arguments inline — TypeScript checks the call sites
// and the i18n parity test asserts EN and ES expose the same key shape.
//
// Notes on Spanish choices (for /docs/21 §10):
// * Round names use the proper Spanish football terms across the board:
//   R32 = "Dieciseisavos de final", R16 = "Octavos de final",
//   QF = "Cuartos de final", SF = "Semifinal", F = "Final". These are the
//   standard broadcast names in Mexican / Latin American football. The R32
//   short forms ("R32", "R16", "QF", "SF", "F") still appear in dense
//   tables (titleProbabilities, round-by-round mini-grid) because they are
//   universal across languages.
// * The round-leaderboard kickers use shorter Spanish forms
//   ("Llega a octavos", "Llega a cuartos", "Llega a semis") where the
//   five-column card grid constrains width.
// * Country names + confederation codes (UEFA/CONMEBOL/CAF/CONCACAF/AFC/OFC)
//   are NOT translated. Technical terms (Monte Carlo, Dixon-Coles, ridge,
//   MLE, Poisson, α, δ) stay in their source form.
// =============================================================================

export type Lang = 'en' | 'es';

export const SUPPORTED_LANGS: ReadonlyArray<Lang> = ['en', 'es'];

/** Cookie name carrying the user's preferred language across requests.
 *  Declared here (server-safe module) so server components can import it
 *  alongside the client-only LanguageProvider. */
export const LANG_COOKIE = 'lang';

/** Resolve a raw cookie value into a supported language, defaulting to EN. */
export function resolveLang(raw: string | undefined | null): Lang {
  if (raw === 'es' || raw === 'en') return raw;
  return 'en';
}

const en = {
  toggle: {
    ariaLabel: 'Language',
    en: 'EN',
    es: 'ES',
  },
  masthead: {
    kicker: 'Probability dashboard · v0.1',
    homeAriaLabel: 'home',
  },
  nav: {
    ariaLabel: 'Tournament views',
    titleProbs: 'Title probabilities',
    groups: 'Groups',
    bracket: 'Bracket',
  },
  footer: {
    independenceLabel: 'Independence statement',
    projectLabel: 'Project',
    model: (v: string): string => `Model ${v}`,
  },
  home: {
    docTitle: 'Title probabilities · Global Football 2026 Predictor',
    kickerChip: 'Pre-tournament prediction',
    runMeta: (date: string): string => `Run ${date} UTC`,
    mcPasses: (n: string): string => `${n} Monte Carlo passes`,
    seed: (s: number): string => `Seed ${s}`,
    headlineLine1: 'Who lifts the trophy in the',
    headlineLine2: '2026 tournament?',
    sub: (n: string): { intro: string; n: string; emphasis: string; tail: string } => ({
      intro: 'An offline Monte Carlo simulator runs the entire knockout draw ',
      n,
      emphasis: ' probabilities',
      tail:
        ' times using a national-team Dixon-Coles model with a confederation-strength correction. These numbers are',
      // closing fragment used after the emphasised word:
    }),
    subTail: ', not forecasts — the next page reload tells the same story with the same seed.',
    statRunModel: 'Run model',
    statRunModelValue: 'Confed DC',
    statRunModelFoot: 'Phase 9B.2',
    statTeamsModelled: 'Teams modelled',
    statTeamsModelledFoot: '12 groups × 4',
    statSumTitle: 'Σ P(title)',
    statSumTitleFoot: 'Sanity check',
    sectionTopOrd: '01',
    sectionTopKicker: 'Most likely champions',
    sectionTopTitle: 'Top six by title probability',
    sectionTableOrd: '02',
    sectionTableKicker: 'Ranks 7 — 48',
    sectionTableTitle: 'Full title probability table',
    sectionMethodologyOrd: '03',
    sectionMethodologyKicker: 'Methodology',
    sectionMethodologyTitle: 'How this works (and where it breaks)',
    rank: (n: string): string => `Rank ${n}`,
    group: (g: string): string => `Group ${g}`,
    pTitleLabel: 'P(title)',
    colNumber: '#',
    colTeam: 'Team',
    colConf: 'Conf',
    colGroup: 'Grp',
    colRoundByRound: 'Round-by-round',
    colR16: 'R16',
    colQF: 'QF',
    colSF: 'SF',
    colF: 'F',
    colTitle: 'Title',
    shortR16: 'R16',
    shortQF: 'QF',
    shortSF: 'SF',
    shortF: 'F',
    shortW: 'W',
    tableCaption: 'All 48 teams ranked by probability of winning the title.',
    teamRoundByRoundAria: (team: string): string => `${team} round-by-round`,
  },
  groups: {
    docTitle: 'Group stage · Global Football 2026 Predictor',
    kickerChip: 'Group stage',
    meta: (n: number): string => `${n} groups · 4 teams · 6 matches each`,
    metaAdvance: 'Top 2 + 8 best thirds advance',
    headline: 'Group stage advancement',
    sub: (n: string): string =>
      `For each of the 12 groups, the probability that each team finishes 1st, 2nd, 3rd, or 4th across ${n} Monte Carlo passes. Sage fills 1st, butter 2nd, peach 3rd, bone 4th.`,
    groupLabelKicker: 'Group',
    advHeader: 'Adv. prob',
    advBadge: (p: string): string => `Adv ${p}`,
    pos1st: '1st',
    pos2nd: '2nd',
    pos3rd: '3rd',
    pos4th: '4th',
    aria: (team: string, p1: string, p2: string, p3: string, p4: string): string =>
      `${team} — 1st ${p1}, 2nd ${p2}, 3rd ${p3}, 4th ${p4}`,
  },
  bracket: {
    docTitle: 'Bracket · Global Football 2026 Predictor',
    kickerChip: 'Knockout phase',
    meta: 'R32 → R16 → QF → SF → Final',
    headline: 'Knockout bracket',
    sub:
      'A representative 32-team knockout tree. The R32 cells show the slot each pair feeds from, plus the team most likely to occupy winner / runner-up slots. Third-place slots are not annotated with a team because the simulator does not track per-slot best-third assignments — only that 8 of the 12 third-placed teams advance.',
    placeholderBold: 'Placeholder pairings.',
    placeholderBody:
      'Representative knockout structure, not the published 2026 pairings. See docs/20 §4.4.',
    leaderHeadline: 'Most likely qualifiers, by round',
    reachR16: 'Reach R16',
    reachQF: 'Reach QF',
    reachSF: 'Reach SF',
    reachFinal: 'Reach Final',
    winTitle: 'Win the title',
    treeHeadline: 'Tree',
    treeMeta: '16 → 8 → 4 → 2 → 1',
    colR32: 'Round of 32',
    colR16: 'Round of 16',
    colQF: 'Quarter-final',
    colSF: 'Semi-final',
    colFinal: 'Final',
    winnerGroup: (g: string): string => `Winner Group ${g}`,
    runnerUpGroup: (g: string): string => `Runner-up Group ${g}`,
    bestThird: (n: number): string => `Best Third #${n}`,
    r32Cell: (n: string): string => `R32 · M${n}`,
    roundCell: (round: string, n: string): string => `${round} · M${n}`,
    winnerFeed: (round: string, n: string): string => `Winner ${round}·${n}`,
    vs: 'vs',
    columnCountAria: (label: string, n: number): string => `${label}: ${n} matches`,
  },
  methodology: {
    cardModelKicker: 'The model',
    cardModelTitle: 'Dixon-Coles + confederation strength',
    cardModelBodyA: 'Goal counts follow a bivariate Poisson with the Dixon-Coles low-score correction. Team strengths α and δ are fit by weighted MLE on ',
    cardModelBodyB: '~6,600 top-tier international matches',
    cardModelBodyC: ' since 2014. A per-confederation scalar (Phase 9B.2) corrects the cross-confederation bias that surfaced in the raw 9B fit.',
    cardModelLink: 'docs/19b · confed extension',
    cardLimitsKicker: 'Limitations',
    cardLimitsTitle: 'Where it breaks',
    limitHostBold: 'Host nations are under-rated.',
    limitHostBody:
      ' All tournament matches are modelled neutral; USA, Mexico, and Canada on home soil likely gain ~2–4 pp of title probability.',
    limitSampleBold: 'Cross-confederation sample is modest.',
    limitSampleBody:
      ' 1,026 intercontinental matches by 2018 — trust the ordering, not the decimals.',
    limitDebutantsBold: 'Weak-data debutants.',
    limitDebutantsBody:
      ' Curaçao and Cape Verde sit close to the ridge prior; carry larger uncertainty than the point estimate suggests.',
    cardLimitsLink: 'docs/20 · simulator + caveats',
    cardBracketKicker: 'The bracket',
    cardBracketTitle: 'Representative, not authoritative',
    cardBracketBodyA: "The simulator's knockout tree is a plausible 32-team structure with placeholder pairings — it is ",
    cardBracketBodyB: 'not',
    cardBracketBodyC: ' the published 2026 bracket. Replacing R32 pairings is a one-array edit; the downstream tree (R16 → Final) holds.',
    cardBracketLink: 'docs/20 §4.4 · placeholder bracket',
  },
};

const es: typeof en = {
  toggle: {
    ariaLabel: 'Idioma',
    en: 'EN',
    es: 'ES',
  },
  masthead: {
    kicker: 'Panel de probabilidades · v0.1',
    homeAriaLabel: 'inicio',
  },
  nav: {
    ariaLabel: 'Vistas del torneo',
    titleProbs: 'Probabilidad de título',
    groups: 'Grupos',
    bracket: 'Cuadro',
  },
  footer: {
    independenceLabel: 'Declaración de independencia',
    projectLabel: 'Proyecto',
    model: (v: string): string => `Modelo ${v}`,
  },
  home: {
    docTitle: 'Probabilidad de título · Global Football 2026 Predictor',
    kickerChip: 'Predicción previa al torneo',
    runMeta: (date: string): string => `Ejecutado ${date} UTC`,
    mcPasses: (n: string): string => `${n} simulaciones Monte Carlo`,
    seed: (s: number): string => `Semilla ${s}`,
    headlineLine1: '¿Quién levanta el trofeo en el',
    headlineLine2: 'torneo de 2026?',
    sub: (n: string): { intro: string; n: string; emphasis: string; tail: string } => ({
      intro: 'Un simulador Monte Carlo fuera de línea recorre todo el cuadro eliminatorio ',
      n,
      emphasis: ' probabilidades',
      tail:
        ' veces usando un modelo Dixon-Coles para selecciones con una corrección de fuerza por confederación. Estos números son',
    }),
    subTail:
      ', no pronósticos — al recargar la página, la misma semilla cuenta la misma historia.',
    statRunModel: 'Modelo',
    statRunModelValue: 'Confed DC',
    statRunModelFoot: 'Fase 9B.2',
    statTeamsModelled: 'Selecciones',
    statTeamsModelledFoot: '12 grupos × 4',
    statSumTitle: 'Σ P(título)',
    statSumTitleFoot: 'Comprobación',
    sectionTopOrd: '01',
    sectionTopKicker: 'Candidatas al título',
    sectionTopTitle: 'Top seis por probabilidad de título',
    sectionTableOrd: '02',
    sectionTableKicker: 'Puestos 7 — 48',
    sectionTableTitle: 'Tabla completa de probabilidades',
    sectionMethodologyOrd: '03',
    sectionMethodologyKicker: 'Metodología',
    sectionMethodologyTitle: 'Cómo funciona (y dónde falla)',
    rank: (n: string): string => `Puesto ${n}`,
    group: (g: string): string => `Grupo ${g}`,
    pTitleLabel: 'P(título)',
    colNumber: '#',
    colTeam: 'Selección',
    colConf: 'Conf',
    colGroup: 'Gpo',
    colRoundByRound: 'Por rondas',
    colR16: 'R16',
    colQF: 'QF',
    colSF: 'SF',
    colF: 'F',
    colTitle: 'Título',
    shortR16: 'R16',
    shortQF: 'QF',
    shortSF: 'SF',
    shortF: 'F',
    shortW: 'C',
    tableCaption:
      'Las 48 selecciones ordenadas por probabilidad de ganar el título.',
    teamRoundByRoundAria: (team: string): string => `${team} por rondas`,
  },
  groups: {
    docTitle: 'Fase de grupos · Global Football 2026 Predictor',
    kickerChip: 'Fase de grupos',
    meta: (n: number): string => `${n} grupos · 4 selecciones · 6 partidos cada uno`,
    metaAdvance: 'Los 2 primeros + los 8 mejores terceros clasifican',
    headline: 'Avance en la fase de grupos',
    sub: (n: string): string =>
      `Para cada uno de los 12 grupos, la probabilidad de que cada selección termine 1.º, 2.º, 3.º o 4.º en ${n} simulaciones Monte Carlo. Verde para el 1.º, amarillo para el 2.º, melocotón para el 3.º, hueso para el 4.º.`,
    groupLabelKicker: 'Grupo',
    advHeader: 'Prob. clasif.',
    advBadge: (p: string): string => `Clasif. ${p}`,
    pos1st: '1.º',
    pos2nd: '2.º',
    pos3rd: '3.º',
    pos4th: '4.º',
    aria: (team: string, p1: string, p2: string, p3: string, p4: string): string =>
      `${team} — 1.º ${p1}, 2.º ${p2}, 3.º ${p3}, 4.º ${p4}`,
  },
  bracket: {
    docTitle: 'Cuadro · Global Football 2026 Predictor',
    kickerChip: 'Fase eliminatoria',
    meta: 'R32 → R16 → QF → SF → Final',
    headline: 'Cuadro eliminatorio',
    sub:
      'Un cuadro eliminatorio representativo de 32 selecciones. Las casillas de R32 muestran de dónde viene cada par, más la selección con mayor probabilidad de ocupar los puestos de ganador o segundo. Los puestos de mejor tercero no se asignan a una selección porque el simulador no registra la asignación de terceros por casilla — solo que 8 de los 12 terceros clasifican.',
    placeholderBold: 'Emparejamientos provisionales.',
    placeholderBody:
      'Estructura eliminatoria representativa, no los emparejamientos publicados para 2026. Véase docs/20 §4.4.',
    leaderHeadline: 'Quién clasifica a cada ronda',
    reachR16: 'Llega a octavos',
    reachQF: 'Llega a cuartos',
    reachSF: 'Llega a semis',
    reachFinal: 'Llega a la final',
    winTitle: 'Gana el título',
    treeHeadline: 'Cuadro',
    treeMeta: '16 → 8 → 4 → 2 → 1',
    colR32: 'Dieciseisavos de final',
    colR16: 'Octavos de final',
    colQF: 'Cuartos de final',
    colSF: 'Semifinal',
    colFinal: 'Final',
    winnerGroup: (g: string): string => `Ganador Grupo ${g}`,
    runnerUpGroup: (g: string): string => `Segundo Grupo ${g}`,
    bestThird: (n: number): string => `Mejor tercero #${n}`,
    r32Cell: (n: string): string => `R32 · P${n}`,
    roundCell: (round: string, n: string): string => `${round} · P${n}`,
    winnerFeed: (round: string, n: string): string => `Ganador ${round}·${n}`,
    vs: 'vs',
    columnCountAria: (label: string, n: number): string => `${label}: ${n} partidos`,
  },
  methodology: {
    cardModelKicker: 'El modelo',
    cardModelTitle: 'Dixon-Coles + fuerza por confederación',
    cardModelBodyA:
      'Los goles siguen una distribución de Poisson bivariada con la corrección Dixon-Coles para marcadores bajos. Las fuerzas α y δ de cada selección se ajustan por MLE ponderado sobre ',
    cardModelBodyB: '~6.600 partidos internacionales de élite',
    cardModelBodyC:
      ' desde 2014. Un escalar por confederación (Fase 9B.2) corrige el sesgo entre confederaciones que apareció en el ajuste 9B base.',
    cardModelLink: 'docs/19b · extensión de confederaciones',
    cardLimitsKicker: 'Limitaciones',
    cardLimitsTitle: 'Dónde falla',
    limitHostBold: 'Las anfitrionas están infravaloradas.',
    limitHostBody:
      ' Todos los partidos del torneo se modelan como neutrales; Estados Unidos, México y Canadá jugando en casa probablemente ganan ~2–4 pp de probabilidad de título.',
    limitSampleBold: 'La muestra entre confederaciones es limitada.',
    limitSampleBody:
      ' 1.026 partidos intercontinentales hasta 2018 — fíate del orden, no de los decimales.',
    limitDebutantsBold: 'Debutantes con pocos datos.',
    limitDebutantsBody:
      ' Curazao y Cabo Verde se mantienen cerca del prior de ridge; arrastran más incertidumbre de la que sugiere el valor puntual.',
    cardLimitsLink: 'docs/20 · simulador + advertencias',
    cardBracketKicker: 'El cuadro',
    cardBracketTitle: 'Representativo, no definitivo',
    cardBracketBodyA:
      'El cuadro eliminatorio del simulador es una estructura plausible de 32 selecciones con emparejamientos provisionales — ',
    cardBracketBodyB: 'no',
    cardBracketBodyC:
      ' es el cuadro publicado para 2026. Reemplazar los emparejamientos R32 es una edición en un solo array; el resto del cuadro (R16 → Final) no cambia.',
    cardBracketLink: 'docs/20 §4.4 · cuadro provisional',
  },
};

export const DICT: Readonly<Record<Lang, typeof en>> = { en, es };

/** Resolve the dictionary for a given language. */
export function t(lang: Lang): typeof en {
  return DICT[lang];
}
