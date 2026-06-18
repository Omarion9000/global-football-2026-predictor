'use client';

import Link from 'next/link';
import { Disclosure } from './Disclosure';
import { LanguageToggle } from './LanguageToggle';
import { useLang } from './LanguageProvider';
import { TournamentNav } from './tournament/TournamentNav';
import { t } from '@/i18n/dictionary';

// Public-facing product name. Defined here as a constant so a single source of
// truth controls every public surface. Test suite asserts this value.
export const PUBLIC_PRODUCT_NAME = 'Global Football 2026 Predictor';

type AppShellProps = {
  children: React.ReactNode;
  /** Render the model-version pill in the footer. Pages pass MODEL_VERSION. */
  modelVersion?: string;
};

export function AppShell({
  children,
  modelVersion,
}: AppShellProps): React.ReactElement {
  const { lang } = useLang();
  const dict = t(lang);
  return (
    <div className="flex min-h-screen flex-col text-bp-ink">
      <header className="border-b border-bp-hairline/70 bg-bp-paper/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/"
            className="group flex items-center gap-4 rounded-md focus:outline-none"
            aria-label={`${PUBLIC_PRODUCT_NAME} — ${dict.masthead.homeAriaLabel}`}
          >
            <span
              aria-hidden="true"
              className="relative inline-flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-bp-ink shadow-bp-panel"
            >
              <span className="absolute inset-0 bg-gradient-to-br from-bp-sky via-bp-butter to-bp-peach opacity-90" />
              <span className="absolute inset-0 bg-gradient-to-tr from-bp-ink/55 via-transparent to-transparent" />
              <span className="relative font-display text-xl font-semibold text-bp-paper">
                26
              </span>
            </span>
            <span className="flex flex-col leading-tight">
              <span className="font-mono text-[10px] uppercase tracking-broadcast-wider text-bp-ink-mute">
                {dict.masthead.kicker}
              </span>
              <span className="font-display text-xl text-bp-ink transition-colors group-hover:text-bp-sky-deep">
                {PUBLIC_PRODUCT_NAME}
              </span>
            </span>
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <TournamentNav />
            <LanguageToggle />
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="mt-16 border-t border-bp-hairline/70 bg-bp-paper/85 backdrop-blur">
        <div className="mx-auto grid max-w-7xl gap-8 px-6 py-10 sm:grid-cols-[1.7fr_1fr]">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-broadcast-wider text-bp-butter-deep">
              {dict.footer.independenceLabel}
            </p>
            <div className="mt-3">
              <Disclosure />
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:items-end sm:text-right">
            <span className="font-mono text-[10px] uppercase tracking-broadcast-wider text-bp-ink-mute">
              {dict.footer.projectLabel}
            </span>
            <span className="font-display text-lg text-bp-ink">
              {PUBLIC_PRODUCT_NAME}
            </span>
            {modelVersion ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-bp-hairline bg-bp-cream px-3 py-1 font-mono text-[10px] uppercase tracking-broadcast-wider text-bp-ink-soft">
                <span className="h-1.5 w-1.5 rounded-full bg-bp-sage" aria-hidden="true" />
                {dict.footer.model(modelVersion)}
              </span>
            ) : null}
          </div>
        </div>
      </footer>
    </div>
  );
}
