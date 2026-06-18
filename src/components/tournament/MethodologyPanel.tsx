import type { ReactElement } from 'react';

/** Surface the honest caveats from docs/19, 19b, and 20 directly in-UI.
 *  Each row is a single bullet that names the limitation and where to read
 *  more, so the user is not asked to take the numbers on faith. */
export function MethodologyPanel(): ReactElement {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card
        kicker="The model"
        title="Dixon-Coles + confederation strength"
        body={
          <>
            Goal counts follow a bivariate Poisson with the Dixon-Coles low-score
            correction. Team strengths α and δ are fit by weighted MLE on{' '}
            <span className="font-mono text-bp-ink">~6,600 top-tier international matches</span>{' '}
            since 2014. A per-confederation scalar (Phase 9B.2) corrects the
            cross-confederation bias that surfaced in the raw 9B fit.
          </>
        }
        link={{ href: 'https://github.com/Omarion9000/global-football-2026-predictor/blob/main/docs/19b_NATIONAL_MODEL_CONFED.md', label: 'docs/19b · confed extension' }}
        tint="sky"
      />
      <Card
        kicker="Limitations"
        title="Where it breaks"
        body={
          <ul className="space-y-2">
            <li>
              <strong className="font-semibold text-bp-ink">Host nations are under-rated.</strong>{' '}
              All tournament matches are modelled neutral; USA, Mexico, and Canada
              on home soil likely gain ~2–4 pp of title probability.
            </li>
            <li>
              <strong className="font-semibold text-bp-ink">Cross-confederation sample is modest.</strong>{' '}
              1,026 intercontinental matches by 2018 — trust the ordering, not
              the decimals.
            </li>
            <li>
              <strong className="font-semibold text-bp-ink">Weak-data debutants.</strong>{' '}
              Curaçao and Cape Verde sit close to the ridge prior; carry larger
              uncertainty than the point estimate suggests.
            </li>
          </ul>
        }
        link={{ href: 'https://github.com/Omarion9000/global-football-2026-predictor/blob/main/docs/20_TOURNAMENT_SIMULATOR.md', label: 'docs/20 · simulator + caveats' }}
        tint="peach"
      />
      <Card
        kicker="The bracket"
        title="Representative, not authoritative"
        body={
          <>
            The simulator&apos;s knockout tree is a plausible 32-team structure
            with placeholder pairings — it is{' '}
            <em className="not-italic font-medium text-bp-ink">not</em>{' '}
            the published 2026 bracket. Replacing R32 pairings is a one-array
            edit; the downstream tree (R16 → Final) holds.
          </>
        }
        link={{ href: 'https://github.com/Omarion9000/global-football-2026-predictor/blob/main/docs/20_TOURNAMENT_SIMULATOR.md', label: 'docs/20 §4.4 · placeholder bracket' }}
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
  body: React.ReactNode;
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
