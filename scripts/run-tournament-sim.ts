#!/usr/bin/env tsx
// =============================================================================
// scripts/run-tournament-sim.ts
// =============================================================================
// Phase 9C — Monte Carlo simulation of the 2026 tournament.
//
// Inputs (committed):
//   data/tournament/groups.json   — 12 groups × 4 teams (FIFA-style names)
//   data/tournament/results.json  — manually-edited played-match list
//
// Inputs (gitignored, downloaded once):
//   data/raw/international_results.csv — Phase 9A martj42 corpus
//
// Outputs:
//   stdout — title-odds table (top N) + per-group advancement + counts
//   data/tournament/sim-report.json — full JSON (gitignored)
//   src/data/tournament-sim.json   — UI contract (committed, --write-ui-json
//                                    + --model=confed only)
//
// Usage:
//   pnpm sim:tournament                        # default model=confed, n=10000, seed=42
//   pnpm sim:tournament --model=9b             # original Phase 9C (no confed correction)
//   pnpm sim:tournament --model=confed --n=20000 --seed=7
//   pnpm sim:tournament --top=30
//   pnpm sim:ui                                # writes the committed UI JSON
// =============================================================================

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FLAG_CODE_BY_SLUG } from '@/data/flagCodes';
import type {
  BracketR32Match,
  BracketSlot,
  GroupStanding,
  TeamGroupFinish,
  TeamOddsRow,
  TournamentSimData,
} from '@/data/tournament-sim.types';
import { parseResults } from '@/lib/data/sources/internationalResults/parseResults';
import {
  resolveNation,
} from '@/lib/data/sources/internationalResults/teamMap';
import {
  R32_MATCHES,
  R16_PAIRS,
  QF_PAIRS,
  SF_PAIRS,
  FINAL_PAIR,
  type SlotRef,
} from '@/lib/tournament/bracket';
import {
  fitOnce,
  makeEngine,
  modelStrength,
} from '@/lib/tournament/matchModel';
import {
  fitOnceConfed,
  makeEngineConfed,
  modelStrengthConfed,
} from '@/lib/tournament/matchModelConfed';
import { runMonteCarlo, titleTable, type PlayedResult } from '@/lib/tournament/simulate';
import { makeRNG } from '@/lib/utils/rng';

const CORPUS_PATH = resolve(process.cwd(), 'data', 'raw', 'international_results.csv');
const GROUPS_PATH = resolve(process.cwd(), 'data', 'tournament', 'groups.json');
const RESULTS_PATH = resolve(process.cwd(), 'data', 'tournament', 'results.json');
const REPORT_PATH = resolve(process.cwd(), 'data', 'tournament', 'sim-report.json');
const UI_JSON_PATH = resolve(process.cwd(), 'src', 'data', 'tournament-sim.json');

type GroupsFile = {
  groups: ReadonlyArray<{ group: string; teams: ReadonlyArray<string> }>;
};
type ResultsFile = {
  results: ReadonlyArray<PlayedResult>;
};

type ModelKind = '9b' | 'confed';
type Args = { model: ModelKind; n: number; seed: number; top: number; writeUiJson: boolean };

function parseArgs(): Args {
  let model: ModelKind = 'confed';
  let n = 10000;
  let seed = 42;
  let top = 20;
  let writeUiJson = false;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--model=')) {
      const v = arg.slice('--model='.length);
      if (v !== '9b' && v !== 'confed') {
        throw new Error(`sim:tournament: --model must be "9b" or "confed", got "${v}"`);
      }
      model = v;
    } else if (arg.startsWith('--n=')) n = Number(arg.slice('--n='.length));
    else if (arg.startsWith('--seed=')) seed = Number(arg.slice('--seed='.length));
    else if (arg.startsWith('--top=')) top = Number(arg.slice('--top='.length));
    else if (arg === '--write-ui-json') writeUiJson = true;
    else throw new Error(`sim:tournament: unknown argument "${arg}"`);
  }
  if (!Number.isInteger(n) || n < 1) throw new Error(`sim:tournament: --n must be a positive integer`);
  if (!Number.isFinite(seed)) throw new Error(`sim:tournament: --seed must be a number`);
  if (!Number.isInteger(top) || top < 1) throw new Error(`sim:tournament: --top must be a positive integer`);
  if (writeUiJson && model !== 'confed') {
    throw new Error(`sim:tournament: --write-ui-json requires --model=confed (the canonical model)`);
  }
  return { model, n, seed, top, writeUiJson };
}

