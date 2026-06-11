import { beforeAll, describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import HomePage from '../page';
import MatchDetailPage from '../matches/[fixtureId]/page';
import { getDemoFixtures } from '@/lib/data/demoPredictions';
import { PUBLIC_PRODUCT_NAME } from '@/components';

describe('HomePage', () => {
  // HomePage is an async Server Component (Phase 7F): it awaits the read model
  // before returning a React element. Resolve once and reuse across assertions.
  let html: string;
  beforeAll(async () => {
    const element = await HomePage();
    html = renderToString(element);
  });

  it('renders the public product name in the masthead and the hero', () => {
    expect(PUBLIC_PRODUCT_NAME).toBe('Global Football 2026 Predictor');
    expect(html).toContain(PUBLIC_PRODUCT_NAME);
  });

  it('renders the independence disclaimer', () => {
    expect(html).toMatch(/Independent analytical project/);
    expect(html).toMatch(/Not affiliated with FIFA/);
    expect(html).toMatch(/Predictions are probabilistic estimates/);
  });

  it('renders the FeaturedMatchPanel right column with the Next kickoff label and CTA', () => {
    expect(html).toMatch(/Next kickoff/);
    expect(html).toMatch(/View match center/);
  });

  it('renders hero stats pills (Demo fixtures, Prediction snapshots, Model version)', () => {
    expect(html).toMatch(/Demo fixtures/);
    expect(html).toMatch(/Prediction snapshots/);
    expect(html).toMatch(/Model version/);
  });

  it('renders match cards with the clickable "View match center" CTA', () => {
    // There are at least 4 demo fixtures. Each MatchCard plus the featured
    // panel renders the CTA, so the total count should be >= 5.
    const ctaCount = (html.match(/View match center/g) ?? []).length;
    expect(ctaCount).toBeGreaterThanOrEqual(5);
  });

  it('renders at least one match card with team names from the mock set', () => {
    expect(html).toMatch(/Aurelia/);
    expect(html).toMatch(/Bellatrix/);
  });

  it('renders the placeholder colour-band flags (inline SVG, not real flag assets)', () => {
    expect(html).toContain('<svg');
    expect(html).toContain('<rect');
    expect(html).not.toContain('.svg"');
    expect(html).not.toMatch(/<img\b/);
  });

  it('uses the safer descriptor "2026 international tournament" in body copy', () => {
    expect(html).toMatch(/2026 international tournament/);
  });

  it('uses the clean kickoff format ("Thu, Jun 11 · 20:00 GMT" etc.)', () => {
    expect(html).toMatch(/Thu, Jun 11/);
    expect(html).toMatch(/\d{2}:\d{2} GMT/);
  });

  it('renders no restricted tournament marks in the output', () => {
    expect(html).not.toMatch(/\bWorld Cup\b/);
    expect(html).not.toMatch(/\bMundial\b/);
    expect(html).not.toMatch(/\bFIFA World Cup\b/);
  });
});

describe('MatchDetailPage', () => {
  const fixture = getDemoFixtures()[0];

  it('renders teams, venue, probability bar, scoreline table, and timeline', async () => {
    const params = Promise.resolve({ fixtureId: fixture.id });
    const element = await MatchDetailPage({ params });
    const html = renderToString(element);

    expect(html).toMatch(/Headline probabilities/);
    expect(html).toMatch(/Top scorelines/);
    expect(html).toMatch(/Prediction timeline/);
    expect(html).toMatch(/Expected goals/);
    expect(html).toMatch(/Independent analytical project/);
    expect(html).toMatch(/Not affiliated with FIFA/);
    expect(html).toContain(PUBLIC_PRODUCT_NAME);
    expect(html).toContain(fixture.venue.venueName);
    expect(html).not.toMatch(/\bWorld Cup\b/);
  });

  it('uses humanized warning copy, not the raw engine string', async () => {
    // The T_ZERO snapshot warns about missing lineup data. Assert the
    // humanized copy is rendered AND the raw implementation-looking string
    // (lineupAvailable=false) is NOT surfaced.
    const params = Promise.resolve({ fixtureId: fixture.id });
    const html = renderToString(await MatchDetailPage({ params }));
    expect(html).toMatch(/Lineup data unavailable|Starting lineups/);
    expect(html).not.toMatch(/lineupAvailable=false/);
  });

  it('formats the kickoff using the clean GMT format', async () => {
    const params = Promise.resolve({ fixtureId: fixture.id });
    const html = renderToString(await MatchDetailPage({ params }));
    expect(html).toMatch(
      /[A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2} · \d{2}:\d{2} GMT/,
    );
  });
});
