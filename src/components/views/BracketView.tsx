'use client';

import { AppShell } from '@/components';
import { useLang } from '@/components/LanguageProvider';
import { FlagChip } from '@/components/tournament/FlagChip';
import type {
  BracketR32Match,
  BracketSlot,
  GroupStanding,
  TeamGroupFinish,
  TournamentSimData,
} from '@/data/tournament-sim.types';
import { t, type Lang } from '@/i18n/dictionary';

function resolveSlotTeam(
  slot: BracketSlot,
  groups: ReadonlyArray<GroupStanding>,
): TeamGroupFinish | null {
  if (slot.kind === 'thirdPlace') return null;
  const grp = groups.find((g) => g.group === slot.group);
  if (!grp) return null;
  if (slot.kind === 'winner') {
    return [...grp.teams].sort((a, b) => b.p1st - a.p1st)[0] ?? null;
  }
  return [...grp.teams].sort((a, b) => b.p2nd - a.p2nd)[0] ?? null;
}

function slotLabel(slot: BracketSlot, lang: Lang): string {
  const d = t(lang).bracket;
  if (slot.kind === 'winner') return d.winnerGroup(slot.group);
  if (slot.kind === 'runnerUp') return d.runnerUpGroup(slot.group);
  return d.bestThird(slot.cluster);
}

