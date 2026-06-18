'use client';

import { AppShell } from '@/components';
import { useLang } from '@/components/LanguageProvider';
import { ConfederationTag } from '@/components/tournament/ConfederationTag';
import { FlagChip } from '@/components/tournament/FlagChip';
import { MethodologyPanel } from '@/components/tournament/MethodologyPanel';
import { ProbabilityStrip } from '@/components/tournament/ProbabilityStrip';
import type { TournamentSimData } from '@/data/tournament-sim.types';
import { t, type Lang } from '@/i18n/dictionary';

function pct(p: number, digits = 1): string {
  return `${(p * 100).toFixed(digits)}%`;
}

function fmtGenerated(iso: string, lang: Lang): string {
  const d = new Date(iso);
  return d.toLocaleString(lang === 'es' ? 'es-ES' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });
}

function fmtN(n: number, lang: Lang): string {
  return n.toLocaleString(lang === 'es' ? 'es-ES' : 'en-GB');
}

function sumTitles(values: ReadonlyArray<number>): number {
  let s = 0;
  for (const v of values) s += v;
  return s;
}

export function HomeView({
  sim,
  modelVersion,
}: {
  readonly sim: TournamentSimData;
  readonly modelVersion: string;
}): React.ReactElement {
  const { lang } = useLang();
  const d = t(lang);
  const top6 = sim.teams.slice(0, 6);
  const rest = sim.teams.slice(6);
  const nStr = fmtN(sim.meta.n, lang);

  return (
    <AppShell modelVersion={modelVersion}>
      <div className="mx-auto max-w-7xl px-6 pb-16 pt-10 sm:pt-14">
        <section
          className="bp-reveal grid gap-10 lg:grid-cols-[1.05fr_0.95fr]"
          style={{ ['--bp-stagger' as string]: '60ms' }}
        >
          <div>
            <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] uppercase tracking-broadcast-wider text-bp-ink-mute">
              <span className="inline-flex items-center gap-2 rounded-full bg-bp-cream px-3 py-1 text-bp-ink-soft shadow-bp-chip">
                <span className="h-1.5 w-1.5 rounded-full bg-bp-peach" aria-hidden="true" />
                {d.home.kickerChip}
              </span>
              <span>{d.home.runMeta(fmtGenerated(sim.meta.generatedAt, lang))}</span>
              <span>·</span>
              <span>{d.home.mcPasses(nStr)}</span>
              <span>·</span>
              <span>{d.home.seed(sim.meta.seed)}</span>
            </div>
            <h1 className="mt-5 font-display text-4xl leading-[1.05] tracking-broadcast-tight text-bp-ink sm:text-5xl">
              {d.home.headlineLine1}
              <br className="hidden sm:block" />
              <span className="bg-gradient-to-r from-bp-sky-deep via-bp-sage-deep to-bp-butter-deep bg-clip-text text-transparent">
                {d.home.headlineLine2}
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-bp-ink-soft">
              {(() => {
                const s = d.home.sub(nStr);
                return (
                  <>
                    {s.intro}
                    <span className="font-mono text-sm text-bp-ink">{s.n}</span>
                    {s.tail}
                    <em className="font-medium not-italic text-bp-ink">{s.emphasis}</em>
                    {d.home.subTail}
                  </>
                );
              })()}
            </p>
          </div>

          <dl className="grid grid-cols-3 gap-3 self-end">
            <StatCell
              kicker={d.home.statRunModel}
              value={d.home.statRunModelValue}
              foot={d.home.statRunModelFoot}
            />
            <StatCell
              kicker={d.home.statTeamsModelled}
              value={`${sim.teams.length}`}
              foot={d.home.statTeamsModelledFoot}
            />
            <StatCell
              kicker={d.home.statSumTitle}
              value={pct(sumTitles(sim.teams.map((t) => t.pTitle)), 2)}
              foot={d.home.statSumTitleFoot}
            />
          </dl>
        </section>

        <section className="mt-12">
          <SectionHeading
            ord={d.home.sectionTopOrd}
            kicker={d.home.sectionTopKicker}
            title={d.home.sectionTopTitle}
          />
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {top6.map((team, i) => (
              <article
                key={team.slug}
                className="bp-reveal group relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-bp-hairline/60 bg-bp-paper p-5 shadow-bp-panel transition-shadow hover:shadow-bp-panel-hover"
                style={{ ['--bp-stagger' as string]: `${120 + i * 70}ms` }}
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-bp-butter/35 blur-2xl group-hover:bg-bp-butter/45"
                />
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-broadcast-wider text-bp-ink-mute">
                    {d.home.rank(String(i + 1).padStart(2, '0'))}
                  </span>
                  <ConfederationTag confederation={team.confederation} />
                </div>
                <div className="flex items-center gap-3">
                  <FlagChip code={team.iso2} displayName={team.displayName} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="font-display text-lg leading-tight text-bp-ink break-words">
                      {team.displayName}
                    </div>
                    <div className="mt-1 font-mono text-[10px] uppercase tracking-broadcast-wider text-bp-ink-mute">
                      {d.home.group(team.group)}
                    </div>
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-broadcast-wider text-bp-ink-mute">
                    {d.home.pTitleLabel}
                  </div>
                  <div className="mt-1 font-display text-4xl tracking-broadcast-tight text-bp-ink">
                    {pct(team.pTitle)}
                  </div>
                </div>
                <div className="space-y-3">
                  <ProbabilityStrip
                    pR16={team.pR16}
                    pQF={team.pQF}
                    pSF={team.pSF}
                    pFinal={team.pFinal}
                    pTitle={team.pTitle}
                    label={d.home.teamRoundByRoundAria(team.displayName)}
                  />
                  <div
                    className="grid grid-cols-5 gap-3 border-t border-bp-hairline/50 pt-3 font-mono"
                    aria-label={d.home.teamRoundByRoundAria(team.displayName)}
                  >
                    <RoundCell label={d.home.shortR16} value={team.pR16} />
                    <RoundCell label={d.home.shortQF} value={team.pQF} />
                    <RoundCell label={d.home.shortSF} value={team.pSF} />
                    <RoundCell label={d.home.shortF} value={team.pFinal} />
                    <RoundCell label={d.home.shortW} value={team.pTitle} accent />
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-14">
          <SectionHeading
            ord={d.home.sectionTableOrd}
            kicker={d.home.sectionTableKicker}
            title={d.home.sectionTableTitle}
          />
          <div className="mt-6 overflow-hidden rounded-2xl border border-bp-hairline/60 bg-bp-paper shadow-bp-panel">
            <table className="min-w-full text-sm">
              <caption className="sr-only">{d.home.tableCaption}</caption>
              <thead>
                <tr className="border-b border-bp-hairline/60 bg-bp-cream/70 text-left font-mono text-[10px] uppercase tracking-broadcast-wider text-bp-ink-soft">
                  <th className="px-4 py-3">{d.home.colNumber}</th>
                  <th className="px-4 py-3">{d.home.colTeam}</th>
                  <th className="px-3 py-3">{d.home.colConf}</th>
                  <th className="px-3 py-3">{d.home.colGroup}</th>
                  <th className="px-4 py-3">{d.home.colRoundByRound}</th>
                  <th className="px-3 py-3 text-right">{d.home.colR16}</th>
                  <th className="px-3 py-3 text-right">{d.home.colQF}</th>
                  <th className="px-3 py-3 text-right">{d.home.colSF}</th>
                  <th className="px-3 py-3 text-right">{d.home.colF}</th>
                  <th className="px-4 py-3 text-right">{d.home.colTitle}</th>
                </tr>
              </thead>
              <tbody>
                {rest.map((team, i) => {
                  const rank = i + 7;
                  return (
                    <tr
                      key={team.slug}
                      className="border-b border-bp-hairline/30 transition-colors last:border-b-0 hover:bg-bp-cream/40"
                    >
                      <td className="px-4 py-3 font-mono text-xs text-bp-ink-mute">
                        {String(rank).padStart(2, '0')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <FlagChip code={team.iso2} displayName={team.displayName} size={22} />
                          <span className="font-display text-base text-bp-ink">{team.displayName}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <ConfederationTag confederation={team.confederation} />
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-bp-ink-soft">{team.group}</td>
                      <td className="px-4 py-3">
                        <div className="min-w-[160px] max-w-[260px]">
                          <ProbabilityStrip
                            pR16={team.pR16}
                            pQF={team.pQF}
                            pSF={team.pSF}
                            pFinal={team.pFinal}
                            pTitle={team.pTitle}
                            label={d.home.teamRoundByRoundAria(team.displayName)}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-xs text-bp-ink-soft">{pct(team.pR16)}</td>
                      <td className="px-3 py-3 text-right font-mono text-xs text-bp-ink-soft">{pct(team.pQF)}</td>
                      <td className="px-3 py-3 text-right font-mono text-xs text-bp-ink-soft">{pct(team.pSF)}</td>
                      <td className="px-3 py-3 text-right font-mono text-xs text-bp-ink-soft">{pct(team.pFinal)}</td>
                      <td className="px-4 py-3 text-right font-mono text-sm font-medium text-bp-ink">{pct(team.pTitle)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-14">
          <SectionHeading
            ord={d.home.sectionMethodologyOrd}
            kicker={d.home.sectionMethodologyKicker}
            title={d.home.sectionMethodologyTitle}
          />
          <div className="mt-6">
            <MethodologyPanel />
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function StatCell({
  kicker,
  value,
  foot,
}: {
  kicker: string;
  value: string;
  foot: string;
}): React.ReactElement {
  return (
    <div className="rounded-2xl border border-bp-hairline/60 bg-bp-paper/85 px-4 py-4 shadow-bp-panel">
      <dt className="font-mono text-[10px] uppercase tracking-broadcast-wider text-bp-ink-mute">{kicker}</dt>
      <dd className="mt-2 font-display text-2xl text-bp-ink">{value}</dd>
      <dd className="mt-1 font-mono text-[10px] uppercase tracking-broadcast-wider text-bp-ink-mute">{foot}</dd>
    </div>
  );
}

function SectionHeading({
  ord,
  kicker,
  title,
}: {
  ord: string;
  kicker: string;
  title: string;
}): React.ReactElement {
  return (
    <header className="flex items-end justify-between gap-6 border-b border-bp-hairline/60 pb-3">
      <div className="flex items-baseline gap-4">
        <span className="font-mono text-[10px] uppercase tracking-broadcast-wider text-bp-ink-mute">{ord}</span>
        <div>
          <div className="font-mono text-[10px] uppercase tracking-broadcast-wider text-bp-ink-mute">{kicker}</div>
          <h2 className="font-display text-2xl text-bp-ink sm:text-3xl">{title}</h2>
        </div>
      </div>
    </header>
  );
}

function RoundCell({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}): React.ReactElement {
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <span className="text-[9px] uppercase tracking-broadcast-wider text-bp-ink-mute">{label}</span>
      <span className={accent ? 'text-[12px] font-medium text-bp-ink' : 'text-[12px] text-bp-ink-soft'}>
        {numberOnly(value)}
      </span>
    </div>
  );
}

function numberOnly(p: number): string {
  if (!Number.isFinite(p)) return '–';
  const pct100 = p * 100;
  return pct100 >= 10 ? pct100.toFixed(0) : pct100.toFixed(1);
}
