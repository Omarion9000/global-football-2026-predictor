import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'World Cup 2026 Predictor',
  description:
    'Probability-based match predictions powered by statistical simulations. Independent analytical project, not affiliated with FIFA or any federation.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-text-primary font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
