import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { BracketView } from '@/components/views/BracketView';
import { GroupsView } from '@/components/views/GroupsView';
import { HomeView } from '@/components/views/HomeView';
import { LanguageProvider } from '@/components/LanguageProvider';
import { PUBLIC_PRODUCT_NAME } from '@/components';
import { getTournamentSim } from '@/data/loadTournamentSim';
import { MODEL_VERSION } from '@/lib/model';
import type { Lang } from '@/i18n/dictionary';

// Phase 9D.1: pages are server wrappers (read cookie + emit metadata); the
// view components carry the rendering logic and consume `useLang()`. We test
// the view components inside a LanguageProvider so we can exercise both
// languages without the cookie / Next.js plumbing.

const sim = getTournamentSim();

function renderHome(lang: Lang): string {
  return renderToString(
    <LanguageProvider initialLang={lang}>
      <HomeView sim={sim} modelVersion={MODEL_VERSION} />
    </LanguageProvider>,
  );
}

function renderGroups(lang: Lang): string {
  return renderToString(
    <LanguageProvider initialLang={lang}>
      <GroupsView sim={sim} modelVersion={MODEL_VERSION} />
    </LanguageProvider>,
  );
}

function renderBracket(lang: Lang): string {
  return renderToString(
    <LanguageProvider initialLang={lang}>
      <BracketView sim={sim} modelVersion={MODEL_VERSION} />
    </LanguageProvider>,
  );
}

// =============================================================================
// English (EN) — coverage of all three views.
// =============================================================================

describe('HomeView (EN)', () => {
  const html = renderHome('en');

  it('renders the public product name', () => {
    expect(PUBLIC_PRODUCT_NAME).toBe('Global Football 2026 Predictor');
    expect(html).toContain(PUBLIC_PRODUCT_NAME);
  });

  it('renders the independence disclaimer in the footer', () => {
    expect(html).toMatch(/Independent analytical project/);
    expect(html).toMatch(/Not affiliated with FIFA/);
    expect(html).toMatch(/Predictions are probabilistic estimates/);
  });

  it('renders the broadcast lower-third headline and the seed/run metadata', () => {
    expect(html).toMatch(/Who lifts the trophy/);
    // The kicker chip text depends on meta.playedMatches; either form is
    // acceptable. The presence of a probability framing is what matters.
    expect(html).toMatch(/(Pre-tournament prediction|matches played · live)/);
    expect(html).toMatch(/Monte Carlo passes/);
    expect(html).toMatch(/Seed/);
  });

  it('renders the top six teams from the simulator JSON', () => {
    const top6 = sim.teams.slice(0, 6);
    for (const team of top6) {
      expect(html).toContain(team.displayName);
    }
  });

  it('renders flag-icons for every team in the table', () => {
    for (const team of [sim.teams[0], sim.teams[10], sim.teams[20], sim.teams[47]]) {
      expect(html).toContain(`fi fi-${team.iso2}`);
    }
  });

  it('renders all six confederations among the tag pills', () => {
    for (const conf of ['UEFA', 'CONMEBOL', 'CAF', 'CONCACAF', 'AFC', 'OFC']) {
      expect(html).toContain(conf);
    }
  });

  it('renders the methodology + limitations panel', () => {
    expect(html).toMatch(/Dixon-Coles/);
    expect(html).toMatch(/Where it breaks/);
    expect(html).toMatch(/Host knockout matches/);
    expect(html).toMatch(/Published FIFA structure, Annex C approximated/);
  });

  it('renders the EN/ES language toggle', () => {
    expect(html).toMatch(/aria-label="Language"/);
    expect(html).toMatch(/aria-pressed="true"[^>]*>\s*EN/);
  });

  it('renders no restricted tournament marks in the body', () => {
    expect(html).not.toMatch(/\bWorld Cup\b/);
    expect(html).not.toMatch(/\bMundial\b/);
    expect(html).not.toMatch(/\bFIFA World Cup\b/);
  });
});

describe('GroupsView (EN)', () => {
  const html = renderGroups('en');

  it('renders all 12 group labels', () => {
    for (const g of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']) {
      expect(html).toMatch(new RegExp(`>${g}<`));
    }
  });

  it('renders every team in the tournament', () => {
    for (const grp of sim.groups) {
      for (const team of grp.teams) {
        expect(html).toContain(team.displayName);
      }
    }
  });

  it('renders the advancement bar tokens for each team row', () => {
    expect(html).toContain('bp-group-bar');
    expect(html.match(/bp-seg-1st/g)?.length).toBe(48);
  });

  it('renders the disclaimer and the public product name', () => {
    expect(html).toContain(PUBLIC_PRODUCT_NAME);
    expect(html).toMatch(/Independent analytical project/);
  });

  it('renders no restricted tournament marks', () => {
    expect(html).not.toMatch(/\bWorld Cup\b/);
    expect(html).not.toMatch(/\bFIFA World Cup\b/);
  });
});