function loadCorpus() {
  if (!existsSync(CORPUS_PATH)) {
    throw new Error(
      `sim:tournament: corpus not found at ${CORPUS_PATH}. Download with: ` +
        `curl -sSL -o data/raw/international_results.csv https://raw.githubusercontent.com/martj42/international_results/master/results.csv`,
    );
  }
  const { matches } = parseResults(readFileSync(CORPUS_PATH, 'utf-8'));
  return matches.map((m) => ({
    dateIso: m.dateIso,
    homeTeam: m.homeTeam,
    awayTeam: m.awayTeam,
    homeGoals: m.homeScore,
    awayGoals: m.awayScore,
    neutral: m.neutral,
  }));
}

function loadGroups(): GroupsFile {
  if (!existsSync(GROUPS_PATH)) throw new Error(`sim:tournament: groups file missing at ${GROUPS_PATH}`);
  return JSON.parse(readFileSync(GROUPS_PATH, 'utf-8')) as GroupsFile;
}

function loadResults(): ResultsFile {
  if (!existsSync(RESULTS_PATH)) throw new Error(`sim:tournament: results file missing at ${RESULTS_PATH}`);
  return JSON.parse(readFileSync(RESULTS_PATH, 'utf-8')) as ResultsFile;
}

function fmt(n: number, digits = 3): string {
  return Number.isFinite(n) ? n.toFixed(digits) : 'NaN';
}

function pct(p: number): string {
  return (p * 100).toFixed(1) + '%';
}

