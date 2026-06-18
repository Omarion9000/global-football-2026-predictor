import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { Albert_Sans, Fraunces, JetBrains_Mono } from 'next/font/google';
import { LanguageProvider } from '@/components/LanguageProvider';
import { LANG_COOKIE, resolveLang } from '@/i18n/dictionary';
import './globals.css';

// Phase 9D broadcast-pastel typography pairing.
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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.ReactElement> {
  const cookieStore = await cookies();
  const lang = resolveLang(cookieStore.get(LANG_COOKIE)?.value);
  const fontVars = `${fontDisplay.variable} ${fontSans.variable} ${fontMono.variable}`;
  return (
    <html lang={lang} className={fontVars}>
      <body className="bp-page min-h-screen bg-background font-sans text-text-primary">
        <LanguageProvider initialLang={lang}>{children}</LanguageProvider>
      </body>
    </html>
  );
}
