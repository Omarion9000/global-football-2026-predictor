import type { Metadata } from 'next';
import { Albert_Sans, Fraunces, JetBrains_Mono } from 'next/font/google';
import './globals.css';

// Phase 9D broadcast-pastel typography pairing.
// Display: Fraunces (variable serif by Undercase Type) — editorial weight,
//   slight optical-size axis at large sizes for the lower-third feel.
// Body: Albert Sans (variable humanist sans by Tipo Pèdone) — modern,
//   distinct, generous x-height for stats.
// Mono: JetBrains Mono — tabular figures for the broadcast scorebox.
const fontDisplay = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  axes: ['opsz', 'SOFT'],
});

const fontSans = Albert_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

const fontMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500', '600'],
  display: 'swap',
});

// Public branding per docs/01_PRODUCT_BRIEF.md §9 and docs/04 §3.6.
// Restricted tournament marks must not appear in title, description, or any
// metadata field consumed by social previews / OpenGraph.
export const metadata: Metadata = {
  title: 'Global Football 2026 Predictor',
  description:
    'Independent football probability dashboard for the 2026 international tournament. Probability-based match predictions powered by statistical simulations.',
  openGraph: {
    title: 'Global Football 2026 Predictor',
    description:
      'Independent football probability dashboard for the 2026 international tournament.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const fontVars = `${fontDisplay.variable} ${fontSans.variable} ${fontMono.variable}`;
  return (
    <html lang="en" className={fontVars}>
      <body className="bp-page min-h-screen bg-background font-sans text-text-primary">
        {children}
      </body>
    </html>
  );
}
