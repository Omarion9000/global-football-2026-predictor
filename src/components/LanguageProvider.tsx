'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { LANG_COOKIE, type Lang } from '@/i18n/dictionary';

// =============================================================================
// LanguageProvider — Phase 9D.1
// =============================================================================
// Client-side language context. The initial language is resolved server-side
// (in src/app/layout.tsx) by reading the `lang` cookie via `next/headers`, so
// the first HTML payload already carries the user's preferred language and
// there is no English-flash on second visits.
//
// Toggling rewrites the cookie on the client. The cookie is plain HTTP-readable
// (no auth payload, no PII) and is persisted for one year.
// LANG_COOKIE lives in the server-safe `@/i18n/dictionary` module so server
// components can import it without `use client` boundary quirks.
// =============================================================================

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year

type LanguageContextValue = {
  lang: Lang;
  setLang: (next: Lang) => void;
};

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'en',
  setLang: () => {},
});

export function LanguageProvider({
  initialLang,
  children,
}: {
  readonly initialLang: Lang;
  readonly children: ReactNode;
}) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    if (typeof document !== 'undefined') {
      document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
    }
  }, []);
  return (
    <LanguageContext.Provider value={{ lang, setLang }}>{children}</LanguageContext.Provider>
  );
}

export function useLang(): LanguageContextValue {
  return useContext(LanguageContext);
}
