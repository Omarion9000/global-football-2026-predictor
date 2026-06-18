import type { Config } from 'tailwindcss';

// Warm tournament palette per docs/07_DESIGN_SYSTEM.md §2.
// Bumping any value here requires an explicit token-set bump and a matching
// update to src/app/globals.css :root variables.
//
// Phase 9D adds the broadcast-pastel scale (`bp-*`) used by the World Cup
// simulator UI: bone-cream surfaces, deep warm ink, calm pastel accents and
// per-confederation colour tags. The legacy warm-tournament tokens remain so
// existing components (MatchCard, HeroStats, etc.) keep rendering until/if
// they are migrated.
const config: Config = {
  content: ['./src/**/*.{ts,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        background: '#F4ECDC',
        surface: '#FFFFFF',
        'surface-muted': '#FFF8E7',
        'surface-strong': '#F2E6C9',
        border: '#E7DCC8',
        'text-primary': '#2A1F1A',
        'text-secondary': '#6B5A4B',
        'accent-gold': '#D6A84F',
        'accent-red': '#C2410C',
        'accent-green': '#166534',
        'accent-blue': '#2563EB',
        success: '#15803D',
        warning: '#D97706',
        danger: '#DC2626',

        // ── Broadcast-pastel (Phase 9D) ─────────────────────────────────
        // Surfaces — bone / cream / paper, warm not cold.
        'bp-bone': '#F4ECDC',
        'bp-cream': '#FBF6EA',
        'bp-paper': '#FFFDF7',
        'bp-shell': '#EFE3CB',
        'bp-hairline': '#E5D8BD',
        // Ink — deep warm tones, no hard black.
        'bp-ink': '#2A1F1A',
        'bp-ink-soft': '#6B5A4B',
        'bp-ink-mute': '#9C8F80',
        // Pastel accents — calm, slightly desaturated.
        'bp-peach': '#F4A98C',
        'bp-peach-deep': '#D9866A',
        'bp-sage': '#9DB89A',
        'bp-sage-deep': '#6F9079',
        'bp-sky': '#9DC0DC',
        'bp-sky-deep': '#6E9DBE',
        'bp-butter': '#F2D58A',
        'bp-butter-deep': '#D9B05A',
        'bp-lavender': '#C3B1D6',
        'bp-rose': '#E5A8B0',
        // Confederation tints (used for tag pills + flag bands).
        'bp-conf-uefa': '#9DC0DC',
        'bp-conf-conmebol': '#F2D58A',
        'bp-conf-caf': '#9DB89A',
        'bp-conf-concacaf': '#F4A98C',
        'bp-conf-afc': '#C3B1D6',
        'bp-conf-ofc': '#E5A8B0',
      },
      fontFamily: {
        // Body sans — Albert Sans via next/font. Distinctive humanist.
        sans: [
          'var(--font-sans)',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Helvetica',
          'sans-serif',
        ],
        // Display serif — Fraunces variable via next/font. Editorial weight
        // for the broadcast lower-third / scorebox feel.
        display: [
          'var(--font-display)',
          'ui-serif',
          'Georgia',
          'serif',
        ],
        mono: [
          'var(--font-mono)',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Consolas',
          'monospace',
        ],
      },
      fontSize: {
        xs: ['12px', { lineHeight: '16px' }],
        sm: ['14px', { lineHeight: '20px' }],
        base: ['16px', { lineHeight: '24px' }],
        lg: ['18px', { lineHeight: '28px' }],
        xl: ['22px', { lineHeight: '32px' }],
        '2xl': ['28px', { lineHeight: '36px' }],
        '3xl': ['40px', { lineHeight: '48px' }],
        '4xl': ['56px', { lineHeight: '60px' }],
        '5xl': ['72px', { lineHeight: '76px' }],
      },
      letterSpacing: {
        'broadcast-tight': '-0.022em',
        'broadcast-wider': '0.18em',
      },
      spacing: {
        '1': '4px',
        '2': '8px',
        '3': '12px',
        '4': '16px',
        '6': '24px',
        '8': '32px',
        '12': '48px',
        '16': '64px',
      },
      borderRadius: {
        sm: '6px',
        md: '12px',
        lg: '20px',
        xl: '28px',
        '2xl': '40px',
      },
      transitionDuration: {
        DEFAULT: '150ms',
        layout: '250ms',
        foil: '400ms',
      },
      transitionTimingFunction: {
        DEFAULT: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      },
      boxShadow: {
        card: '0 1px 2px rgba(28, 25, 23, 0.04), 0 4px 12px rgba(28, 25, 23, 0.06)',
        'card-hover': '0 2px 6px rgba(28, 25, 23, 0.08), 0 12px 32px rgba(28, 25, 23, 0.12)',
        'card-foil':
          'inset 0 0 0 1px rgba(214, 168, 79, 0.32), 0 1px 2px rgba(28, 25, 23, 0.04), 0 4px 14px rgba(28, 25, 23, 0.07)',
        'card-foil-hover':
          'inset 0 0 0 1px rgba(214, 168, 79, 0.55), 0 2px 6px rgba(28, 25, 23, 0.1), 0 14px 36px rgba(28, 25, 23, 0.14)',
        panel:
          'inset 0 1px 0 rgba(255, 255, 255, 0.6), 0 1px 2px rgba(28, 25, 23, 0.05), 0 6px 18px rgba(28, 25, 23, 0.08)',
        // Broadcast-pastel: softer, warmer drop, slight inner highlight.
        'bp-panel':
          'inset 0 1px 0 rgba(255, 253, 247, 0.85), 0 1px 1px rgba(42, 31, 26, 0.04), 0 10px 28px rgba(42, 31, 26, 0.07)',
        'bp-panel-hover':
          'inset 0 1px 0 rgba(255, 253, 247, 0.95), 0 2px 4px rgba(42, 31, 26, 0.07), 0 18px 42px rgba(42, 31, 26, 0.12)',
        'bp-chip': '0 1px 0 rgba(255, 253, 247, 0.9), 0 1px 2px rgba(42, 31, 26, 0.08)',
      },
      backgroundImage: {
        paper:
          'radial-gradient(at 20% 18%, rgba(214, 168, 79, 0.05), transparent 55%),' +
          ' radial-gradient(at 80% 82%, rgba(194, 65, 12, 0.045), transparent 55%),' +
          ' radial-gradient(at 60% 30%, rgba(255, 248, 231, 0.6), transparent 60%)',
        // Broadcast atmospherics — soft pastel washes for the page backdrop
        // and large panels. Composited radial gradients, no SVG.
        'bp-backdrop':
          'radial-gradient(at 12% 8%, rgba(157, 192, 220, 0.18), transparent 55%),' +
          ' radial-gradient(at 88% 6%, rgba(242, 213, 138, 0.16), transparent 55%),' +
          ' radial-gradient(at 72% 92%, rgba(157, 184, 154, 0.14), transparent 60%),' +
          ' radial-gradient(at 22% 92%, rgba(244, 169, 140, 0.12), transparent 60%)',
        'bp-panel-wash':
          'radial-gradient(at 8% 0%, rgba(255, 253, 247, 0.92), transparent 60%),' +
          ' radial-gradient(at 96% 100%, rgba(242, 213, 138, 0.08), transparent 60%)',
      },
    },
  },
  plugins: [],
};

export default config;
