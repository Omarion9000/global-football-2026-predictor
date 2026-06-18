'use client';

import { SUPPORTED_LANGS, t, type Lang } from '@/i18n/dictionary';
import { useLang } from './LanguageProvider';
import type { ReactElement } from 'react';

/** EN / ES segmented control. Lives in the masthead. Matches the broadcast-
 *  pastel pill/chip style of `TournamentNav`. Active button uses bp-ink fill,
 *  inactive buttons sit on the bp-cream pill background. */
export function LanguageToggle(): ReactElement {
  const { lang, setLang } = useLang();
  const dict = t(lang);
  return (
    <div
      role="group"
      aria-label={dict.toggle.ariaLabel}
      className="inline-flex items-center rounded-full border border-bp-hairline/70 bg-bp-cream p-0.5 shadow-bp-chip"
    >
      {SUPPORTED_LANGS.map((l: Lang) => {
        const active = lang === l;
        return (
          <button
            key={l}
            type="button"
            onClick={() => setLang(l)}
            aria-pressed={active}
            aria-label={l === 'en' ? 'English' : 'Español'}
            className={[
              'rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-broadcast-wider transition-colors',
              active
                ? 'bg-bp-ink text-bp-paper shadow-bp-chip'
                : 'text-bp-ink-soft hover:text-bp-ink',
            ].join(' ')}
          >
            {dict.toggle[l]}
          </button>
        );
      })}
    </div>
  );
}
