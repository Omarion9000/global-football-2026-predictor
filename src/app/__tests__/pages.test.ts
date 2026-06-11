import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import HomePage from '../page';
import MatchDetailPage from '../matches/[fixtureId]/page';
import { getDemoFixtures } from '@/lib/data/demoPredictions';
import { PUBLIC_PRODUCT_NAME } from '@/components';

describe('HomePage', () => {
  const html = renderToString(createElement(HomePage));

  it('renders the public product name in the masthead and the hero', () => {
    expect(PUBLIC_PRODUCT_NAME).toBe('Global Football 2026 Predictor');
    expect(html).toContain(PUBLIC_PRODUCT_NAME);
  });

  it('renders the independence disclaimer', () => {
    expect(html).toMatch(/Independent analytical project/);
    expect(html).toMatch(/Not affiliated with FIFA/);
    expect(html).toMatch(/Predictions are probabilistic estimates/);
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
});
