import { AppShell } from '@/components';
import { ConfederationTag } from '@/components/tournament/ConfederationTag';
import { FlagChip } from '@/components/tournament/FlagChip';
import { GroupAdvancementBar } from '@/components/tournament/GroupAdvancementBar';
import { getTournamentSim } from '@/data/loadTournamentSim';
import { MODEL_VERSION } from '@/lib/model';

export const metadata = {
  title: 'Group stage · Global Football 2026 Predictor',
};

function pct(p: number, digits = 1): string {
  return `${(p * 100).toFixed(digits)}%`;
}

export default function GroupsPage(): React.ReactElement {
  const sim = getTournamentSim();

  return (
    <AppShell modelVersion={MODEL_VERSION}>
      <div className="mx-auto max-w-7xl px-6 pb-16 pt-10 sm:pt-14">
        <header
          className="bp-reveal flex flex-col gap-3 border-b border-bp-hairline/60 pb-6"
          style={{ ['--bp-stagger' as string]: '40ms' }}
        >
          <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] uppercase tracking-broadcast-wider text-bp-ink-mute">
            <span className="inline-flex items-center gap-2 rounded-full bg-bp-cream px-3 py-1 text-bp-ink-soft shadow-bp-chip">
              <span className="h-1.5 w-1.5 rounded-full bg-bp-sage" aria-hidden="true" />
              Group stage
            </span>
            <span>{sim.groups.length} groups · 4 teams · 6 matches each</span>
            <span>·</span>
            <span>Top 2 + 8 best thirds advance</span>
          </div>
          <h1 className="font-display text-4xl leading-[1.05] tracking-broadcast-tight text-bp-ink sm:text-5xl">
            Group stage advancement
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-bp-ink-soft">
            For each of the 12 groups, the probability that each team finishes
            1st, 2nd, 3rd, or 4th across {sim.meta.n.toLocaleString()} Monte
            Carlo passes. Sage fills 1st, butter 2nd, peach 3rd, bone 4th.
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
                  <span className="font-mono text-[10px] uppercase tracking-broadcast-wider text-bp-ink-mute">Group</span>
                  <span className="font-display text-3xl tracking-broadcast-tight text-bp-ink">{group.group}</span>
                </div>
                <span className="font-mono text-[10px] uppercase tracking-broadcast-wider text-bp-ink-mute">
                  Adv. prob
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
                            <span>Adv {pct(pAdvance, 0)}</span>
                          </div>
                        </div>
                      </div>
                      <GroupAdvancementBar
                        p1st={team.p1st}
                        p2nd={team.p2nd}
                        p3rd={team.p3rd}
                        p4th={team.p4th}
                        label={`${team.displayName} — 1st ${pct(team.p1st)}, 2nd ${pct(team.p2nd)}, 3rd ${pct(team.p3rd)}, 4th ${pct(team.p4th)}`}
                      />
                      <div className="grid grid-cols-4 gap-1 font-mono text-[10px] text-bp-ink-soft">
                        <Cell label="1st" value={team.p1st} accent />
                        <Cell label="2nd" value={team.p2nd} />
                        <Cell label="3rd" value={team.p3rd} />
                        <Cell label="4th" value={team.p4th} />
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
