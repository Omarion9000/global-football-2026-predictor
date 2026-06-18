import { AppShell } from '@/components';
import { FlagChip } from '@/components/tournament/FlagChip';
import { getTournamentSim } from '@/data/loadTournamentSim';
import { MODEL_VERSION } from '@/lib/model';
import type {
  BracketR32Match,
  BracketSlot,
  GroupStanding,
  TeamGroupFinish,
  TournamentSimData,
} from '@/data/tournament-sim.types';

export const metadata = {
  title: 'Bracket · Global Football 2026 Predictor',
};

/** For a winner/runner-up slot, look up the team most likely to occupy it.
 *  Third-place slots return null because the simulator does not currently
 *  track per-slot best-third assignments. */
function resolveSlotTeam(slot: BracketSlot, groups: ReadonlyArray<GroupStanding>): TeamGroupFinish | null {
  if (slot.kind === 'thirdPlace') return null;
  const grp = groups.find((g) => g.group === slot.group);
  if (!grp) return null;
  if (slot.kind === 'winner') {
    return [...grp.teams].sort((a, b) => b.p1st - a.p1st)[0] ?? null;
  }
  return [...grp.teams].sort((a, b) => b.p2nd - a.p2nd)[0] ?? null;
}

export default function BracketPage(): React.ReactElement {
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
              <span className="h-1.5 w-1.5 rounded-full bg-bp-sky" aria-hidden="true" />
              Knockout phase
            </span>
            <span>R32 → R16 → QF → SF → Final</span>
          </div>
          <h1 className="font-display text-4xl leading-[1.05] tracking-broadcast-tight text-bp-ink sm:text-5xl">
            Knockout bracket
          </h1>
          <p className="max-w-3xl text-base leading-relaxed text-bp-ink-soft">
            A representative 32-team knockout tree. The R32 cells show the slot
            each pair feeds from, plus the team most likely to occupy
            winner / runner-up slots. Third-place slots are not annotated with a
            team because the simulator does not track per-slot best-third
            assignments — only that 8 of the 12 third-placed teams advance.
          </p>
          <div className="rounded-2xl border border-bp-butter/60 bg-bp-butter/15 px-4 py-3 text-sm text-bp-ink-soft shadow-bp-chip">
            <strong className="font-semibold text-bp-ink">Placeholder pairings.</strong>{' '}
            {sim.bracket.placeholderNote}
          </div>
        </header>

        <RoundLeaderboard sim={sim} />

        <section className="bp-reveal mt-12" style={{ ['--bp-stagger' as string]: '180ms' }}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-2xl text-bp-ink">Tree</h2>
            <span className="font-mono text-[10px] uppercase tracking-broadcast-wider text-bp-ink-mute">
              16 → 8 → 4 → 2 → 1
            </span>
          </div>
          <div className="grid gap-6 lg:grid-cols-5">
            <BracketColumn
              title="Round of 32"
              ord="01"
              n={sim.bracket.r32.length}
              items={sim.bracket.r32.map((m) => (
                <R32Cell key={m.idx} match={m} groups={sim.groups} />
              ))}
            />
            <BracketColumn
              title="Round of 16"
              ord="02"
              n={sim.bracket.r16Pairs.length}
              items={sim.bracket.r16Pairs.map((pair, idx) => (
                <PlaceholderCell key={`r16-${idx}`} idx={idx} round="R16" feedRound="R32" feed={pair} />
              ))}
            />
            <BracketColumn
              title="Quarter-final"
              ord="03"
              n={sim.bracket.qfPairs.length}
              items={sim.bracket.qfPairs.map((pair, idx) => (
                <PlaceholderCell key={`qf-${idx}`} idx={idx} round="QF" feedRound="R16" feed={pair} />
              ))}
            />
            <BracketColumn
              title="Semi-final"
              ord="04"
              n={sim.bracket.sfPairs.length}
              items={sim.bracket.sfPairs.map((pair, idx) => (
                <PlaceholderCell key={`sf-${idx}`} idx={idx} round="SF" feedRound="QF" feed={pair} />
              ))}
            />
            <BracketColumn
              title="Final"
              ord="05"
              n={1}
              items={[
                <PlaceholderCell
                  key="final"
                  idx={0}
                  round="F"
                  feedRound="SF"
                  feed={sim.bracket.finalPair}
                />,
              ]}
            />
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function RoundLeaderboard({ sim }: { sim: TournamentSimData }): React.ReactElement {
  const top = (key: 'pR16' | 'pQF' | 'pSF' | 'pFinal' | 'pTitle') =>
    [...sim.teams].sort((a, b) => b[key] - a[key]).slice(0, 5);
  const cols: Array<{ key: 'pR16' | 'pQF' | 'pSF' | 'pFinal' | 'pTitle'; label: string }> = [
    { key: 'pR16', label: 'Reach R16' },
    { key: 'pQF', label: 'Reach QF' },
    { key: 'pSF', label: 'Reach SF' },
    { key: 'pFinal', label: 'Reach Final' },
    { key: 'pTitle', label: 'Win the title' },
  ];
  return (
    <section className="bp-reveal mt-8" style={{ ['--bp-stagger' as string]: '120ms' }}>
      <h2 className="mb-4 font-display text-2xl text-bp-ink">Most likely qualifiers, by round</h2>
      <div className="grid gap-4 lg:grid-cols-5">
        {cols.map((c) => (
          <div
            key={c.key}
            className="rounded-2xl border border-bp-hairline/60 bg-bp-paper p-4 shadow-bp-panel"
          >
            <div className="font-mono text-[10px] uppercase tracking-broadcast-wider text-bp-ink-mute">{c.label}</div>
            <ol className="mt-3 space-y-2">
              {top(c.key).map((t, i) => (
                <li key={`${c.key}-${t.slug}`} className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="font-mono text-[10px] text-bp-ink-mute">{i + 1}</span>
                    <FlagChip code={t.iso2} displayName={t.displayName} size={18} />
                    <span className="truncate font-display text-sm text-bp-ink">{t.displayName}</span>
                  </div>
                  <span className="font-mono text-xs text-bp-ink-soft">{(t[c.key] * 100).toFixed(1)}%</span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
}

function BracketColumn({
  title,
  ord,
  n,
  items,
}: {
  title: string;
  ord: string;
  n: number;
  items: React.ReactNode[];
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-3">
      <header className="flex items-baseline justify-between border-b border-bp-hairline/60 pb-2">
        <div>
          <span className="font-mono text-[9px] uppercase tracking-broadcast-wider text-bp-ink-mute">{ord}</span>
          <h3 className="font-display text-base text-bp-ink">{title}</h3>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-broadcast-wider text-bp-ink-mute">{n}</span>
      </header>
      <div className="flex flex-col gap-3">{items}</div>
    </div>
  );
}

function R32Cell({
  match,
  groups,
}: {
  match: BracketR32Match;
  groups: ReadonlyArray<GroupStanding>;
}): React.ReactElement {
  return (
    <div className="rounded-xl border border-bp-hairline/60 bg-bp-paper p-3 shadow-bp-chip">
      <div className="flex items-center justify-between text-[9px] font-mono uppercase tracking-broadcast-wider text-bp-ink-mute">
        <span>{`R32 · M${String(match.idx + 1).padStart(2, '0')}`}</span>
      </div>
      <div className="mt-2 space-y-1.5">
        <SlotRow slot={match.home} groups={groups} />
        <div className="font-mono text-[9px] uppercase tracking-broadcast-wider text-bp-ink-mute">vs</div>
        <SlotRow slot={match.away} groups={groups} />
      </div>
    </div>
  );
}

function SlotRow({
  slot,
  groups,
}: {
  slot: BracketSlot;
  groups: ReadonlyArray<GroupStanding>;
}): React.ReactElement {
  const team = resolveSlotTeam(slot, groups);
  return (
    <div className="flex items-center gap-2">
      {team ? <FlagChip code={team.iso2} displayName={team.displayName} size={18} /> : (
        <span className="inline-block h-[14px] w-[18px] rounded bg-bp-hairline" aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-sm text-bp-ink">{team ? team.displayName : slot.label}</div>
        <div className="truncate font-mono text-[9px] uppercase tracking-broadcast-wider text-bp-ink-mute">{slot.label}</div>
      </div>
    </div>
  );
}

function PlaceholderCell({
  idx,
  round,
  feedRound,
  feed,
}: {
  idx: number;
  round: string;
  feedRound: string;
  feed: readonly [number, number];
}): React.ReactElement {
  return (
    <div className="rounded-xl border border-bp-hairline/60 bg-bp-paper/85 p-3 shadow-bp-chip">
      <div className="font-mono text-[9px] uppercase tracking-broadcast-wider text-bp-ink-mute">
        {`${round} · M${String(idx + 1).padStart(2, '0')}`}
      </div>
      <div className="mt-1.5 space-y-1.5 text-sm text-bp-ink-soft">
        <div className="font-display text-bp-ink">
          {`Winner ${feedRound}·${String(feed[0] + 1).padStart(2, '0')}`}
        </div>
        <div className="font-mono text-[9px] uppercase tracking-broadcast-wider text-bp-ink-mute">vs</div>
        <div className="font-display text-bp-ink">
          {`Winner ${feedRound}·${String(feed[1] + 1).padStart(2, '0')}`}
        </div>
      </div>
    </div>
  );
}
