import Link from 'next/link';
import { Disclosure } from './Disclosure';

// Public-facing product name. Defined here as a constant so a single source of
// truth controls every public surface. Test suite asserts this value.
export const PUBLIC_PRODUCT_NAME = 'Global Football 2026 Predictor';

export function AppShell({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="flex min-h-screen flex-col bg-background text-text-primary">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <Link
            href="/"
            className="group flex items-center gap-3 rounded-sm focus:outline-none"
            aria-label={`${PUBLIC_PRODUCT_NAME} — home`}
          >
            <span
              aria-hidden="true"
              className="inline-block h-8 w-8 rounded-md bg-gradient-to-br from-accent-gold to-accent-red shadow-sm"
            />
            <span className="flex flex-col leading-tight">
              <span className="font-mono text-[10px] uppercase tracking-widest text-text-secondary">
                Probability dashboard
              </span>
              <span className="text-sm font-semibold text-text-primary transition-colors group-hover:text-accent-red">
                {PUBLIC_PRODUCT_NAME}
              </span>
            </span>
          </Link>
          <nav className="flex items-center gap-4 text-sm text-text-secondary">
            <Link
              href="/"
              className="rounded-sm transition-colors hover:text-text-primary focus:outline-none"
            >
              Schedule
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="mt-16 border-t border-border bg-surface">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <Disclosure />
          <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-text-secondary">
            {PUBLIC_PRODUCT_NAME}
          </p>
        </div>
      </footer>
    </div>
  );
}