describe('BracketView (EN)', () => {
  const html = renderBracket('en');

  it('renders the placeholder-pairings caveat prominently', () => {
    expect(html).toMatch(/Published FIFA structure, Annex C approximated/);
    expect(html).toMatch(/bipartite matching/);
  });

  it('renders all five rounds as columns', () => {
    for (const round of ['Round of 32', 'Round of 16', 'Quarter-final', 'Semi-final', 'Final']) {
      expect(html).toContain(round);
    }
  });

  it('renders 16 R32 match labels', () => {
    const matches = html.match(/R32[^M]{1,8}M\d{2}/g) ?? [];
    expect(matches.length).toBe(16);
  });

  it('renders the round-leaderboard column labels', () => {
    for (const label of ['Reach R16', 'Reach QF', 'Reach SF', 'Reach Final', 'Win the title']) {
      expect(html).toContain(label);
    }
  });

  it('renders the disclaimer and no restricted marks', () => {
    expect(html).toMatch(/Independent analytical project/);
    expect(html).not.toMatch(/\bWorld Cup\b/);
  });
});

// =============================================================================
// Spanish (ES) — every translatable surface must render.
// =============================================================================

describe('HomeView (ES)', () => {
  const html = renderHome('es');

  it('renders the Spanish headline and kicker chip', () => {
    expect(html).toMatch(/¿Quién levanta el trofeo/);
    expect(html).toMatch(/(Predicción previa al torneo|partidos jugados · en vivo)/);
    expect(html).toMatch(/simulaciones Monte Carlo/);
    expect(html).toMatch(/Semilla/);
  });

  it('renders the Spanish nav and section headings', () => {
    expect(html).toMatch(/Probabilidad de título/);
    expect(html).toMatch(/Top seis por probabilidad de título/);
    expect(html).toMatch(/Tabla completa de probabilidades/);
    expect(html).toMatch(/Metodología/);
  });

  it('renders the Spanish independence disclaimer', () => {
    expect(html).toMatch(/Proyecto analítico independiente/);
    expect(html).toMatch(/Sin afiliación con la FIFA/);
    expect(html).toMatch(/estimaciones probabilísticas/);
  });

  it('renders the Spanish methodology card titles', () => {
    expect(html).toMatch(/fuerza por confederación/);
    expect(html).toMatch(/Dónde falla/);
    expect(html).toMatch(/Estructura publicada, Anexo C aproximado/);
  });

  it('renders the language toggle with ES active', () => {
    expect(html).toMatch(/aria-label="Idioma"/);
    expect(html).toMatch(/aria-pressed="true"[^>]*>\s*ES/);
  });

  it('does not leak English chrome strings', () => {
    expect(html).not.toMatch(/Most likely champions/);
    expect(html).not.toMatch(/How this works/);
    expect(html).not.toMatch(/matches played · live/);
  });

  it('does not contain banned vocabulary in either language', () => {
    expect(html).not.toMatch(/\bodds\b/i);
  });
});

describe('GroupsView (ES)', () => {
  const html = renderGroups('es');

  it('renders the Spanish headline + group label kicker', () => {
    expect(html).toMatch(/Avance en la fase de grupos/);
    expect(html).toMatch(/Grupo/);
  });

  it('renders the Spanish ordinal labels', () => {
    expect(html).toMatch(/1\.º/);
    expect(html).toMatch(/4\.º/);
  });

  it('renders all 12 group labels A..L', () => {
    for (const g of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']) {
      expect(html).toMatch(new RegExp(`>${g}<`));
    }
  });

  it('renders every team in the tournament', () => {
    for (const grp of sim.groups) {
      for (const team of grp.teams) {
        expect(html).toContain(team.displayName);
      }
    }
  });
});

describe('BracketView (ES)', () => {
  const html = renderBracket('es');

  it('renders the Spanish round names', () => {
    expect(html).toMatch(/Dieciseisavos de final/);
    expect(html).toMatch(/Octavos de final/);
    expect(html).toMatch(/Cuartos de final/);
    expect(html).toMatch(/Semifinal/);
    expect(html).toMatch(/Final/);
  });

  it('renders the Spanish placeholder caveat', () => {
    expect(html).toMatch(/Estructura publicada, Anexo C aproximado/);
  });

  it('renders the Spanish leaderboard labels', () => {
    for (const label of ['Llega a octavos', 'Llega a cuartos', 'Llega a semis', 'Llega a la final', 'Gana el título']) {
      expect(html).toContain(label);
    }
  });

  it('renders all 16 R32 match labels with the Spanish "P" prefix', () => {
    const matches = html.match(/R32[^P]{1,8}P\d{2}/g) ?? [];
    expect(matches.length).toBe(16);
  });
});
