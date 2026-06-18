'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactElement } from 'react';
import { useLang } from '../LanguageProvider';
import { t } from '@/i18n/dictionary';

export function TournamentNav(): ReactElement {
  const pathname = usePathname() ?? '/';
  const { lang } = useLang();
  const dict = t(lang);
  const items = [
    { href: '/', label: dict.nav.titleProbs, ord: '01' },
    { href: '/groups', label: dict.nav.groups, ord: '02' },
    { href: '/bracket', label: dict.nav.bracket, ord: '03' },
  ];
  return (
    <nav className="flex items-center gap-1" aria-label={dict.nav.ariaLabel}>
      {items.map((item) => {
        const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={[
              'group inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition-colors',
              active
                ? 'bg-bp-ink text-bp-paper shadow-bp-chip'
                : 'text-bp-ink-soft hover:bg-bp-cream hover:text-bp-ink',
            ].join(' ')}
          >
            <span
              aria-hidden="true"
              className={[
                'font-mono text-[9px] tracking-broadcast-wider',
                active ? 'text-bp-butter' : 'text-bp-ink-mute',
              ].join(' ')}
            >
              {item.ord}
            </span>
            <span className="font-medium">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
