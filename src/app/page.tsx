import { AppShell } from '@/components';
import { ConfederationTag } from '@/components/tournament/ConfederationTag';
import { FlagChip } from '@/components/tournament/FlagChip';
import { MethodologyPanel } from '@/components/tournament/MethodologyPanel';
import { ProbabilityStrip } from '@/components/tournament/ProbabilityStrip';
import { getTournamentSim } from '@/data/loadTournamentSim';
import { MODEL_VERSION } from '@/lib/model';

export const metadata = {
  title: 'Title probabilities · Global Football 2026 Predictor',
};

function pct(p: number, digits = 1): string {
  return `${(p * 100).toFixed(digits)}%`;
}

function fmtGenerated(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });
}

export default function HomePage(): React.ReactElement {
  const sim = getTournamentSim();
  const top6 = sim.teams.slice(0, 6);
  const rest = sim.teams.slice(6);

  return (
    <AppShell modelVersion={MODEL_VERSION}>
      <div className="mx-auto max-w-7xl px-6 pb-16 pt-10 sm:pt-14">
        <section
          className="bp-reveal grid gap-10 lg:grid-cols-[1.05fr_0.95fr]"
          style={{ ['--bp-stagger' as string]: '60ms' }}
        >
          <div>
            <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] uppercase tracking-broadcast-wider text-bp-ink-mute">
              <span className="inline-flex items-center gap-2 rounded-full bg-bp-cream px-3 py-1 text-bp-ink-soft shadow-bp-chip">
                <span className="h-1.5 w-1.5 rounded-full bg-bp-peach" aria-hidden="true" />
                Pre-tournament prediction
              </span>
              <span>Run {fmtGenerated(sim.meta.generatedAt)} UTC</span>
              <span>·</span>
              <span>{sim.meta.n.toLocaleString()} Monte Carlo passes</span>
              <span>·</span>
              <span>Seed {sim.meta.seed}</span>
            </div>
            <h1 className="mt-5 font-display text-4xl leading-[1.05] tracking-broadcast-tight text-bp-ink sm:text-5xl">
              Who lifts the trophy in the
              <br className="hidden sm:block" />
              <span className="bg-gradient-to-r from-bp-sky-deep via-bp-sage-deep to-bp-butter-deep bg-clip-text text-transparent">
                2026 tournament?
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-bp-ink-soft">
              An offline Monte Carlo simulator runs the entire knockout draw{' '}
              <span className="font-mono text-sm text-bp-ink">{sim.meta.n.toLocaleString()}</span> times using a national-team
              Dixon-Coles model with a confederation-strength correction. These
              numbers are <em className="font-medium not-italic text-bp-ink">probabilities</em>, not forecasts —
              the next page reload tells the same story with the same seed.
            </p>
          </div>

          <dl className="grid grid-cols-3 gap-3 self-end">
            <StatCell kicker="Run model" value="Confed DC" foot="Phase 9B.2" />
            <StatCell kicker="Teams modelled" value={`${sim.teams.length}`} foot="12 groups × 4" />
            <StatCell
              kicker="Σ P(title)"
              value={pct(sumTitles(sim.teams.map((t) => t.pTitle)), 2)}
              foot="Sanity check"
            />
          </dl>
        </section>

        <section className="mt-12">
          <SectionHeading ord="01" kicker="Most likely champions" title="Top six by title probability" />
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
                    Rank {String(i + 1).padStart(2, '0')}
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
                      Group {team.group}
                    </div>
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-broadcast-wider text-bp-ink-mute">
                    P(title)
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
                    label={`${team.displayName} round-by-round`}
                  />
                  <div
                    className="grid grid-cols-5 gap-3 border-t border-bp-hairline/50 pt-3 font-mono"
                    aria-label="Round-by-round probability, percent"
                  >
                    <RoundCell label="R16" value={team.pR16} />
                    <RoundCell label="QF" value={team.pQF} />
                    <RoundCell label="SF" value={team.pSF} />
                    <RoundCell label="F" value={team.pFinal} />
                    <RoundCell label="W" value={team.pTitle} accent />
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-14">
          <SectionHeading ord="02" kicker="Ranks 7 — 48" title="Full title probability table" />
          <div className="mt-6 overflow-hidden rounded-2xl border border-bp-hairline/60 bg-bp-paper shadow-bp-panel">
            <table className="min-w-full text-sm">
              <caption className="sr-only">All 48 teams ranked by probability of winning the title.</caption>
              <thead>
                <tr className="border-b border-bp-hairline/60 bg-bp-cream/70 text-left font-mono text-[10px] uppercase tracking-broadcast-wider text-bp-ink-soft">
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Team</th>
                  <th className="px-3 py-3">Conf</th>
                  <th className="px-3 py-3">Grp</th>
                  <th className="px-4 py-3">Round-by-round</th>
                  <th className="px-3 py-3 text-right">R16</th>
                  <th className="px-3 py-3 text-right">QF</th>
                  <th className="px-3 py-3 text-right">SF</th>
                  <th className="px-3 py-3 text-right">F</th>
                  <th className="px-4 py-3 text-right">Title</th>
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
                      <td className="px-4 py-3 font-mono text-xs text-bp-ink-mute">{String(rank).padStart(2, '0')}</td>
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
                            label={`${team.displayName} round-by-round`}
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
          <SectionHeading ord="03" kicker="Methodology" title="How this works (and where it breaks)" />
          <div className="mt-6">
            <MethodologyPanel />
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function sumTitles(values: ReadonlyArray<number>): number {
  let s = 0;
  for (const v of values) s += v;
  return s;
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
  // No background chip: each value sits in its own grid column with center
  // alignment so the % is dropped and the digits don't collide with the
  // neighbour column. The label row reads as R16/QF/SF/F/W; the value row
  // is just tabular numbers. The strip above carries the visual encoding.
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <span className="text-[9px] uppercase tracking-broadcast-wider text-bp-ink-mute">{label}</span>
      <span className={accent ? 'text-[12px] font-medium text-bp-ink' : 'text-[12px] text-bp-ink-soft'}>
        {numberOnly(value)}
      </span>
    </div>
  );
}

/** Format a probability in [0,1] as a percent number with no `%` sign. Used
 *  inside the top-6 round-by-round mini-row where the column headers
 *  (R16/QF/SF/F/W) already imply units. */
function numberOnly(p: number): string {
  if (!Number.isFinite(p)) return '–';
  const pct100 = p * 100;
  // 1 decimal when below 10, 0 decimals at 10+ to keep the strip compact.
  return pct100 >= 10 ? pct100.toFixed(0) : pct100.toFixed(1);
}