async function main(): Promise<void> {
  const args = parseArgs();
  const t0 = Date.now();

  process.stdout.write(`Phase 9C — tournament simulator\n`);
  process.stdout.write(`  model=${args.model}, N=${args.n}, seed=${args.seed}, top=${args.top}\n\n`);

  // ─── 1. Load configs + corpus ──────────────────────────────────────────
  const groupsFile = loadGroups();
  const resultsFile = loadResults();

  // Resolve every group team — hard-fail if any name is unmapped.
  // The 9A teamMap now accepts both corpus names and FIFA-style aliases.
  process.stdout.write(`  Resolving ${groupsFile.groups.length} groups × 4 teams = ${groupsFile.groups.length * 4} team slots …\n`);
  const allTeamSlugs: string[] = [];
  const tournamentToSlugDisplay: Record<string, string> = {};
  for (const grp of groupsFile.groups) {
    for (const name of grp.teams) {
      const t = resolveNation(name);
      const slugDisplay = t.displayName;
      tournamentToSlugDisplay[name] = slugDisplay;
      allTeamSlugs.push(slugDisplay);
    }
  }
  process.stdout.write(`  All 48 slots resolved\n\n`);

  // Map the user-facing names to the canonical displayName (the corpus
  // value) so the simulator uses the same string the model knows.
  const groupsForSim = groupsFile.groups.map((g) => ({
    group: g.group,
    teams: g.teams.map((n) => tournamentToSlugDisplay[n]),
  }));
  const playedForSim: PlayedResult[] = resultsFile.results.map((r) => ({
    stage: r.stage,
    home: tournamentToSlugDisplay[r.home] ?? r.home,
    away: tournamentToSlugDisplay[r.away] ?? r.away,
    homeGoals: r.homeGoals,
    awayGoals: r.awayGoals,
  }));

  // ─── 2. Fit DC once ────────────────────────────────────────────────────
  const corpus = loadCorpus();
  const tFit = Date.now();
  let engine;
  let strengthOf: (team: string) => number;
  let modelParamsForReport: Record<string, unknown>;
  if (args.model === 'confed') {
    process.stdout.write(`  Loading martj42 corpus + fitting Phase 9B.2 confed DC at ξ=0.0005, λ_reg=1 …\n`);
    const modelConfed = fitOnceConfed(corpus, allTeamSlugs);
    engine = makeEngineConfed(modelConfed);
    strengthOf = (t) => modelStrengthConfed(modelConfed, t);
    process.stdout.write(`    corpus matches: ${corpus.length}\n`);
    process.stdout.write(`    fit time:       ${((Date.now() - tFit) / 1000).toFixed(1)}s\n`);
    process.stdout.write(`    teams indexed:  ${modelConfed.teamIndex.size}\n`);
    process.stdout.write(`    fitted homeAdv: ${fmt(modelConfed.params.homeAdv, 4)}\n`);
    process.stdout.write(`    fitted ρ:       ${fmt(modelConfed.params.rho, 4)}\n`);
    process.stdout.write(`    fitted conf[]:  [${modelConfed.params.conf.map((c) => fmt(c, 3)).join(', ')}]\n\n`);
    modelParamsForReport = {
      modelKind: 'confed',
      mu: modelConfed.params.mu,
      homeAdv: modelConfed.params.homeAdv,
      rho: modelConfed.params.rho,
      conf: modelConfed.params.conf,
      nTeams: modelConfed.params.att.length,
    };
  } else {
    process.stdout.write(`  Loading martj42 corpus + fitting Phase 9B DC at ξ=0.0005, λ_reg=0.5 …\n`);
    const model = fitOnce(corpus, allTeamSlugs);
    engine = makeEngine(model);
    strengthOf = (t) => modelStrength(model, t);
    process.stdout.write(`    corpus matches: ${corpus.length}\n`);
    process.stdout.write(`    fit time:       ${((Date.now() - tFit) / 1000).toFixed(1)}s\n`);
    process.stdout.write(`    teams indexed:  ${model.teamIndex.size}\n`);
    process.stdout.write(`    fitted homeAdv: ${fmt(model.params.homeAdv, 4)}\n`);
    process.stdout.write(`    fitted ρ:       ${fmt(model.params.rho, 4)}\n\n`);
    modelParamsForReport = {
      modelKind: '9b',
      mu: model.params.mu,
      homeAdv: model.params.homeAdv,
      rho: model.params.rho,
      nTeams: model.params.att.length,
    };
  }

  // ─── 3. Run Monte Carlo ────────────────────────────────────────────────
  process.stdout.write(`  Running ${args.n} simulation passes …\n`);
  const tSim = Date.now();
  const rng = makeRNG(args.seed);
  const agg = runMonteCarlo(
    { groups: groupsForSim, playedResults: playedForSim, engine, rng },
    args.n,
  );
  process.stdout.write(`    sim time: ${((Date.now() - tSim) / 1000).toFixed(1)}s\n`);
  const fallbackRate = agg.thirdPlaceFallbackCount / args.n;
  process.stdout.write(
    `    third-place fallback: ${agg.thirdPlaceFallbackCount} / ${args.n} passes (${(fallbackRate * 100).toFixed(2)}%)\n\n`,
  );

  // ─── 4. Title-odds table ───────────────────────────────────────────────
  const titleRows = titleTable(agg, allTeamSlugs);

  process.stdout.write(`========== Title odds — top ${args.top} ==========\n\n`);
  process.stdout.write(`| rank | team                    | P(title) | P(final) | P(SF)  | P(QF)  | P(R16) |\n`);
  process.stdout.write(`|------|-------------------------|----------|----------|--------|--------|--------|\n`);
  for (let i = 0; i < Math.min(args.top, titleRows.length); i += 1) {
    const r = titleRows[i];
    process.stdout.write(
      `| ${String(i + 1).padStart(4)} | ${r.team.padEnd(23)} | ${pct(r.pTitle).padStart(8)} | ${pct(r.pFinal).padStart(8)} | ${pct(r.pSF).padStart(6)} | ${pct(r.pQF).padStart(6)} | ${pct(r.pR16).padStart(6)} |\n`,
    );
  }
  process.stdout.write(`\n`);

  // Title-prob sum sanity check
  const titleSum = titleRows.reduce((acc, r) => acc + r.pTitle, 0);
  process.stdout.write(`  Σ P(title) over all 48 teams = ${fmt(titleSum, 4)} (should be 1.0)\n\n`);

  // ─── 5. Per-group advancement tables ───────────────────────────────────
  process.stdout.write(`========== Per-group advancement (P(1st) / P(2nd) / P(3rd) / P(4th)) ==========\n\n`);
  for (const grp of groupsForSim) {
    const inner = agg.groupFinish.get(grp.group)!;
    process.stdout.write(`Group ${grp.group}:\n`);
    process.stdout.write(`| team                    | P(1st) | P(2nd) | P(3rd) | P(4th) | strength |\n`);
    process.stdout.write(`|-------------------------|--------|--------|--------|--------|----------|\n`);
    // Sort by P(1st) desc.
    const rows = grp.teams.map((t) => {
      const arr = inner.get(t)!;
      return {
        team: t,
        p1: arr[0] / args.n,
        p2: arr[1] / args.n,
        p3: arr[2] / args.n,
        p4: arr[3] / args.n,
        s: strengthOf(t),
      };
    });
    rows.sort((a, b) => b.p1 - a.p1);
    for (const r of rows) {
      process.stdout.write(
        `| ${r.team.padEnd(23)} | ${pct(r.p1).padStart(6)} | ${pct(r.p2).padStart(6)} | ${pct(r.p3).padStart(6)} | ${pct(r.p4).padStart(6)} | ${fmt(r.s, 3).padStart(8)} |\n`,
      );
    }
    process.stdout.write(`\n`);
  }

  // ─── 6. Write full JSON ────────────────────────────────────────────────
  mkdirSync(resolve(process.cwd(), 'data', 'tournament'), { recursive: true });
  writeFileSync(
    REPORT_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        args,
        runtimeMs: Date.now() - t0,
        modelParams: modelParamsForReport,
        titleRows,
        groupFinish: Object.fromEntries(
          [...agg.groupFinish.entries()].map(([g, inner]) => [
            g,
            Object.fromEntries(
              [...inner.entries()].map(([team, arr]) => [
                team,
                arr.map((c) => c / args.n),
              ]),
            ),
          ]),
        ),
        reachedR16: Object.fromEntries(
          [...agg.reachedR16.entries()].map(([t, c]) => [t, c / args.n]),
        ),
        reachedQF: Object.fromEntries(
          [...agg.reachedQF.entries()].map(([t, c]) => [t, c / args.n]),
        ),
        reachedSF: Object.fromEntries(
          [...agg.reachedSF.entries()].map(([t, c]) => [t, c / args.n]),
        ),
        reachedFinal: Object.fromEntries(
          [...agg.reachedFinal.entries()].map(([t, c]) => [t, c / args.n]),
        ),
        wonTitle: Object.fromEntries(
          [...agg.wonTitle.entries()].map(([t, c]) => [t, c / args.n]),
        ),
      },
      null,
      2,
    ) + '\n',
  );
  process.stdout.write(`Full report → ${REPORT_PATH}\n`);

  // ─── 7. UI JSON (committed contract for Phase 9D UI) ───────────────────
  if (args.writeUiJson) {
    process.stdout.write(`\n  Building committed UI JSON …\n`);
    const uiJson = buildUiJson({
      args,
      runtimeMs: Date.now() - t0,
      groupsForSim,
      playedForSim,
      titleRows,
      agg,
      thirdPlaceFallbackRate: fallbackRate,
    });
    mkdirSync(resolve(process.cwd(), 'src', 'data'), { recursive: true });
    writeFileSync(UI_JSON_PATH, JSON.stringify(uiJson, null, 2) + '\n');
    process.stdout.write(`  UI JSON → ${UI_JSON_PATH}\n`);
  }

  process.stdout.write(`\nTotal runtime: ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
}

// =============================================================================
// UI JSON builder — shapes the simulator aggregate into the Phase 9D contract.
// Pure transform; no model calls. The returned object satisfies
// `TournamentSimData` from src/data/tournament-sim.types.ts.
// =============================================================================

type Aggregate = {
  groupFinish: Map<string, Map<string, ReadonlyArray<number>>>;
};

function lookupIso2(slug: string, displayName: string): string {
  const code = FLAG_CODE_BY_SLUG[slug];
  if (!code) {
    throw new Error(
      `sim:tournament: no flag code mapped for slug "${slug}" (${displayName}). ` +
        `Add it to src/data/flagCodes.ts.`,
    );
  }
  return code;
}

function slotLabel(ref: SlotRef): string {
  if (ref.kind === 'winner') return `Winner Group ${ref.group}`;
  if (ref.kind === 'runnerUp') return `Runner-up Group ${ref.group}`;
  // Phase 9E: third-place slots carry the FIFA cluster (set of eligible
  // groups) instead of a fixed best-third rank.
  return `Best Third (${[...ref.cluster].join('/')})`;
}

function slotForJson(ref: SlotRef): BracketSlot {
  if (ref.kind === 'winner') return { kind: 'winner', group: ref.group, label: slotLabel(ref) };
  if (ref.kind === 'runnerUp') return { kind: 'runnerUp', group: ref.group, label: slotLabel(ref) };
  return { kind: 'thirdPlace', cluster: [...ref.cluster], label: slotLabel(ref) };
}

function buildUiJson(input: {
  args: Args;
  runtimeMs: number;
  groupsForSim: ReadonlyArray<{ group: string; teams: ReadonlyArray<string> }>;
  playedForSim: ReadonlyArray<PlayedResult>;
  titleRows: ReadonlyArray<{
    team: string;
    pTitle: number;
    pFinal: number;
    pSF: number;
    pQF: number;
    pR16: number;
  }>;
  agg: Aggregate;
  thirdPlaceFallbackRate: number;
}): TournamentSimData {
  const { args, runtimeMs, groupsForSim, playedForSim, titleRows, agg, thirdPlaceFallbackRate } =
    input;

  // Display name → group label index for fast lookup.
  const teamToGroup = new Map<string, string>();
  for (const grp of groupsForSim) {
    for (const t of grp.teams) teamToGroup.set(t, grp.group);
  }

  // Per-team odds rows (all 48). Resolve slug + ISO2 via teamMap + flag map.
  const teams: TeamOddsRow[] = titleRows.map((r) => {
    const nation = resolveNation(r.team);
    return {
      slug: nation.slug,
      displayName: nation.displayName,
      code: nation.code,
      iso2: lookupIso2(nation.slug, nation.displayName),
      confederation: nation.confederation,
      group: teamToGroup.get(r.team) ?? '?',
      pR16: r.pR16,
      pQF: r.pQF,
      pSF: r.pSF,
      pFinal: r.pFinal,
      pTitle: r.pTitle,
    };
  });

  // Per-group standings (12 groups, 4 teams each).
  const groups: GroupStanding[] = groupsForSim.map((grp) => {
    const inner = agg.groupFinish.get(grp.group)!;
    const rows: TeamGroupFinish[] = grp.teams.map((t) => {
      const arr = inner.get(t)!;
      const nation = resolveNation(t);
      return {
        slug: nation.slug,
        displayName: nation.displayName,
        code: nation.code,
        iso2: lookupIso2(nation.slug, nation.displayName),
        confederation: nation.confederation,
        p1st: arr[0] / args.n,
        p2nd: arr[1] / args.n,
        p3rd: arr[2] / args.n,
        p4th: arr[3] / args.n,
      };
    });
    rows.sort((a, b) => b.p1st - a.p1st);
    return { group: grp.group, teams: rows };
  });

  // Bracket structure with friendly labels.
  const r32: BracketR32Match[] = R32_MATCHES.map(([home, away], idx) => ({
    idx,
    home: slotForJson(home),
    away: slotForJson(away),
  }));

  const isLive = playedForSim.length > 0;
  const fallbackPct = (thirdPlaceFallbackRate * 100).toFixed(2);
  return {
    meta: {
      generatedAt: new Date().toISOString(),
      model: 'confed',
      seed: args.seed,
      n: args.n,
      runtimeMs,
      playedMatches: playedForSim.length,
      thirdPlaceFallbackRate,
      note:
        (isLive
          ? `Canonical live simulator run with ${playedForSim.length} match(es) pinned. `
          : 'Canonical pre-tournament simulator run. ') +
        `Phase 9E bracket: third-place fallback used in ${fallbackPct}% of passes. ` +
        'Reproduce with: pnpm sim:tournament --model=confed --seed=42 --n=10000 --write-ui-json',
    },
    teams,
    groups,
    bracket: {
      placeholderNote:
        'Representative knockout structure, not FIFA’s exact published 2026 pairings. ' +
        'See docs/20 §4.4.',
      r32,
      r16Pairs: R16_PAIRS,
      qfPairs: QF_PAIRS,
      sfPairs: SF_PAIRS,
      finalPair: FINAL_PAIR,
    },
  };
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`sim:tournament failed: ${message}\n`);
  process.exit(1);
});
