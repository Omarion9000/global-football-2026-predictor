import Link from 'next/link';
import { Disclosure } from './Disclosure';

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
  return (
    <div className="flex min-h-screen flex-col bg-background text-text-primary">
      <header className="border-b border-surface-strong bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <Link
            href="/"
            className="group flex items-center gap-3 rounded-sm focus:outline-none"
            aria-label={`${PUBLIC_PRODUCT_NAME} — home`}
          >
            <span
              aria-hidden="true"
              className="inline-block h-9 w-9 rounded-md bg-gradient-to-br from-accent-gold via-accent-red to-accent-green shadow-panel"
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

      <footer className="mt-16 border-t-2 border-surface-strong bg-surface">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-10 sm:grid-cols-[1.7fr_1fr]">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-accent-gold">
              Independence statement
            </p>
            <div className="mt-3">
              <Disclosure />
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:items-end sm:text-right">
            <span className="font-mono text-[10px] uppercase tracking-widest text-text-secondary">
              Project
            </span>
            <span className="text-sm font-semibold text-text-primary">
              {PUBLIC_PRODUCT_NAME}
            </span>
            {modelVersion ? (
              <span className="inline-flex items-center gap-2 rounded-sm border border-surface-strong bg-surface-muted px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-text-secondary">
                Model {modelVersion}
              </span>
            ) : null}
          </div>
        </div>
      </footer>
    </div>
  );
}
