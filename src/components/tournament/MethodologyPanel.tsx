'use client';

import type { ReactElement, ReactNode } from 'react';
import { useLang } from '@/components/LanguageProvider';
import { t } from '@/i18n/dictionary';

const REPO = 'https://github.com/Omarion9000/global-football-2026-predictor/blob/main';

/** Surface the honest caveats from docs/19, 19b, and 20 directly in-UI.
 *  Each row is a single bullet that names the limitation and where to read
 *  more, so the user is not asked to take the numbers on faith. */
export function MethodologyPanel(): ReactElement {
  const { lang } = useLang();
  const d = t(lang).methodology;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card
        kicker={d.cardModelKicker}
        title={d.cardModelTitle}
        body={
          <>
            {d.cardModelBodyA}
            <span className="font-mono text-bp-ink">{d.cardModelBodyB}</span>
            {d.cardModelBodyC}
          </>
        }
        link={{ href: `${REPO}/docs/19b_NATIONAL_MODEL_CONFED.md`, label: d.cardModelLink }}
        tint="sky"
      />
      <Card
        kicker={d.cardLimitsKicker}
        title={d.cardLimitsTitle}
        body={
          <ul className="space-y-2">
            <li>
              <strong className="font-semibold text-bp-ink">{d.limitHostBold}</strong>
              {d.limitHostBody}
            </li>
            <li>
              <strong className="font-semibold text-bp-ink">{d.limitSampleBold}</strong>
              {d.limitSampleBody}
            </li>
            <li>
              <strong className="font-semibold text-bp-ink">{d.limitDebutantsBold}</strong>
              {d.limitDebutantsBody}
            </li>
          </ul>
        }
        link={{ href: `${REPO}/docs/20_TOURNAMENT_SIMULATOR.md`, label: d.cardLimitsLink }}
        tint="peach"
      />
      <Card
        kicker={d.cardBracketKicker}
        title={d.cardBracketTitle}
        body={
          <>
            {d.cardBracketBodyA}
            <em className="not-italic font-medium text-bp-ink">{d.cardBracketBodyB}</em>
            {d.cardBracketBodyC}
          </>
        }
        link={{ href: `${REPO}/docs/20_TOURNAMENT_SIMULATOR.md`, label: d.cardBracketLink }}
        tint="sage"
      />
    </div>
  );
}

function Card({
  kicker,
  title,
  body,
  link,
  tint,
}: {
  kicker: string;
  title: string;
  body: ReactNode;
  link: { href: string; label: string };
  tint: 'sky' | 'peach' | 'sage';
}): ReactElement {
  const tintClass =
    tint === 'sky'
      ? 'before:bg-bp-sky/30'
      : tint === 'peach'
        ? 'before:bg-bp-peach/30'
        : 'before:bg-bp-sage/30';
  return (
    <article
      className={[
        'relative overflow-hidden rounded-2xl border border-bp-hairline/60 bg-bp-paper p-5 shadow-bp-panel',
        'before:pointer-events-none before:absolute before:-top-12 before:right-[-30%] before:h-40 before:w-40 before:rounded-full before:blur-3xl',
        tintClass,
      ].join(' ')}
    >
      <div className="font-mono text-[10px] uppercase tracking-broadcast-wider text-bp-ink-mute">{kicker}</div>
      <h3 className="mt-1 font-display text-xl text-bp-ink">{title}</h3>
      <div className="mt-3 text-sm leading-relaxed text-bp-ink-soft">{body}</div>
      <a
        href={link.href}
        target="_blank"
        rel="noreferrer"
        className="mt-4 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-broadcast-wider text-bp-sky-deep hover:text-bp-ink"
      >
        {link.label} <span aria-hidden="true">→</span>
      </a>
    </article>
  );
}
