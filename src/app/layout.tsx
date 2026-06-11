import type { Metadata } from 'next';
import './globals.css';

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
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-text-primary font-sans">
        {children}
      </body>
    </html>
  );
}
