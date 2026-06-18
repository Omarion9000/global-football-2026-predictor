import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import HomePage from '../page';
import GroupsPage from '../groups/page';
import BracketPage from '../bracket/page';
import { PUBLIC_PRODUCT_NAME } from '@/components';
import { getTournamentSim } from '@/data/loadTournamentSim';

// Phase 9D: the demo fixture pages have been replaced by the simulator-backed
// title-odds, groups, and bracket views. These tests assert the new pages
// render the simulator JSON without crashing and surface the public copy +
// independence disclaimer the policy requires.

describe('HomePage (title odds)', () => {
  const html = renderToString(HomePage());

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
    expect(html).toMatch(/Pre-tournament prediction/);
    expect(html).toMatch(/Monte Carlo passes/);
    expect(html).toMatch(/Seed/);
  });

  it('renders the top six teams from the simulator JSON', () => {
    const sim = getTournamentSim();
    const top6 = sim.teams.slice(0, 6);
    for (const team of top6) {
      expect(html).toContain(team.displayName);
    }
  });

  it('renders flag-icons for every team in the table', () => {
    const sim = getTournamentSim();
    // Each row uses `fi fi-{iso2}` — verify the chip for a few distinct rows.
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
    expect(html).toMatch(/Host nations/);
    expect(html).toMatch(/Representative, not authoritative/);
  });

  it('renders no restricted tournament marks in the body', () => {
    expect(html).not.toMatch(/\bWorld Cup\b/);
    expect(html).not.toMatch(/\bMundial\b/);
    expect(html).not.toMatch(/\bFIFA World Cup\b/);
  });
});

describe('GroupsPage', () => {
  const html = renderToString(GroupsPage());

  it('renders all 12 group labels', () => {
    for (const g of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']) {
      // Each group panel renders the label in a large display number.
      expect(html).toMatch(new RegExp(`>${g}<`));
    }
  });

  it('renders every team in the tournament', () => {
    const sim = getTournamentSim();
    for (const grp of sim.groups) {
      for (const team of grp.teams) {
        expect(html).toContain(team.displayName);
      }
    }
  });

  it('renders the advancement bar tokens for each team row', () => {
    expect(html).toContain('bp-group-bar');
    // Each row should produce four advancement segments.
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

describe('BracketPage', () => {
  const html = renderToString(BracketPage());

  it('renders the placeholder-pairings caveat prominently', () => {
    expect(html).toMatch(/Placeholder pairings/);
    expect(html).toMatch(/Representative knockout structure/);
  });

  it('renders all five rounds as columns', () => {
    for (const round of ['Round of 32', 'Round of 16', 'Quarter-final', 'Semi-final', 'Final']) {
      expect(html).toContain(round);
    }
  });

  it('renders 16 R32 match labels', () => {
    // The middle-dot character may surface as "·" or as the HTML entity
    // `&#183;` / `&middot;` depending on serializer choices, so allow any
    // short delimiter between "R32" and "M{nn}".
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
