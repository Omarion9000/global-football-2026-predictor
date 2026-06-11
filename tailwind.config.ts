import type { Config } from 'tailwindcss';

// Warm tournament palette per docs/07_DESIGN_SYSTEM.md §2.
// Bumping any value here requires an explicit token-set bump and a matching
// update to src/app/globals.css :root variables.
const config: Config = {
  content: ['./src/**/*.{ts,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        background: '#F7F3EA',
        surface: '#FFFFFF',
        'surface-muted': '#FFF8E7',
        'surface-strong': '#F2E6C9',
        border: '#E7DCC8',
        'text-primary': '#1C1917',
        'text-secondary': '#78716C',
        'accent-gold': '#D6A84F',
        'accent-red': '#C2410C',
        'accent-green': '#166534',
        'accent-blue': '#2563EB',
        success: '#15803D',
        warning: '#D97706',
        danger: '#DC2626',
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
        mono: [
          'JetBrains Mono',
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
      },
    },
  },
  plugins: [],
};

export default config;
