'use client';

import { AppShell } from '@/components';
import { useLang } from '@/components/LanguageProvider';
import { ConfederationTag } from '@/components/tournament/ConfederationTag';
import { FlagChip } from '@/components/tournament/FlagChip';
import { GroupAdvancementBar } from '@/components/tournament/GroupAdvancementBar';
import type { TournamentSimData } from '@/data/tournament-sim.types';
import { t, type Lang } from '@/i18n/dictionary';

function pct(p: number, digits = 1): string {
  return `${(p * 100).toFixed(digits)}%`;
}

function fmtN(n: number, lang: Lang): string {
  return n.toLocaleString(lang === 'es' ? 'es-ES' : 'en-GB');
}

export function GroupsView({
  sim,
  modelVersion,
}: {
  readonly sim: TournamentSimData;
  readonly modelVersion: string;
}): React.ReactElement {
  const { lang } = useLang();
  const d = t(lang);

  return (
    <AppShell modelVersion={modelVersion}>
      <div className="mx-auto max-w-7xl px-6 pb-16 pt-10 sm:pt-14">
        <header
          className="bp-reveal flex flex-col gap-3 border-b border-bp-hairline/60 pb-6"
          style={{ ['--bp-stagger' as string]: '40ms' }}
        >
          <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] uppercase tracking-broadcast-wider text-bp-ink-mute">
            <span className="inline-flex items-center gap-2 rounded-full bg-bp-cream px-3 py-1 text-bp-ink-soft shadow-bp-chip">
              <span className="h-1.5 w-1.5 rounded-full bg-bp-sage" aria-hidden="true" />
              {d.groups.kickerChip}
            </span>
            <span>{d.groups.meta(sim.groups.length)}</span>
            <span>·</span>
            <span>{d.groups.metaAdvance}</span>
          </div>
          <h1 className="font-display text-4xl leading-[1.05] tracking-broadcast-tight text-bp-ink sm:text-5xl">
            {d.groups.headline}
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-bp-ink-soft">
            {d.groups.sub(fmtN(sim.meta.n, lang))}
          </p>
        </header>

        <section className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {sim.groups.map((group, gIdx) => (
            <article
              key={group.group}
              className="bp-reveal flex flex-col gap-4 rounded-2xl border border-bp-hairline/60 bg-bp-paper p-5 shadow-bp-panel"
              style={{ ['--bp-stagger' as string]: `${80 + gIdx * 40}ms` }}
            >
              <header className="flex items-center justify-between border-b border-bp-hairline/60 pb-3">
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-[10px] uppercase tracking-broadcast-wider text-bp-ink-mute">
                    {d.groups.groupLabelKicker}
                  </span>
                  <span className="font-display text-3xl tracking-broadcast-tight text-bp-ink">{group.group}</span>
                </div>
                <span className="font-mono text-[10px] uppercase tracking-broadcast-wider text-bp-ink-mute">
                  {d.groups.advHeader}
                </span>
              </header>
              <ol className="space-y-4">
                {group.teams.map((team) => {
                  const pAdvance = team.p1st + team.p2nd;
                  return (
                    <li key={team.slug} className="space-y-2">
                      <div className="flex items-center gap-3">
                        <FlagChip code={team.iso2} displayName={team.displayName} size={26} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-display text-base text-bp-ink">{team.displayName}</div>
                          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-broadcast-wider text-bp-ink-mute">
                            <ConfederationTag confederation={team.confederation} />
                            <span>{d.groups.advBadge(pct(pAdvance, 0))}</span>
                          </div>
                        </div>
                      </div>
                      <GroupAdvancementBar
                        p1st={team.p1st}
                        p2nd={team.p2nd}
                        p3rd={team.p3rd}
                        p4th={team.p4th}
                        label={d.groups.aria(
                          team.displayName,
                          pct(team.p1st),
                          pct(team.p2nd),
                          pct(team.p3rd),
                          pct(team.p4th),
                        )}
                      />
                      <div className="grid grid-cols-4 gap-1 font-mono text-[10px] text-bp-ink-soft">
                        <Cell label={d.groups.pos1st} value={team.p1st} accent />
                        <Cell label={d.groups.pos2nd} value={team.p2nd} />
                        <Cell label={d.groups.pos3rd} value={team.p3rd} />
                        <Cell label={d.groups.pos4th} value={team.p4th} />
                      </div>
                    </li>
                  );
                })}
              </ol>
            </article>
          ))}
        </section>
      </div>
    </AppShell>
  );
}

function Cell({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}): React.ReactElement {
  return (
    <div className="flex flex-col items-start rounded-md bg-bp-cream/60 px-1.5 py-1">
      <span className="text-[9px] uppercase tracking-broadcast-wider text-bp-ink-mute">{label}</span>
      <span className={accent ? 'text-bp-ink' : 'text-bp-ink-soft'}>{pct(value, 0)}</span>
    </div>
  );
}