export function BracketView({
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
              <span className="h-1.5 w-1.5 rounded-full bg-bp-sky" aria-hidden="true" />
              {d.bracket.kickerChip}
            </span>
            <span>{d.bracket.meta}</span>
          </div>
          <h1 className="font-display text-4xl leading-[1.05] tracking-broadcast-tight text-bp-ink sm:text-5xl">
            {d.bracket.headline}
          </h1>
          <p className="max-w-3xl text-base leading-relaxed text-bp-ink-soft">{d.bracket.sub}</p>
          <div className="rounded-2xl border border-bp-butter/60 bg-bp-butter/15 px-4 py-3 text-sm text-bp-ink-soft shadow-bp-chip">
            <strong className="font-semibold text-bp-ink">{d.bracket.placeholderBold}</strong>{' '}
            {d.bracket.placeholderBody}
          </div>
        </header>

        <RoundLeaderboard sim={sim} lang={lang} />

        <section className="bp-reveal mt-12" style={{ ['--bp-stagger' as string]: '180ms' }}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-2xl text-bp-ink">{d.bracket.treeHeadline}</h2>
            <span className="font-mono text-[10px] uppercase tracking-broadcast-wider text-bp-ink-mute">
              {d.bracket.treeMeta}
            </span>
          </div>
          <div className="grid gap-6 lg:grid-cols-5">
            <BracketColumn
              title={d.bracket.colR32}
              ord="01"
              n={sim.bracket.r32.length}
              items={sim.bracket.r32.map((m) => (
                <R32Cell key={m.idx} match={m} groups={sim.groups} lang={lang} />
              ))}
            />
            <BracketColumn
              title={d.bracket.colR16}
              ord="02"
              n={sim.bracket.r16Pairs.length}
              items={sim.bracket.r16Pairs.map((pair, idx) => (
                <PlaceholderCell
                  key={`r16-${idx}`}
                  idx={idx}
                  round={d.home.colR16}
                  feedRound="R32"
                  feed={pair}
                  lang={lang}
                />
              ))}
            />
            <BracketColumn
              title={d.bracket.colQF}
              ord="03"
              n={sim.bracket.qfPairs.length}
              items={sim.bracket.qfPairs.map((pair, idx) => (
                <PlaceholderCell
                  key={`qf-${idx}`}
                  idx={idx}
                  round={d.home.colQF}
                  feedRound={d.home.colR16}
                  feed={pair}
                  lang={lang}
                />
              ))}
            />
            <BracketColumn
              title={d.bracket.colSF}
              ord="04"
              n={sim.bracket.sfPairs.length}
              items={sim.bracket.sfPairs.map((pair, idx) => (
                <PlaceholderCell
                  key={`sf-${idx}`}
                  idx={idx}
                  round={d.home.colSF}
                  feedRound={d.home.colQF}
                  feed={pair}
                  lang={lang}
                />
              ))}
            />
            <BracketColumn
              title={d.bracket.colFinal}
              ord="05"
              n={1}
              items={[
                <PlaceholderCell
                  key="final"
                  idx={0}
                  round={d.home.colF}
                  feedRound={d.home.colSF}
                  feed={sim.bracket.finalPair}
                  lang={lang}
                />,
              ]}
            />
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function RoundLeaderboard({
  sim,
  lang,
}: {
  sim: TournamentSimData;
  lang: Lang;
}): React.ReactElement {
  const d = t(lang).bracket;
  const top = (key: 'pR16' | 'pQF' | 'pSF' | 'pFinal' | 'pTitle') =>
    [...sim.teams].sort((a, b) => b[key] - a[key]).slice(0, 5);
  const cols: Array<{ key: 'pR16' | 'pQF' | 'pSF' | 'pFinal' | 'pTitle'; label: string }> = [
    { key: 'pR16', label: d.reachR16 },
    { key: 'pQF', label: d.reachQF },
    { key: 'pSF', label: d.reachSF },
    { key: 'pFinal', label: d.reachFinal },
    { key: 'pTitle', label: d.winTitle },
  ];
  return (
    <section className="bp-reveal mt-8" style={{ ['--bp-stagger' as string]: '120ms' }}>
      <h2 className="mb-4 font-display text-2xl text-bp-ink">{d.leaderHeadline}</h2>
      <div className="grid gap-4 lg:grid-cols-5">
        {cols.map((c) => (
          <div
            key={c.key}
            className="rounded-2xl border border-bp-hairline/60 bg-bp-paper p-4 shadow-bp-panel"
          >
            <div className="font-mono text-[10px] uppercase tracking-broadcast-wider text-bp-ink-mute">{c.label}</div>
            <ol className="mt-3 space-y-2">
              {top(c.key).map((tm, i) => (
                <li key={`${c.key}-${tm.slug}`} className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="font-mono text-[10px] text-bp-ink-mute">{i + 1}</span>
                    <FlagChip code={tm.iso2} displayName={tm.displayName} size={18} />
                    <span className="truncate font-display text-sm text-bp-ink">{tm.displayName}</span>
                  </div>
                  <span className="font-mono text-xs text-bp-ink-soft">{(tm[c.key] * 100).toFixed(1)}%</span>
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
      <header className="flex items-start justify-between gap-2 border-b border-bp-hairline/60 pb-2">
        <div className="min-w-0 flex-1">
          <span className="font-mono text-[9px] uppercase tracking-broadcast-wider text-bp-ink-mute">{ord}</span>
          <h3 className="font-display text-base leading-tight text-bp-ink break-words">{title}</h3>
        </div>
        <span className="mt-2 font-mono text-[10px] uppercase tracking-broadcast-wider text-bp-ink-mute">{n}</span>
      </header>
      <div className="flex flex-col gap-3">{items}</div>
    </div>
  );
}

function R32Cell({
  match,
  groups,
  lang,
}: {
  match: BracketR32Match;
  groups: ReadonlyArray<GroupStanding>;
  lang: Lang;
}): React.ReactElement {
  const d = t(lang).bracket;
  return (
    <div className="rounded-xl border border-bp-hairline/60 bg-bp-paper p-3 shadow-bp-chip">
      <div className="flex items-center justify-between text-[9px] font-mono uppercase tracking-broadcast-wider text-bp-ink-mute">
        <span>{d.r32Cell(String(match.idx + 1).padStart(2, '0'))}</span>
      </div>
      <div className="mt-2 space-y-1.5">
        <SlotRow slot={match.home} groups={groups} lang={lang} />
        <div className="font-mono text-[9px] uppercase tracking-broadcast-wider text-bp-ink-mute">{d.vs}</div>
        <SlotRow slot={match.away} groups={groups} lang={lang} />
      </div>
    </div>
  );
}

function SlotRow({
  slot,
  groups,
  lang,
}: {
  slot: BracketSlot;
  groups: ReadonlyArray<GroupStanding>;
  lang: Lang;
}): React.ReactElement {
  const team = resolveSlotTeam(slot, groups);
  const label = slotLabel(slot, lang);
  return (
    <div className="flex items-center gap-2">
      {team ? (
        <FlagChip code={team.iso2} displayName={team.displayName} size={18} />
      ) : (
        <span className="inline-block h-[14px] w-[18px] rounded bg-bp-hairline" aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-sm text-bp-ink">{team ? team.displayName : label}</div>
        <div className="truncate font-mono text-[9px] uppercase tracking-broadcast-wider text-bp-ink-mute">
          {label}
        </div>
      </div>
    </div>
  );
}

function PlaceholderCell({
  idx,
  round,
  feedRound,
  feed,
  lang,
}: {
  idx: number;
  round: string;
  feedRound: string;
  feed: readonly [number, number];
  lang: Lang;
}): React.ReactElement {
  const d = t(lang).bracket;
  return (
    <div className="rounded-xl border border-bp-hairline/60 bg-bp-paper/85 p-3 shadow-bp-chip">
      <div className="font-mono text-[9px] uppercase tracking-broadcast-wider text-bp-ink-mute">
        {d.roundCell(round, String(idx + 1).padStart(2, '0'))}
      </div>
      <div className="mt-1.5 space-y-1.5 text-sm text-bp-ink-soft">
        <div className="font-display text-bp-ink">
          {d.winnerFeed(feedRound, String(feed[0] + 1).padStart(2, '0'))}
        </div>
        <div className="font-mono text-[9px] uppercase tracking-broadcast-wider text-bp-ink-mute">{d.vs}</div>
        <div className="font-display text-bp-ink">
          {d.winnerFeed(feedRound, String(feed[1] + 1).padStart(2, '0'))}
        </div>
      </div>
    </div>
  );
}
