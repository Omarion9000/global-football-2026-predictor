import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
import { WavingFlag } from '../WavingFlag';

const here = path.dirname(fileURLToPath(import.meta.url));

describe('WavingFlag — placeholder geometric SVG only', () => {
  it('source contains no reference to real flag asset paths', () => {
    const src = readFileSync(
      path.resolve(here, '..', 'WavingFlag.tsx'),
      'utf-8',
    );
    expect(src).not.toMatch(/\bflags\/[A-Za-z]/); // no /flags/BRA.svg etc
    expect(src).not.toMatch(/\.svg["']/);
    expect(src).not.toMatch(/<img\b/i);
  });

  it('renders an inline SVG with rect bands derived from the abstract palette', () => {
    const html = renderToString(
      createElement(WavingFlag, { seed: 'team-aur', label: 'AUR' }),
    );
    expect(html).toContain('<svg');
    expect(html).toContain('<rect');
    expect(html).toContain('AUR');
  });

  it('omits the wave animation class when animate=false (static fallback path)', () => {
    const html = renderToString(
      createElement(WavingFlag, {
        seed: 'team-aur',
        label: 'AUR',
        animate: false,
      }),
    );
    expect(html).not.toContain('flag-wave-band');
  });

  it('applies the wave animation class by default', () => {
    const html = renderToString(
      createElement(WavingFlag, { seed: 'team-aur', label: 'AUR' }),
    );
    expect(html).toContain('flag-wave-band');
  });

  it('palette selection is deterministic per seed', () => {
    const a = renderToString(
      createElement(WavingFlag, { seed: 'team-hel', label: 'HEL' }),
    );
    const b = renderToString(
      createElement(WavingFlag, { seed: 'team-hel', label: 'HEL' }),
    );
    expect(a).toBe(b);
  });
});
